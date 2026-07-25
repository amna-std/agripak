"use client"

/**
 * AgriPak AI assistant — wired to `POST /api/ai/chat` (Gemini).
 *
 * Two exports:
 *   <AIChatbot />                        floating launcher + panel, mounted app-wide
 *   <AIChatPanel className="h-full" />   the conversation on its own, for /ai-assistant
 *
 * Behaviour notes:
 *  - The API keeps server-side memory per `sessionId` for signed-in farmers, so
 *    only the last few turns are re-uploaded from the phone.
 *  - Auth is optional; an anonymous visitor still gets an answer.
 *  - A failed call renders the API's own message. It never falls back to a
 *    canned "answer" — a farmer must not be given advice the model did not give.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Bot, Loader2, MessageCircle, RotateCcw, Send, User, Volume2, VolumeX, X } from "lucide-react"

import { useLanguage } from "@/lib/contexts"
import { aiApi, type ChatTurn } from "@/lib/api"
import { isChromelessRoute } from "@/components/nav-items"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  /** Set when the turn failed — rendered as an error bubble, not as advice. */
  error?: boolean
}

/** Turns kept on the device and re-sent; the server holds the rest. */
const HISTORY_TURNS = 8

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/* ------------------------------------------------------------------ panel */

export interface AIChatPanelProps {
  className?: string
  /** Rendered in the panel header, e.g. a close button in the floating variant. */
  headerAction?: React.ReactNode
}

export function AIChatPanel({ className, headerAction }: AIChatPanelProps) {
  const { t, currentLanguage, speak, stopSpeaking, voiceEnabled, toggleVoice } = useLanguage()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const endRef = useRef<HTMLDivElement>(null)

  // The greeting is a translated string, not a model output, so it must follow
  // the active language rather than stay frozen at whatever was set on mount.
  const greeting = t("ai.welcome")

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, sending])

  useEffect(() => stopSpeaking, [stopSpeaking])

  const starters = suggestions.length
    ? suggestions
    : [t("ai.examplePest"), t("ai.exampleFertilizer"), t("ai.exampleWeather")]

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim()
      if (!message || sending) return

      const history: ChatTurn[] = messages
        .filter((m) => !m.error)
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", text: m.text }))

      setMessages((prev) => [...prev, { id: newId(), role: "user", text: message }])
      setInput("")
      setSending(true)

      try {
        const res = await aiApi.chat({ message, history, language: currentLanguage, sessionId })

        if (res.success && res.reply) {
          setSessionId(res.sessionId)
          if (Array.isArray(res.suggestedQuestions)) setSuggestions(res.suggestedQuestions)
          setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: res.reply! }])
          if (voiceEnabled) speak(res.reply)
        } else {
          setMessages((prev) => [
            ...prev,
            { id: newId(), role: "assistant", text: res.message || t("ai.unavailable"), error: true },
          ])
        }
      } catch {
        setMessages((prev) => [...prev, { id: newId(), role: "assistant", text: t("ai.unavailable"), error: true }])
      } finally {
        setSending(false)
      }
    },
    [currentLanguage, messages, sending, sessionId, speak, t, voiceEnabled],
  )

  const reset = () => {
    stopSpeaking()
    setMessages([])
    setSessionId(undefined)
    setInput("")
  }

  return (
    <div className={cn("flex min-h-0 flex-col bg-card text-card-foreground", className)}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
          <Bot className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold leading-[1.7]">{t("ai.title")}</span>
          {/* Hidden at 360px: three header buttons plus a subtitle leaves no room. */}
          <span className="hidden truncate text-xs leading-[1.7] opacity-90 sm:block">{t("ai.askAnything")}</span>
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleVoice}
          aria-label={voiceEnabled ? t("ai.stopReading") : t("ai.readAloud")}
          aria-pressed={voiceEnabled}
          className="min-h-tap min-w-tap text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
        >
          {voiceEnabled ? <Volume2 className="h-5 w-5" aria-hidden /> : <VolumeX className="h-5 w-5" aria-hidden />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={reset}
          disabled={messages.length === 0}
          aria-label={t("ai.newChat")}
          className="min-h-tap min-w-tap text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
        >
          <RotateCcw className="h-5 w-5" aria-hidden />
        </Button>

        {headerAction}
      </div>

      {/* Transcript */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        <div className="flex gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Bot className="h-4 w-4" aria-hidden />
          </span>
          <p className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
            {greeting}
          </p>
        </div>

        {messages.map((message) => {
          const mine = message.role === "user"
          return (
            <div key={message.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  mine ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                )}
                aria-hidden
              >
                {mine ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </span>
              <div className={cn("max-w-[85%]", mine && "text-end")}>
                <span className="sr-only">{mine ? t("ai.you") : t("ai.assistant")}: </span>
                <p
                  className={cn(
                    "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-start text-sm leading-relaxed",
                    mine
                      ? "bg-primary text-primary-foreground"
                      : message.error
                        ? "border border-destructive/40 bg-destructive/10 text-destructive"
                        : "bg-muted text-foreground",
                  )}
                >
                  {message.text}
                </p>
              </div>
            </div>
          )
        })}

        {sending ? (
          <div className="flex gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <Bot className="h-4 w-4" aria-hidden />
            </span>
            <p className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("ai.thinking")}
            </p>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {/* Starters */}
      {messages.length === 0 ? (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("ai.suggestedQuestions")}
          </p>
          <div className="flex flex-wrap gap-2">
            {starters.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => send(question)}
                disabled={sending}
                className="rounded-full border border-border bg-secondary px-3 py-2 text-start text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Composer */}
      <form
        className="shrink-0 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault()
          send(input)
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
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
            className="max-h-32 min-h-tap flex-1 resize-none text-start"
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || !input.trim()}
            aria-label={t("ai.send")}
            className="min-h-tap min-w-tap shrink-0"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Send className="h-5 w-5 flip-rtl" aria-hidden />
            )}
          </Button>
        </div>
        <p className="mt-2 text-[0.6875rem] leading-snug text-muted-foreground">{t("ai.disclaimer")}</p>
      </form>
    </div>
  )
}

/* ------------------------------------------------------ floating launcher */

export interface AIChatbotProps {
  /** Controlled open state. Omit to let the component manage its own. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Hide the floating button (useful when a page provides its own trigger). */
  hideLauncher?: boolean
  className?: string
}

export function AIChatbot({ open, onOpenChange, hideLauncher, className }: AIChatbotProps) {
  const { t } = useLanguage()
  const pathname = usePathname()
  const [internalOpen, setInternalOpen] = useState(false)

  const controlled = open !== undefined
  const isOpen = controlled ? open : internalOpen
  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  useEffect(() => {
    if (!isOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // The landing/auth screens and the dedicated assistant page do not need it.
  if (isChromelessRoute(pathname) || pathname?.startsWith("/ai-assistant")) return null

  return (
    <>
      {!hideLauncher && !isOpen ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("ai.openAssistant")}
          className={cn(
            "fixed end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95",
            "bottom-[calc(var(--bottom-nav-height)+1rem+env(safe-area-inset-bottom,0px))] md:bottom-6",
            className,
          )}
        >
          <MessageCircle className="h-7 w-7" aria-hidden />
        </button>
      ) : null}

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={t("ai.title")}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <AIChatPanel
            className="relative z-10 h-[min(85vh,40rem)] w-full max-w-md overflow-hidden rounded-t-2xl border border-border shadow-2xl sm:rounded-2xl"
            headerAction={
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label={t("common.close")}
                className="min-h-tap min-w-tap text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              >
                <X className="h-5 w-5" aria-hidden />
              </Button>
            }
          />
        </div>
      ) : null}
    </>
  )
}

export default AIChatbot
