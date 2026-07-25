"use client"

/**
 * A single expert consultation: the brief, the message thread and the expert's
 * recommendations.
 *
 *   GET  /api/consultations/:id
 *   GET  /api/consultations/:id/messages
 *   POST /api/consultations/:id/messages
 *   GET  /api/consultations/:id/recommendations
 *   PUT  /api/consultations/:id   { action: "rate", data: { score, feedback } }
 *
 * Rewritten from scratch: the previous version was untyped and crashed on the
 * many optional sub-documents (diagnosis, resolution, scheduledCall) that a
 * fresh consultation simply does not have.
 *
 * Only the two participants and an admin can read a consultation, so a 403 from
 * the API is rendered as its own message rather than as an empty page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  Leaf,
  Loader2,
  MapPin,
  Send,
  Star,
  Stethoscope,
} from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import api, { consultationsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { TranslationKey } from "@/lib/i18n"

/* -------------------------------------------------------------------- types */

interface Party {
  _id?: string
  name?: string
  mobile?: string
  district?: string | null
  state?: string | null
  village?: string | null
  qualification?: string | null
  specialization?: string[] | string
}

interface ThreadMessage {
  _id?: string
  message?: string
  messageType?: "text" | "recommendation" | "diagnosis" | "follow_up" | string
  timestamp?: string
  createdAt?: string
  sender?: { _id?: string; name?: string; role?: string } | string | null
}

interface Recommendation {
  _id?: string
  category?: string
  title?: string
  description?: string
  priority?: string
  actionRequired?: boolean
  timeline?: { immediate?: boolean; withinDays?: number; seasonal?: string } | null
  cost?: { estimated?: number; currency?: string } | null
  expectedOutcome?: string | null
  isImplemented?: boolean
  products?: { name?: string; brand?: string; dosage?: string }[]
}

interface Diagnosis {
  condition?: string
  severity?: string
  causes?: string[]
  symptoms?: string[]
  treatment?: string
  prevention?: string[]
  confidence?: number
}

interface Consultation {
  _id: string
  subject?: string
  description?: string
  type?: string
  status?: string
  priority?: string
  createdAt?: string
  estimatedResolutionTime?: number
  farmer?: Party | null
  expert?: Party | null
  cropDetails?: {
    cropName?: string
    variety?: string
    stage?: string
    area?: number
    currentIssues?: string[]
  } | null
  location?: { district?: string; state?: string; village?: string } | null
  messages?: ThreadMessage[]
  recommendations?: Recommendation[]
  diagnosis?: Diagnosis | null
  resolution?: {
    summary?: string
    outcome?: string
    resolvedAt?: string
    followUpRequired?: boolean
  } | null
  scheduledCall?: { dateTime?: string; duration?: number; platform?: string; status?: string } | null
  rating?: { score?: number; feedback?: string } | null
  tags?: string[]
}

/* ---------------------------------------------------------------- constants */

const TYPE_KEYS: Record<string, TranslationKey> = {
  crop_disease: "consultations.typeCropDisease",
  market_advisory: "consultations.typeMarketAdvisory",
  soil_management: "consultations.typeSoilManagement",
  pest_control: "consultations.typePestControl",
  irrigation: "consultations.typeIrrigation",
  fertilizer: "consultations.typeFertilizer",
  harvesting: "consultations.typeHarvesting",
  general: "consultations.typeGeneral",
}

const STATUS_KEYS: Record<string, TranslationKey> = {
  open: "consultations.statusOpen",
  assigned: "consultations.statusAssigned",
  in_progress: "consultations.statusInProgress",
  resolved: "consultations.statusResolved",
  closed: "consultations.statusClosed",
  follow_up_required: "consultations.statusFollowUp",
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-secondary text-secondary-foreground",
  assigned: "bg-primary/15 text-primary",
  in_progress: "bg-gold-surface text-gold-foreground",
  resolved: "bg-primary text-primary-foreground",
  closed: "bg-muted text-muted-foreground",
  follow_up_required: "bg-destructive/15 text-destructive",
}

const PRIORITY_KEYS: Record<string, TranslationKey> = {
  low: "consultations.priorityLow",
  medium: "consultations.priorityMedium",
  high: "consultations.priorityHigh",
  urgent: "consultations.priorityUrgent",
  critical: "consultations.priorityUrgent",
}

const RECOMMENDATION_KEYS: Record<string, TranslationKey> = {
  treatment: "consultations.recTreatment",
  fertilizer: "consultations.recFertilizer",
  pesticide: "consultations.recPesticide",
  irrigation: "consultations.recIrrigation",
  harvesting: "consultations.recHarvesting",
  market_timing: "consultations.recMarketTiming",
  crop_selection: "consultations.recCropSelection",
}

/* ------------------------------------------------------------------ helpers */

function senderId(sender: ThreadMessage["sender"]): string {
  if (!sender) return ""
  if (typeof sender === "string") return sender
  return String(sender._id ?? "")
}

function senderName(sender: ThreadMessage["sender"]): string {
  if (!sender || typeof sender === "string") return ""
  return sender.name ?? ""
}

/* --------------------------------------------------------------------- page */

export default function ConsultationDetailPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : ""

  const { t, formatCurrency, formatNumber, currentLanguage, locale } = useLanguage()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [consultation, setConsultation] = useState<Consultation | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)

  const threadEndRef = useRef<HTMLDivElement | null>(null)

  const userId = String(user?._id ?? user?.id ?? "")

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth/login")
  }, [authLoading, user, router])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await consultationsApi.get(id)
      if (!res.success || !res.data) {
        setError(res.message || t("consultations.detailError"))
        setConsultation(null)
        return
      }

      const data = res.data as Consultation
      setConsultation(data)
      setMessages(Array.isArray(data.messages) ? data.messages : [])
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : [])
    } catch {
      setError(t("validation.networkError"))
      setConsultation(null)
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => {
    if (!user) return
    void load()
  }, [user, load])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "nearest" })
  }, [messages.length])

  const formatDate = useCallback(
    (value?: string) => {
      if (!value) return ""
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ""
      try {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)
      } catch {
        return date.toISOString().slice(0, 16).replace("T", " ")
      }
    },
    [locale],
  )

  const sendMessage = async () => {
    const text = draft.trim()
    if (!text || !id) return

    setSending(true)
    try {
      const res = await consultationsApi.sendMessage(id, { message: text })
      if (!res.success) {
        toast.error(res.message || t("validation.somethingWentWrong"))
        return
      }
      // The route answers with the whole thread, which keeps the expert's
      // messages in sync too; fall back to appending just the new one.
      if (Array.isArray(res.messages)) setMessages(res.messages as ThreadMessage[])
      else if (res.data) setMessages((current) => [...current, res.data as ThreadMessage])
      setDraft("")
    } catch {
      toast.error(t("validation.networkError"))
    } finally {
      setSending(false)
    }
  }

  const isFarmer = useMemo(
    () => Boolean(consultation?.farmer?._id && String(consultation.farmer._id) === userId),
    [consultation, userId],
  )

  const counterpart = isFarmer ? consultation?.expert : consultation?.farmer

  /* -------------------------------------------------------------- rendering */

  if (authLoading || !user || loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <div className="space-y-3">
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-32 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
    )
  }

  if (error || !consultation) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-9 w-9 text-destructive" aria-hidden />
            <p className="text-sm leading-[1.8] text-muted-foreground">{error ?? t("consultations.notFound")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" className="min-h-tap" onClick={() => void load()}>
                {t("common.retry")}
              </Button>
              <Button asChild className="min-h-tap">
                <Link href="/consultations">{t("consultations.backToList")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusKey = STATUS_KEYS[consultation.status ?? ""]
  const typeKey = TYPE_KEYS[consultation.type ?? ""]
  const priorityKey = PRIORITY_KEYS[consultation.priority ?? ""]
  const place = [consultation.location?.village, consultation.location?.district, consultation.location?.state]
    .filter(Boolean)
    .join(", ")

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
      <Link
        href="/consultations"
        className="mb-3 inline-flex min-h-tap items-center gap-1 text-sm font-medium leading-[1.8] text-primary"
      >
        <ChevronLeft className="flip-rtl h-4 w-4" aria-hidden />
        {t("consultations.backToList")}
      </Link>

      {/* ------------------------------------------------------------ header */}
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-[1.7] ${
              STATUS_STYLES[consultation.status ?? ""] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {statusKey ? t(statusKey) : consultation.status}
          </span>
          {typeKey ? (
            <Badge variant="outline" className="text-[11px] leading-[1.7]">
              {t(typeKey)}
            </Badge>
          ) : null}
          {priorityKey ? (
            <Badge
              variant={consultation.priority === "urgent" ? "destructive" : "secondary"}
              className="text-[11px] leading-[1.7]"
            >
              {t(priorityKey)}
            </Badge>
          ) : null}
        </div>

        <h1 className="mt-2 text-xl font-bold leading-[1.7] text-foreground sm:text-2xl">
          {consultation.subject}
        </h1>

        <p className="mt-1 text-xs leading-[1.8] text-muted-foreground">
          {t("consultations.openedOn")}: {formatDate(consultation.createdAt)}
        </p>
        {consultation.estimatedResolutionTime ? (
          <p className="text-xs leading-[1.8] text-muted-foreground">
            {t("consultations.targetResponse", { count: consultation.estimatedResolutionTime })}
          </p>
        ) : null}
      </header>

      {/* -------------------------------------------------------------- brief */}
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <p className="whitespace-pre-line text-sm leading-[1.9] text-foreground">{consultation.description}</p>

          {consultation.cropDetails?.cropName ||
          consultation.cropDetails?.variety ||
          consultation.cropDetails?.stage ||
          consultation.cropDetails?.area ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-[1.8] text-muted-foreground">
              <Leaf className="h-4 w-4 shrink-0" aria-hidden />
              {consultation.cropDetails?.cropName ? <span>{consultation.cropDetails.cropName}</span> : null}
              {consultation.cropDetails?.variety ? <span>· {consultation.cropDetails.variety}</span> : null}
              {consultation.cropDetails?.stage ? <span>· {consultation.cropDetails.stage}</span> : null}
              {consultation.cropDetails?.area ? (
                <span className="force-ltr">
                  · {formatNumber(consultation.cropDetails.area)} {t("units.acre")}
                </span>
              ) : null}
            </p>
          ) : null}

          {place ? (
            <p className="flex items-center gap-1 text-xs leading-[1.8] text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              {place}
            </p>
          ) : null}

          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-xs font-semibold leading-[1.8] text-muted-foreground">
              {isFarmer ? t("consultations.expert") : t("consultations.farmer")}
            </p>
            {counterpart?.name ? (
              <>
                <p className="text-sm font-semibold leading-[1.8] text-foreground">{counterpart.name}</p>
                {counterpart.qualification ? (
                  <p className="text-xs leading-[1.9] text-muted-foreground">{counterpart.qualification}</p>
                ) : null}
                {[counterpart.district, counterpart.state].filter(Boolean).length ? (
                  <p className="text-xs leading-[1.8] text-muted-foreground">
                    {[counterpart.district, counterpart.state].filter(Boolean).join(", ")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm leading-[1.8] text-muted-foreground">{t("consultations.awaitingExpert")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- diagnosis */}
      {consultation.diagnosis?.condition ? (
        <Card className="mb-4">
          <CardContent className="space-y-2 p-4">
            <h2 className="flex items-center gap-2 text-base font-bold leading-[1.7] text-foreground">
              <Stethoscope className="h-5 w-5 text-primary" aria-hidden />
              {t("consultations.diagnosis")}
            </h2>
            <p className="text-sm font-semibold leading-[1.8] text-foreground">
              {consultation.diagnosis.condition}
            </p>
            {consultation.diagnosis.severity ? (
              <p className="text-xs leading-[1.8] text-muted-foreground">
                {t("crops.severity")}: {consultation.diagnosis.severity}
              </p>
            ) : null}
            {typeof consultation.diagnosis.confidence === "number" ? (
              <p className="text-xs leading-[1.8] text-muted-foreground">
                {t("crops.confidence")}:{" "}
                <span className="force-ltr">{formatNumber(consultation.diagnosis.confidence)}%</span>
              </p>
            ) : null}
            {consultation.diagnosis.symptoms?.length ? (
              <div>
                <p className="text-xs font-semibold leading-[1.8] text-foreground">{t("crops.symptoms")}</p>
                <ul className="list-inside list-disc text-sm leading-[1.9] text-muted-foreground">
                  {consultation.diagnosis.symptoms.map((item, index) => (
                    <li key={`symptom-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {consultation.diagnosis.treatment ? (
              <div>
                <p className="text-xs font-semibold leading-[1.8] text-foreground">{t("crops.treatment")}</p>
                <p className="text-sm leading-[1.9] text-muted-foreground">{consultation.diagnosis.treatment}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ---------------------------------------------------- scheduled call */}
      {consultation.scheduledCall?.dateTime ? (
        <Card className="mb-4">
          <CardContent className="flex items-start gap-3 p-4">
            <CalendarClock className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div>
              <h2 className="text-base font-bold leading-[1.7] text-foreground">
                {t("consultations.scheduledCall")}
              </h2>
              <p className="text-sm leading-[1.9] text-muted-foreground">
                {formatDate(consultation.scheduledCall.dateTime)}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ---------------------------------------------------- recommendations */}
      <section aria-labelledby="recommendations" className="mb-4">
        <h2 id="recommendations" className="mb-2 text-lg font-bold leading-[1.7] text-foreground">
          {t("consultations.recommendations")}
        </h2>

        {recommendations.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-center text-sm leading-[1.9] text-muted-foreground">
              {t("consultations.noRecommendations")}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {recommendations.map((item, index) => {
              const categoryKey = RECOMMENDATION_KEYS[item.category ?? ""]
              const itemPriorityKey = PRIORITY_KEYS[item.priority ?? ""]

              return (
                <li key={item._id ?? `recommendation-${index}`}>
                  <Card className="border-s-accent">
                    <CardContent className="space-y-2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {categoryKey ? (
                          <Badge variant="secondary" className="text-[11px] leading-[1.7]">
                            {t(categoryKey)}
                          </Badge>
                        ) : null}
                        {itemPriorityKey ? (
                          <Badge variant="outline" className="text-[11px] leading-[1.7]">
                            {t(itemPriorityKey)}
                          </Badge>
                        ) : null}
                        {item.actionRequired ? (
                          <Badge variant="destructive" className="text-[11px] leading-[1.7]">
                            {t("consultations.actionRequired")}
                          </Badge>
                        ) : null}
                      </div>

                      <h3 className="text-sm font-bold leading-[1.8] text-foreground">{item.title}</h3>
                      <p className="whitespace-pre-line text-sm leading-[1.9] text-muted-foreground">
                        {item.description}
                      </p>

                      {item.products?.length ? (
                        <ul className="list-inside list-disc text-xs leading-[1.9] text-muted-foreground">
                          {item.products.map((product, productIndex) => (
                            <li key={`product-${productIndex}`}>
                              {[product.name, product.brand, product.dosage].filter(Boolean).join(" — ")}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {typeof item.cost?.estimated === "number" && item.cost.estimated > 0 ? (
                        <p className="text-xs leading-[1.8] text-muted-foreground">
                          {t("consultations.estimatedCost")}:{" "}
                          <span className="font-semibold text-foreground">
                            {formatCurrency(item.cost.estimated)}
                          </span>
                        </p>
                      ) : null}

                      {item.timeline?.withinDays ? (
                        <p className="text-xs leading-[1.8] text-muted-foreground">
                          {t("consultations.timeline")}:{" "}
                          {t("consultations.withinDays", { count: item.timeline.withinDays })}
                        </p>
                      ) : null}

                      {item.expectedOutcome ? (
                        <p className="text-xs leading-[1.9] text-muted-foreground">
                          {t("consultations.expectedOutcome")}: {item.expectedOutcome}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------------------- messages */}
      <section aria-labelledby="thread" className="mb-4">
        <h2 id="thread" className="mb-2 text-lg font-bold leading-[1.7] text-foreground">
          {t("consultations.messages")}
        </h2>

        <Card>
          <CardContent className="p-4">
            {messages.length === 0 ? (
              <p className="py-6 text-center text-sm leading-[1.9] text-muted-foreground">
                {t("consultations.noMessages")}
              </p>
            ) : (
              <ul className="space-y-3">
                {messages.map((item, index) => {
                  const mine = senderId(item.sender) === userId
                  const name = senderName(item.sender)
                  const isSystemNote = item.messageType && item.messageType !== "text"

                  return (
                    <li
                      key={item._id ?? `message-${index}`}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                          mine
                            ? "bg-primary text-primary-foreground"
                            : isSystemNote
                              ? "bg-gold-surface text-gold-foreground"
                              : "bg-muted text-foreground"
                        }`}
                      >
                        {!mine && name ? (
                          <p className="text-xs font-semibold leading-[1.8] opacity-80">{name}</p>
                        ) : null}
                        <p className="whitespace-pre-line text-sm leading-[1.9]">{item.message}</p>
                        <p className="text-[11px] leading-[1.8] opacity-70">
                          {formatDate(item.timestamp ?? item.createdAt)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <div ref={threadEndRef} />

            <form
              className="mt-4 flex items-end gap-2 border-t border-border pt-3"
              onSubmit={(event) => {
                event.preventDefault()
                void sendMessage()
              }}
            >
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t("consultations.messagePlaceholder")}
                aria-label={t("consultations.messagePlaceholder")}
                rows={2}
                maxLength={2000}
                lang={currentLanguage}
                className="min-h-[44px] resize-none text-sm leading-[1.9]"
              />
              <Button
                type="submit"
                size="icon"
                className="tap-target shrink-0"
                disabled={sending || !draft.trim()}
                aria-label={sending ? t("consultations.sending") : t("ai.send")}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="flip-rtl h-4 w-4" aria-hidden />
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* --------------------------------------------------------- resolution */}
      {consultation.resolution?.summary ? (
        <Card className="mb-4">
          <CardContent className="space-y-1 p-4">
            <h2 className="text-base font-bold leading-[1.7] text-foreground">{t("consultations.resolution")}</h2>
            <p className="whitespace-pre-line text-sm leading-[1.9] text-muted-foreground">
              {consultation.resolution.summary}
            </p>
            {consultation.resolution.resolvedAt ? (
              <p className="text-xs leading-[1.8] text-muted-foreground">
                {formatDate(consultation.resolution.resolvedAt)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------- rating */}
      <RatingPanel
        consultationId={consultation._id}
        canRate={isFarmer && !consultation.rating?.score && consultation.status === "resolved"}
        existing={consultation.rating ?? null}
        onRated={() => void load()}
      />
    </div>
  )
}

/* ------------------------------------------------------------ rating panel */

function RatingPanel({
  consultationId,
  canRate,
  existing,
  onRated,
}: {
  consultationId: string
  canRate: boolean
  existing: { score?: number; feedback?: string } | null
  onRated: () => void
}) {
  const { t } = useLanguage()
  const [score, setScore] = useState(0)
  const [saving, setSaving] = useState(false)

  if (existing?.score) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4">
          <span className="text-sm font-semibold leading-[1.8] text-foreground">
            {t("consultations.yourRating")}
          </span>
          <span className="flex items-center gap-0.5" aria-label={String(existing.score)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className={`h-4 w-4 ${value <= (existing.score ?? 0) ? "fill-current text-gold" : "text-muted-foreground"}`}
                aria-hidden
              />
            ))}
          </span>
        </CardContent>
      </Card>
    )
  }

  if (!canRate) return null

  const submit = async (value: number) => {
    setScore(value)
    setSaving(true)
    try {
      const response = await api.put(`/consultations/${encodeURIComponent(consultationId)}`, {
        action: "rate",
        data: { score: value },
      })
      if (response.data?.success) {
        toast.success(t("common.success"))
        onRated()
      } else {
        toast.error(response.data?.message || t("validation.somethingWentWrong"))
      }
    } catch {
      toast.error(t("validation.networkError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-4">
        <span className="text-sm font-semibold leading-[1.8] text-foreground">{t("consultations.rateThis")}</span>
        <span className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              onClick={() => void submit(value)}
              aria-label={String(value)}
              className="tap-target rounded-lg"
            >
              <Star
                className={`h-6 w-6 ${value <= score ? "fill-current text-gold" : "text-muted-foreground"}`}
                aria-hidden
              />
            </button>
          ))}
        </span>
      </CardContent>
    </Card>
  )
}
