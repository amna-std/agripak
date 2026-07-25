/**
 * ---------------------------------------------------------------------------
 * AgriPak — Gemini client wrapper
 * ---------------------------------------------------------------------------
 *
 * The single place in the codebase that talks to Google's Generative AI API.
 * Routes never construct a client themselves; they call `generateText`,
 * `generateChat` or `generateFromImages` and get back a plain result object.
 *
 * Responsibilities:
 *   - hold the model id in one place (see the warning below);
 *   - reuse one client across warm lambda invocations;
 *   - turn every possible upstream failure into a typed `GeminiError` with a
 *     farmer-safe message and a sensible HTTP status;
 *   - guarantee the API key never appears in a message, log or response;
 *   - parse JSON out of model output defensively.
 *
 * ⚠️ MODEL ID: pinned aliases (`gemini-2.0-flash`, `gemini-2.5-flash`) return
 * HTTP 429 with `limit: 0` on this project's key. Only `gemini-flash-latest`
 * works. Always read `GEMINI_MODEL` with that as the fallback.
 */

import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type Content,
  type GenerativeModel,
  type Part,
} from "@google/generative-ai"

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest"

/**
 * Upper bound on a single request. `vercel.json` gives `app/api/ai/**` a 60s
 * maxDuration, so this 45s ceiling leaves headroom to return a real error
 * instead of the function being killed mid-flight.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 45_000)

/**
 * Safety settings.
 *
 * Agricultural advice legitimately discusses pesticides, poisons, burning crop
 * residue and animal pests. At the default thresholds Gemini intermittently
 * blocks perfectly ordinary questions like "how do I kill rats in my wheat
 * store". We relax to BLOCK_ONLY_HIGH — still blocking genuinely harmful
 * content, but not ordinary farming vocabulary — and the prompts themselves
 * carry the real safety guard rails.
 */
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }))

export type GeminiErrorCode =
  | "not_configured"
  | "quota"
  | "auth"
  | "timeout"
  | "safety"
  | "empty"
  | "upstream"

/** A failure we understand well enough to explain to the user. */
export class GeminiError extends Error {
  readonly code: GeminiErrorCode
  readonly status: number

  constructor(code: GeminiErrorCode, message: string, status: number) {
    super(message)
    this.name = "GeminiError"
    this.code = code
    this.status = status
  }
}

/** True when the deployment has an API key configured. */
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

/**
 * Strips anything that looks like the API key (or any `key=` query parameter)
 * out of a string before it can reach a log line or an HTTP response.
 */
function redact(text: string): string {
  const key = process.env.GEMINI_API_KEY
  let out = text
  if (key && key.length > 8) out = out.split(key).join("[redacted]")
  return out.replace(/key=[A-Za-z0-9_\-]+/gi, "key=[redacted]")
}

/* Cache the client on globalThis so a warm lambda reuses it. */
declare global {
  // eslint-disable-next-line no-var
  var _geminiClient: GoogleGenerativeAI | undefined
}

function client(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new GeminiError(
      "not_configured",
      "The AI service is not configured on this server. Please try again later.",
      503,
    )
  }
  if (!global._geminiClient) global._geminiClient = new GoogleGenerativeAI(apiKey)
  return global._geminiClient
}

/**
 * `gemini-flash-latest` is a *thinking* model: its internal reasoning tokens are
 * billed against `maxOutputTokens`. With a naive budget of 900 the model spends
 * ~860 tokens thinking and returns a truncated half-sentence — verified against
 * the live API. So every call must (a) cap the thinking budget and (b) leave
 * generous headroom on top of it for the actual answer.
 *
 * `thinkingConfig` is not in this SDK version's types, hence the cast; unknown
 * generationConfig keys are forwarded verbatim to the REST API. A model that
 * rejects it produces a 400, which `withThinkingFallback` retries without it.
 */
function getModel(
  systemInstruction: string,
  maxOutputTokens: number,
  temperature: number,
  thinkingBudget?: number,
  json = false,
): GenerativeModel {
  const generationConfig: Record<string, unknown> = {
    temperature,
    topP: 0.95,
    maxOutputTokens,
  }
  if (typeof thinkingBudget === "number") {
    generationConfig.thinkingConfig = { thinkingBudget }
  }
  // Belt and braces with the prompt's "JSON only" rule: this stops the model
  // wrapping the object in markdown fences in the first place.
  if (json) generationConfig.responseMimeType = "application/json"

  return client().getGenerativeModel(
    {
      model: GEMINI_MODEL,
      systemInstruction,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: generationConfig as any,
    },
    { timeout: REQUEST_TIMEOUT_MS },
  )
}

/**
 * Runs a call with the thinking budget applied and retries once without it if
 * the API rejects the field — so swapping `GEMINI_MODEL` for a non-thinking
 * model does not take the AI features down.
 */
async function withThinkingFallback<T>(run: (thinkingBudget?: number) => Promise<T>, budget: number): Promise<T> {
  try {
    return await run(budget)
  } catch (error: any) {
    const message = String(error?.message ?? "")
    const isBadRequest = error?.status === 400 || /invalid[_ ]argument|\b400\b/i.test(message)
    // A 400 is far more often a bad *input* (unreadable image, oversized
    // payload) than an unsupported field. Retrying those burns a second call
    // against a free-tier quota that is already tight, and fails identically.
    // So only retry when the rejection actually points at the thinking config.
    const blamesThinking = /thinking/i.test(message)
    const blamesInput = /image|inline_?data|media|payload|too large|content/i.test(message)
    if (isBadRequest && (blamesThinking || !blamesInput)) {
      return await run(undefined)
    }
    throw error
  }
}

/**
 * Maps an SDK/transport error onto a `GeminiError`.
 *
 * The SDK surfaces most failures as a single `GoogleGenerativeAIError` with the
 * HTTP status embedded in the message string, so we match on both.
 */
function normaliseError(error: any): GeminiError {
  if (error instanceof GeminiError) return error

  const raw = redact(String(error?.message ?? error ?? "Unknown AI error"))
  const status: number = error?.status ?? 0

  if (error?.name === "AbortError" || /abort|timed? ?out|ETIMEDOUT|deadline/i.test(raw)) {
    return new GeminiError(
      "timeout",
      "The AI took too long to answer. Please check your connection and try again.",
      504,
    )
  }
  if (status === 429 || /\b429\b|quota|rate limit|resource[_ ]exhausted/i.test(raw)) {
    return new GeminiError(
      "quota",
      "The AI service has hit its usage limit right now. Please try again in a few minutes.",
      429,
    )
  }
  if (status === 401 || status === 403 || /\b401\b|\b403\b|api[_ ]key|permission[_ ]denied|unauthenticated/i.test(raw)) {
    // Deliberately vague to the caller; the detail goes to the server log only.
    return new GeminiError("auth", "The AI service is unavailable right now. Please try again later.", 503)
  }
  if (/safety|blocked|harm_category/i.test(raw)) {
    return new GeminiError(
      "safety",
      "The AI could not answer that request. Please rephrase your farming question.",
      422,
    )
  }
  if (status >= 500 || /\b50\d\b|internal|unavailable|overloaded/i.test(raw)) {
    return new GeminiError("upstream", "The AI service is busy. Please try again in a moment.", 503)
  }
  return new GeminiError("upstream", "The AI could not answer right now. Please try again.", 502)
}

export interface GeminiResult {
  text: string
  model: string
  finishReason?: string
  truncated: boolean
  usage?: { promptTokens?: number; responseTokens?: number; totalTokens?: number }
}

/**
 * Pulls the text out of a Gemini response and converts "the model returned
 * nothing" into an explicit error instead of an empty string that a route would
 * happily serve to a farmer.
 */
function readResponse(result: any): GeminiResult {
  const response = result?.response

  const blockReason = response?.promptFeedback?.blockReason
  if (blockReason) {
    throw new GeminiError(
      "safety",
      "The AI could not process that input. Please try a different photo or rephrase your question.",
      422,
    )
  }

  const candidate = response?.candidates?.[0]
  const finishReason: string | undefined = candidate?.finishReason

  if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT" || finishReason === "BLOCKLIST") {
    throw new GeminiError(
      "safety",
      "The AI stopped before answering that request. Please rephrase your farming question.",
      422,
    )
  }

  let text = ""
  try {
    text = response?.text?.() ?? ""
  } catch {
    // `.text()` throws when there are no text parts at all.
    text = ""
  }
  text = text.trim()

  if (!text) {
    throw new GeminiError("empty", "The AI returned an empty answer. Please try again.", 502)
  }

  const usage = response?.usageMetadata
  return {
    text,
    model: GEMINI_MODEL,
    finishReason,
    truncated: finishReason === "MAX_TOKENS",
    usage: usage
      ? {
          promptTokens: usage.promptTokenCount,
          responseTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        }
      : undefined,
  }
}

export interface TextRequest {
  system: string
  prompt: string
  maxOutputTokens?: number
  temperature?: number
  /** Internal reasoning allowance, deducted from `maxOutputTokens`. */
  thinkingBudget?: number
  /** Ask the API for `application/json` output. */
  json?: boolean
}

/** Single-shot text generation. */
export async function generateText(req: TextRequest): Promise<GeminiResult> {
  try {
    const result = await withThinkingFallback(
      (thinkingBudget) =>
        getModel(
          req.system,
          req.maxOutputTokens ?? 2048,
          req.temperature ?? 0.6,
          thinkingBudget,
          req.json,
        ).generateContent(req.prompt),
      req.thinkingBudget ?? 768,
    )
    return readResponse(result)
  } catch (error) {
    const normalised = normaliseError(error)
    console.error("[gemini] generateText failed:", normalised.code, redact(String((error as any)?.message ?? error)))
    throw normalised
  }
}

/** One turn of a conversation, in the app's own vocabulary. */
export interface ChatTurn {
  role: "user" | "model"
  text: string
}

export interface ChatRequest {
  system: string
  message: string
  history?: ChatTurn[]
  maxOutputTokens?: number
  temperature?: number
  thinkingBudget?: number
}

/**
 * Multi-turn chat.
 *
 * Gemini requires the history to start with a `user` turn and to alternate, so
 * we sanitise the client-supplied history rather than trusting it — a malformed
 * history from the browser must not 500 the endpoint.
 */
export async function generateChat(req: ChatRequest): Promise<GeminiResult> {
  const history = sanitiseHistory(req.history)
  try {
    const result = await withThinkingFallback(
      (thinkingBudget) =>
        getModel(req.system, req.maxOutputTokens ?? 2048, req.temperature ?? 0.6, thinkingBudget)
          .startChat({ history })
          .sendMessage(req.message),
      req.thinkingBudget ?? 512,
    )
    return readResponse(result)
  } catch (error) {
    const normalised = normaliseError(error)
    console.error("[gemini] generateChat failed:", normalised.code, redact(String((error as any)?.message ?? error)))
    throw normalised
  }
}

/**
 * Drops empty turns, coerces roles, removes any leading `model` turns (the API
 * rejects a history that does not begin with the user) and collapses repeated
 * roles so the alternation the API expects always holds.
 */
export function sanitiseHistory(history?: ChatTurn[] | null, maxTurns = 12): Content[] {
  if (!Array.isArray(history) || history.length === 0) return []

  const cleaned = history
    .filter((t) => t && typeof t.text === "string" && t.text.trim().length > 0)
    .map<ChatTurn>((t) => ({
      role: t.role === "model" ? "model" : "user",
      text: t.text.trim().slice(0, 4000),
    }))
    .slice(-maxTurns)

  const out: Content[] = []
  for (const turn of cleaned) {
    // Skip leading model turns (e.g. a UI welcome bubble).
    if (out.length === 0 && turn.role === "model") continue
    const previous = out[out.length - 1]
    if (previous && previous.role === turn.role) {
      // Merge same-role neighbours instead of sending an invalid sequence.
      previous.parts.push({ text: turn.text })
      continue
    }
    out.push({ role: turn.role, parts: [{ text: turn.text }] })
  }

  // The API also rejects a history whose last turn is from the user, because
  // the new message would make two user turns in a row.
  if (out.length && out[out.length - 1].role === "user") out.pop()
  return out
}

export interface InlineImage {
  /** Raw base64, no `data:` prefix. */
  data: string
  mimeType: string
}

export interface VisionRequest {
  system: string
  prompt: string
  images: InlineImage[]
  maxOutputTokens?: number
  temperature?: number
  thinkingBudget?: number
  json?: boolean
}

/** Vision generation — one or more inline images plus a text instruction. */
export async function generateFromImages(req: VisionRequest): Promise<GeminiResult> {
  if (!req.images?.length) {
    throw new GeminiError("empty", "No image was provided for analysis.", 400)
  }
  try {
    const parts: Part[] = [
      ...req.images.map((image) => ({
        inlineData: { data: image.data, mimeType: image.mimeType },
      })),
      { text: req.prompt },
    ]
    // Lower temperature for vision: we want a careful reading, not creativity.
    // A larger thinking budget pays for itself on differential diagnosis.
    const result = await withThinkingFallback(
      (thinkingBudget) =>
        getModel(
          req.system,
          req.maxOutputTokens ?? 4096,
          req.temperature ?? 0.3,
          thinkingBudget,
          req.json,
        ).generateContent(parts),
      req.thinkingBudget ?? 1024,
    )
    return readResponse(result)
  } catch (error) {
    const normalised = normaliseError(error)
    console.error(
      "[gemini] generateFromImages failed:",
      normalised.code,
      redact(String((error as any)?.message ?? error)),
    )
    throw normalised
  }
}

/**
 * Extracts a JSON object from model output.
 *
 * Models wrap JSON in ```json fences, prepend "Here is the JSON:", or append a
 * closing remark, no matter how firmly the prompt says not to. Rather than
 * failing the request we peel those layers off and, as a last resort, take the
 * outermost balanced `{...}` span.
 *
 * Returns `null` on failure so the caller can fall back to returning the raw
 * text instead of a 500.
 */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null

  let candidate = text.trim()

  // ```json ... ```  or  ``` ... ```
  const fenced = candidate.match(/```(?:json|JSON)?\s*([\s\S]*?)```/)
  if (fenced?.[1]) candidate = fenced[1].trim()

  const direct = tryParse<T>(candidate)
  if (direct !== null) return direct

  // Fall back to the outermost balanced object, ignoring braces inside strings.
  const span = balancedObject(candidate)
  if (span) {
    const parsed = tryParse<T>(span)
    if (parsed !== null) return parsed
    // Trailing commas are the most common remaining defect.
    const repaired = span.replace(/,\s*([}\]])/g, "$1")
    return tryParse<T>(repaired)
  }

  return null
}

function tryParse<T>(text: string): T | null {
  try {
    const value = JSON.parse(text)
    return value && typeof value === "object" ? (value as T) : null
  } catch {
    return null
  }
}

function balancedObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === "{") depth++
    else if (char === "}") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** Model ids and limits, for `/api/ai/*` diagnostics. Never exposes the key. */
export function geminiInfo() {
  return {
    model: GEMINI_MODEL,
    configured: isGeminiConfigured(),
    timeoutMs: REQUEST_TIMEOUT_MS,
  }
}
