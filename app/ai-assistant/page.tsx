"use client"

/**
 * /ai-assistant — the full-screen conversational farming assistant.
 *
 * Wired to `POST /api/ai/chat` (Gemini). Multi-turn: the last few turns are
 * re-uploaded from the phone and the server keeps the rest against `sessionId`.
 *
 * Why this page does not simply render `<AIChatPanel />` from
 * `components/ai-chatbot.tsx`: that panel is the *floating* assistant and is
 * deliberately compact. This screen needs three things it does not have — Web
 * Speech dictation (many users cannot type Urdu), a per-answer "read this
 * aloud" control (limited literacy), and follow-up chips driven by the API's
 * own `suggestedQuestions`. Both talk to the same endpoint with the same
 * session semantics, so the two stay consistent.
 *
 * Honesty: a failed turn renders the API's own message as an error bubble. The
 * assistant never invents a fallback answer for a farmer.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Languages,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  User,
  Volume2,
  VolumeX,
} from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { aiApi, type ChatTurn } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/** Turns kept on the device and re-sent; the server holds the rest. */
const HISTORY_TURNS = 8

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  /** Set when the turn failed — rendered as an error, never as advice. */
  error?: boolean
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/* ------------------------------------------------------------------ speech */

type SpeechState = "unsupported" | "idle" | "listening" | "blocked" | "error"

function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null
}

/* -------------------------------------------------------------------- page */

export default function AiAssistantPage() {
  const { t, currentLanguage, locale, speak, stopSpeaking, voiceEnabled, toggleVoice } = useLanguage()
  const { user } = useAuth()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const [followUps, setFollowUps] = useState<string[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [pendingSpeak, setPendingSpeak] = useState<string | null>(null)
  const [speech, setSpeech] = useState<SpeechState>("idle")

  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  /* -------------------------------------------------------------- scrolling */

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, sending])

  /* ------------------------------------------------------------------ voice */

  // Stop any narration when the screen goes away.
  useEffect(() => stopSpeaking, [stopSpeaking])

  // `speak()` is a no-op while the voice preference is off, so tapping a
  // speaker icon has to switch the preference on first and then replay.
  useEffect(() => {
    if (voiceEnabled && pendingSpeak) {
      speak(pendingSpeak)
      setPendingSpeak(null)
    }
  }, [voiceEnabled, pendingSpeak, speak])

  const readAloud = useCallback(
    (id: string, text: string) => {
      if (speakingId === id) {
        stopSpeaking()
        setSpeakingId(null)
        return
      }
      setSpeakingId(id)
      if (voiceEnabled) {
        speak(text)
      } else {
        setPendingSpeak(text)
        void toggleVoice()
      }
    },
    [speak, speakingId, stopSpeaking, toggleVoice, voiceEnabled],
  )

  /* -------------------------------------------------------------- dictation */

  useEffect(() => {
    if (!getSpeechRecognition()) setSpeech("unsupported")
  }, [])

  // The recogniser is locked to the language it was created with, so it is torn
  // down whenever the farmer switches language.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort?.()
      } catch {
        /* already gone */
      }
      recognitionRef.current = null
    }
  }, [locale])

  const stopDictation = useCallback(() => {
    try {
      recognitionRef.current?.stop?.()
    } catch {
      /* ignore */
    }
    setSpeech((prev) => (prev === "listening" ? "idle" : prev))
  }, [])

  const startDictation = useCallback(() => {
    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      setSpeech("unsupported")
      return
    }
    if (speech === "listening") {
      stopDictation()
      return
    }

    stopSpeaking()
    setSpeakingId(null)

    const recognition = new Recognition()
    recognition.lang = locale
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<any>)
        .map((result: any) => result[0]?.transcript ?? "")
        .join(" ")
        .trim()
      setInput(transcript)
    }
    recognition.onerror = (event: any) => {
      setSpeech(event?.error === "not-allowed" || event?.error === "service-not-allowed" ? "blocked" : "error")
    }
    recognition.onend = () => {
      setSpeech((prev) => (prev === "listening" ? "idle" : prev))
      inputRef.current?.focus()
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setSpeech("listening")
    } catch {
      setSpeech("error")
    }
  }, [locale, speech, stopDictation, stopSpeaking])

  /* ------------------------------------------------------------------ send */

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim()
      if (!message || sending) return

      stopDictation()

      const history: ChatTurn[] = messages
        .filter((m) => !m.error)
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", text: m.text }))

      setMessages((prev) => [...prev, { id: newId(), role: "user", text: message }])
      setInput("")
      setFollowUps([])
      setSending(true)

      try {
        const res = await aiApi.chat({ message, history, language: currentLanguage, sessionId })

        if (res.success && res.reply) {
          const id = newId()
          setSessionId(res.sessionId)
          setFollowUps(Array.isArray(res.suggestedQuestions) ? res.suggestedQuestions.slice(0, 4) : [])
          setMessages((prev) => [...prev, { id, role: "assistant", text: res.reply! }])
          if (voiceEnabled) {
            setSpeakingId(id)
            speak(res.reply)
          }
        } else {
          setMessages((prev) => [
            ...prev,
            { id: newId(), role: "assistant", text: res.message || t("ai.unavailable"), error: true },
          ])
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", text: t("validation.networkError"), error: true },
        ])
      } finally {
        setSending(false)
      }
    },
    [currentLanguage, messages, sending, sessionId, speak, stopDictation, t, voiceEnabled],
  )

  const reset = () => {
    stopSpeaking()
    stopDictation()
    setSpeakingId(null)
    setMessages([])
    setFollowUps([])
    setSessionId(undefined)
    setInput("")
  }

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1800)
    } catch {
      /* clipboard blocked — the text is on screen anyway */
    }
  }

  /* ------------------------------------------------------------- rendering */

  const starters = [
    t("ai.examplePest"),
    t("ai.exampleFertilizer"),
    t("ai.exampleWeather"),
    t("ai.exampleRust"),
    t("ai.exampleWater"),
    t("ai.exampleScheme"),
  ]

  const empty = messages.length === 0

  return (
    <div className="flex h-[calc(100dvh-3.5rem-var(--bottom-nav-height))] flex-col md:h-[calc(100dvh-3.5rem)]">
      {/* ------------------------------------------------------------ header */}
      <header className="shrink-0 border-b border-border bg-brand-gradient">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Sparkles className="h-6 w-6" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold leading-[1.8] sm:text-lg">{t("ai.title")}</h1>
            <p className="hidden truncate text-xs leading-[1.8] opacity-90 sm:block">{t("ai.subtitle")}</p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              if (voiceEnabled) {
                stopSpeaking()
                setSpeakingId(null)
              }
              void toggleVoice()
            }}
            aria-pressed={voiceEnabled}
            aria-label={t("ai.autoRead")}
            title={t("ai.autoRead")}
            className="tap-target shrink-0 rounded-xl text-white hover:bg-white/20 hover:text-white"
          >
            {voiceEnabled ? <Volume2 className="h-5 w-5" aria-hidden /> : <VolumeX className="h-5 w-5" aria-hidden />}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={reset}
            disabled={empty}
            aria-label={t("ai.newChat")}
            title={t("ai.newChat")}
            className="tap-target shrink-0 rounded-xl text-white hover:bg-white/20 hover:text-white disabled:opacity-40"
          >
            <RotateCcw className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      </header>

      {/* -------------------------------------------------------- transcript */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-4">
          {/* Greeting — a translated string, not model output. */}
          <div className="flex gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" aria-hidden />
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-ss-sm bg-muted px-4 py-3">
              <p className="text-sm leading-[1.9] text-foreground">{t("ai.welcome")}</p>
              {empty ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-[1.9] text-muted-foreground">
                  <Languages className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{t("ai.emptyHint")}</span>
                </p>
              ) : null}
            </div>
          </div>

          {messages.map((message) => {
            const mine = message.role === "user"
            return (
              <div key={message.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    mine
                      ? "bg-secondary text-secondary-foreground"
                      : message.error
                        ? "bg-destructive/15 text-destructive"
                        : "bg-primary text-primary-foreground",
                  )}
                  aria-hidden
                >
                  {mine ? (
                    <User className="h-4 w-4" />
                  ) : message.error ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 max-w-[85%]">
                  <span className="sr-only">{mine ? t("ai.you") : t("ai.assistant")}: </span>
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3",
                      mine
                        ? "rounded-se-sm bg-primary text-primary-foreground"
                        : message.error
                          ? "rounded-ss-sm border border-destructive/40 bg-destructive/10 text-destructive"
                          : "rounded-ss-sm bg-muted text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-start text-sm leading-[1.9]">{message.text}</p>
                  </div>

                  {!mine && !message.error ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => readAloud(message.id, message.text)}
                        aria-label={speakingId === message.id ? t("ai.stopReading") : t("ai.speakMessage")}
                        className="inline-flex min-h-tap items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
                      >
                        {speakingId === message.id ? (
                          <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
                        ) : (
                          <Volume2 className="h-4 w-4" aria-hidden />
                        )}
                        <span className="leading-[1.9]">
                          {speakingId === message.id ? t("ai.stopReading") : t("ai.readAloud")}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => copy(message.id, message.text)}
                        aria-label={t("ai.copy")}
                        className="inline-flex min-h-tap items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
                      >
                        {copiedId === message.id ? (
                          <Check className="h-4 w-4 text-primary" aria-hidden />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden />
                        )}
                        <span className="leading-[1.9]">
                          {copiedId === message.id ? t("ai.copied") : t("ai.copy")}
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}

          {/* Typing indicator */}
          {sending ? (
            <div className="flex gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" aria-hidden />
              </span>
              <div className="flex items-center gap-2 rounded-2xl rounded-ss-sm bg-muted px-4 py-3">
                <span className="flex gap-1" aria-hidden>
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
                </span>
                <span className="text-sm leading-[1.9] text-muted-foreground">{t("ai.thinking")}</span>
              </div>
            </div>
          ) : null}

          <div aria-live="polite" className="sr-only">
            {sending ? t("ai.thinking") : ""}
          </div>

          <div ref={endRef} />
        </div>
      </div>

      {/* ------------------------------------------------------------- chips */}
      {(empty || followUps.length > 0) && !sending ? (
        <div className="shrink-0 border-t border-border bg-card">
          <div className="mx-auto w-full max-w-3xl px-3 pt-3 sm:px-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {empty ? t("ai.suggestedQuestions") : t("ai.followUps")}
            </p>
            <div className="scroll-x no-scrollbar -mx-3 flex gap-2 px-3 pb-3 sm:mx-0 sm:flex-wrap sm:px-0">
              {(empty ? starters : followUps).map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => send(question)}
                  className="min-h-tap w-60 shrink-0 whitespace-normal rounded-2xl border border-border bg-secondary px-3 py-2 text-start text-xs font-medium leading-[1.8] text-secondary-foreground transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground sm:w-auto sm:max-w-[16rem]"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- composer */}
      <form
        className="shrink-0 border-t border-border bg-card"
        onSubmit={(event) => {
          event.preventDefault()
          send(input)
        }}
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-4">
          {speech === "listening" ? (
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold leading-[1.9] text-primary">
              <span className="relative flex h-2.5 w-2.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              {t("ai.listening")}
            </p>
          ) : null}

          {speech === "blocked" || speech === "error" ? (
            <p className="mb-2 text-xs leading-[1.9] text-destructive">
              {speech === "blocked" ? t("ai.micBlocked") : t("validation.somethingWentWrong")}
            </p>
          ) : null}

          <div className="flex items-end gap-2">
            <Button
              type="button"
              variant={speech === "listening" ? "default" : "outline"}
              size="icon"
              onClick={startDictation}
              disabled={speech === "unsupported" || sending}
              aria-pressed={speech === "listening"}
              aria-label={speech === "listening" ? t("ai.stopListening") : t("ai.voiceInput")}
              title={speech === "unsupported" ? t("ai.micUnsupported") : t("ai.voiceInput")}
              className="tap-target shrink-0 rounded-xl"
            >
              <Mic className={cn("h-5 w-5", speech === "listening" && "animate-pulse")} aria-hidden />
            </Button>

            <Textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  send(input)
                }
              }}
              rows={1}
              placeholder={t("ai.typeMessage")}
              aria-label={t("ai.typeMessage")}
              disabled={sending}
              className="max-h-32 min-h-tap flex-1 resize-none rounded-xl py-2.5 text-start text-base leading-[1.8]"
            />

            <Button
              type="submit"
              size="icon"
              disabled={sending || !input.trim()}
              aria-label={t("ai.send")}
              className="tap-target shrink-0 rounded-xl"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Send className="h-5 w-5 flip-rtl" aria-hidden />
              )}
            </Button>
          </div>

          <p className="mt-2 text-[0.6875rem] leading-[1.8] text-muted-foreground">
            {t("ai.disclaimer")}
            {!user ? (
              <>
                {" "}
                <Link href="/auth/login" className="font-semibold text-primary underline underline-offset-2">
                  {t("ai.notSaved")}
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </form>
    </div>
  )
}
