/**
 * POST /api/ai/chat — the conversational farming assistant.
 * GET  /api/ai/chat?sessionId=… — replay a saved conversation (auth required).
 *
 * Replaces the old rule-based `server/services/aiService.js`, which matched
 * keywords against a hard-coded reply table and never called a model.
 *
 * Auth is OPTIONAL: an anonymous visitor can ask a question, but only a
 * signed-in farmer gets their profile injected into the prompt and their
 * conversation persisted to `AIConversation`.
 */

import { connectDB } from "@/lib/db"
import { ok, fail, handler, readJson, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import AIConversation from "@/lib/models/AIConversation"
import { generateChat, type ChatTurn } from "@/lib/services/geminiService"
import { buildChatSystemPrompt, SUGGESTED_QUESTIONS, WELCOME_MESSAGE, type LanguageCode } from "@/lib/prompts"
import { aiFailure, cleanText, optionalAuth, requireGemini, resolveLanguage, toFarmerProfile } from "../_shared"

export const dynamic = "force-dynamic"
// Runtime budget: `vercel.json` grants `app/api/ai/**` a 60s maxDuration, which
// this route needs — a thinking-model turn can run well past Vercel's ~10s default.

const MAX_MESSAGE_CHARS = 2000
/**
 * `gemini-flash-latest` spends part of this budget on internal reasoning, so it
 * has to be well above the ~250 words we actually want back (see the note in
 * lib/services/geminiService.ts).
 */
const MAX_OUTPUT_TOKENS = 1800
/** Keep stored conversations bounded; Mongo documents are capped at 16 MB. */
const MAX_STORED_MESSAGES = 100

/**
 * Normalises the history the browser sends. Accepts both the shape the Gemini
 * SDK uses (`role: "user" | "model"`) and the shape the existing UI stores
 * (`sender: "user" | "assistant"`, `text`).
 */
function normaliseHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return []
  const turns: ChatTurn[] = []
  for (const item of raw.slice(-24)) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const text = cleanText(record.text ?? record.content ?? record.message, 4000)
    if (!text) continue
    const rawRole = String(record.role ?? record.sender ?? "user").toLowerCase()
    const role: ChatTurn["role"] = rawRole === "model" || rawRole === "assistant" || rawRole === "ai" ? "model" : "user"
    turns.push({ role, text })
  }
  return turns
}

export const POST = handler(async (req: Request) => {
  const notConfigured = requireGemini()
  if (notConfigured) return notConfigured

  const body = await readJson(req)
  const message = cleanText(body.message ?? body.text ?? body.query, MAX_MESSAGE_CHARS)
  if (!message) {
    return fail("Please type a question for the farming assistant.", 400)
  }

  // Auth is optional here — an unauthenticated visitor still gets an answer.
  const user = await optionalAuth(req)
  const profile = toFarmerProfile(user)

  const language = resolveLanguage(body.language, message, user?.preferredLanguage)

  let history = normaliseHistory(body.history ?? body.messages)

  // A signed-in farmer with a sessionId gets server-side memory, so the phone
  // does not have to hold (or re-upload) the whole conversation.
  const sessionId = cleanText(body.sessionId, 100) || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  let conversation: any = null

  if (user) {
    await connectDB()
    conversation = await AIConversation.findOne({ userId: user._id, sessionId })
    if (conversation && history.length === 0) {
      history = (conversation.messages ?? []).slice(-12).map((m: any) => ({
        role: m.sender === "assistant" ? "model" : "user",
        text: String(m.text ?? ""),
      }))
    }
  }

  let result
  try {
    result = await generateChat({
      system: buildChatSystemPrompt({ language, profile }),
      message,
      history,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.6,
    })
  } catch (error) {
    return aiFailure(error)
  }

  // Persist after a successful answer so a failed call never writes a dangling
  // user message into the transcript.
  let saved = false
  if (user) {
    try {
      if (!conversation) {
        conversation = await AIConversation.create({
          userId: user._id,
          sessionId,
          messages: [],
          context: {
            preferences: { language: language === "auto" ? "en" : language },
            userProfile: {
              primaryCrops: profile?.crops ?? [],
              location: { state: profile?.province, district: profile?.district },
              soilType: profile?.soilType,
              farmSize: typeof profile?.landSizeAcres === "number" ? profile.landSizeAcres : undefined,
            },
          },
        })
      }
      conversation.messages.push(
        { text: message, sender: "user", metadata: { language: language === "auto" ? "en" : language } },
        {
          text: result.text,
          sender: "assistant",
          metadata: { language: language === "auto" ? "en" : language, confidence: result.truncated ? 0.8 : 1 },
        },
      )
      if (conversation.messages.length > MAX_STORED_MESSAGES) {
        conversation.messages = conversation.messages.slice(-MAX_STORED_MESSAGES)
      }
      conversation.lastActivity = new Date()
      await conversation.save()
      saved = true
    } catch (error) {
      // A storage problem must not cost the farmer their answer.
      console.error("[ai/chat] failed to persist conversation:", error)
    }
  }

  const languageKey: LanguageCode = language === "auto" ? "en" : language

  return ok({
    reply: result.text,
    // `response` is kept as an alias because the existing assistant UI reads it.
    response: result.text,
    sessionId,
    language: languageKey,
    model: result.model,
    truncated: result.truncated,
    saved,
    authenticated: Boolean(user),
    suggestedQuestions: SUGGESTED_QUESTIONS[languageKey],
    usage: result.usage,
  })
})

/**
 * Conversation replay. With `sessionId` it returns that transcript; without it,
 * the farmer's recent conversations.
 */
export const GET = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()
  const params = searchParams(req)
  const sessionId = params.get("sessionId")

  if (sessionId) {
    const conversation = await AIConversation.findOne({ userId: auth.userId, sessionId }).lean<any>()
    if (!conversation) return fail("Conversation not found.", 404)
    return ok({
      sessionId,
      messages: (conversation.messages ?? []).map((m: any) => ({
        text: m.text,
        sender: m.sender,
        timestamp: m.timestamp,
        language: m.metadata?.language,
      })),
      context: conversation.context ?? {},
    })
  }

  const conversations = await AIConversation.find({ userId: auth.userId })
    .sort({ lastActivity: -1 })
    .limit(20)
    .lean<any[]>()

  const language: LanguageCode = ((): LanguageCode => {
    const preference = String(auth.user?.preferredLanguage ?? "en")
    return (["en", "ur", "pa", "sd", "ps"] as string[]).includes(preference) ? (preference as LanguageCode) : "en"
  })()

  return ok({
    conversations: conversations.map((c) => ({
      sessionId: c.sessionId,
      lastActivity: c.lastActivity,
      messageCount: c.messages?.length ?? 0,
      lastMessage: c.messages?.length ? c.messages[c.messages.length - 1].text?.slice(0, 160) : "",
    })),
    welcomeMessage: WELCOME_MESSAGE[language],
    suggestedQuestions: SUGGESTED_QUESTIONS[language],
  })
})
