"use client"

/**
 * Expert consultations — list + booking + the expert directory.
 *
 *   GET  /api/consultations   the caller's own threads (farmer or assigned expert)
 *   POST /api/consultations   book one; the API assigns an expert when it can
 *   GET  /api/expert          the adviser directory
 *
 * A consultation is private, so this page is auth-only: anonymous visitors are
 * sent to /auth/login rather than shown an empty list.
 *
 * The directory honestly labels `source: "sample"` rows — those are illustrative
 * profiles the API returns when nobody has registered, and they cannot be booked.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Stethoscope,
  Users,
} from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { consultationsApi, expertApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TranslationKey } from "@/lib/i18n"

/* -------------------------------------------------------------------- types */

export interface ConsultationParty {
  _id?: string
  name?: string
  district?: string | null
  state?: string | null
  specialization?: string[] | string
  qualification?: string | null
}

export interface ConsultationSummary {
  _id: string
  subject?: string
  description?: string
  type?: string
  status?: string
  priority?: string
  createdAt?: string
  farmer?: ConsultationParty | null
  expert?: ConsultationParty | null
  cropDetails?: { cropName?: string | null }
  messages?: unknown[]
  recommendations?: unknown[]
  analytics?: { messagesExchanged?: number; recommendationsGiven?: number }
}

interface DirectoryExpert {
  _id: string
  userId: string | null
  name: string
  qualification?: string | null
  specialization?: string[]
  experience?: number
  languages?: string[]
  district?: string | null
  province?: string | null
  consultationFee?: number
  responseTime?: number
  isVerified?: boolean
  isAvailable?: boolean
  bio?: string | null
  isSample?: boolean
}

/* ---------------------------------------------------------------- constants */

/** Mirrors CONSULTATION_TYPES in app/api/consultations/_lib/helpers.ts. */
const CONSULTATION_TYPES: { value: string; labelKey: TranslationKey }[] = [
  { value: "crop_disease", labelKey: "consultations.typeCropDisease" },
  { value: "pest_control", labelKey: "consultations.typePestControl" },
  { value: "soil_management", labelKey: "consultations.typeSoilManagement" },
  { value: "irrigation", labelKey: "consultations.typeIrrigation" },
  { value: "fertilizer", labelKey: "consultations.typeFertilizer" },
  { value: "harvesting", labelKey: "consultations.typeHarvesting" },
  { value: "market_advisory", labelKey: "consultations.typeMarketAdvisory" },
  { value: "general", labelKey: "consultations.typeGeneral" },
]

/** Mirrors CONSULTATION_STATUSES. */
const CONSULTATION_STATUSES: { value: string; labelKey: TranslationKey }[] = [
  { value: "open", labelKey: "consultations.statusOpen" },
  { value: "assigned", labelKey: "consultations.statusAssigned" },
  { value: "in_progress", labelKey: "consultations.statusInProgress" },
  { value: "resolved", labelKey: "consultations.statusResolved" },
  { value: "closed", labelKey: "consultations.statusClosed" },
  { value: "follow_up_required", labelKey: "consultations.statusFollowUp" },
]

const PRIORITIES: { value: string; labelKey: TranslationKey }[] = [
  { value: "low", labelKey: "consultations.priorityLow" },
  { value: "medium", labelKey: "consultations.priorityMedium" },
  { value: "high", labelKey: "consultations.priorityHigh" },
  { value: "urgent", labelKey: "consultations.priorityUrgent" },
]

/** Token classes only — these must stay legible in dark mode and in sunlight. */
const STATUS_STYLES: Record<string, string> = {
  open: "bg-secondary text-secondary-foreground",
  assigned: "bg-primary/15 text-primary",
  in_progress: "bg-gold-surface text-gold-foreground",
  resolved: "bg-primary text-primary-foreground",
  closed: "bg-muted text-muted-foreground",
  follow_up_required: "bg-destructive/15 text-destructive",
}

function labelKeyFor(
  list: { value: string; labelKey: TranslationKey }[],
  value?: string,
): TranslationKey | null {
  return list.find((item) => item.value === value)?.labelKey ?? null
}

/* --------------------------------------------------------------------- page */

export default function ConsultationsPage() {
  const { t, formatCurrency, formatNumber } = useLanguage()
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [consultations, setConsultations] = useState<ConsultationSummary[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [experts, setExperts] = useState<DirectoryExpert[]>([])
  const [expertsSample, setExpertsSample] = useState(false)
  const [expertsLoading, setExpertsLoading] = useState(true)
  const [expertsNotice, setExpertsNotice] = useState<string | null>(null)

  const [bookingOpen, setBookingOpen] = useState(false)
  const [preselectedExpert, setPreselectedExpert] = useState<DirectoryExpert | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth/login")
  }, [authLoading, user, router])

  const loadConsultations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await consultationsApi.list({ status: status ?? undefined, limit: 50 })
      if (!res.success) {
        setError(res.message || t("consultations.loadError"))
        setConsultations([])
        return
      }
      setConsultations((res.data ?? res.consultations ?? []) as ConsultationSummary[])
    } catch {
      setError(t("validation.networkError"))
      setConsultations([])
    } finally {
      setLoading(false)
    }
  }, [status, t])

  useEffect(() => {
    if (!user) return
    void loadConsultations()
  }, [user, loadConsultations])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      setExpertsLoading(true)
      try {
        const res = await expertApi.list({ limit: 12 })
        if (cancelled) return
        if (!res.success) {
          setExperts([])
          setExpertsNotice(res.message ?? null)
          return
        }
        setExperts((res.data ?? []) as DirectoryExpert[])
        setExpertsSample(res.source === "sample")
        setExpertsNotice(res.source === "sample" ? t("consultations.sampleNotice") : null)
      } catch {
        if (!cancelled) {
          setExperts([])
          setExpertsNotice(t("validation.networkError"))
        }
      } finally {
        if (!cancelled) setExpertsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, t])

  const timeAgo = useCallback(
    (value?: string) => {
      if (!value) return ""
      const then = new Date(value).getTime()
      if (Number.isNaN(then)) return ""
      const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000))
      if (minutes < 1) return t("common.justNow")
      if (minutes < 60) return t("common.minutesAgo", { count: minutes })
      const hours = Math.round(minutes / 60)
      if (hours < 24) return t("common.hoursAgo", { count: hours })
      return t("common.daysAgo", { count: Math.round(hours / 24) })
    },
    [t],
  )

  const openBooking = (expert: DirectoryExpert | null) => {
    setPreselectedExpert(expert)
    setBookingOpen(true)
  }

  if (authLoading || !user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="text-sm leading-[1.8]">{t("common.loading")}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
      {/* ------------------------------------------------------------ header */}
      <header className="mb-5">
        <h1 className="text-2xl font-bold leading-[1.6] text-foreground sm:text-3xl">{t("consultations.title")}</h1>
        <p className="mt-1 text-sm leading-[1.8] text-muted-foreground">{t("consultations.subtitle")}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button className="min-h-tap flex-1 sm:flex-none" onClick={() => openBooking(null)}>
            <Plus className="me-2 h-5 w-5" aria-hidden />
            {t("consultations.book")}
          </Button>
          <Button asChild variant="outline" className="min-h-tap">
            <Link href="/community">
              <Users className="me-2 h-4 w-4" aria-hidden />
              {t("community.title")}
            </Link>
          </Button>
        </div>
      </header>

      {/* ------------------------------------------------------ status chips */}
      <div className="scroll-x no-scrollbar -mx-4 mb-4 px-4 sm:-mx-6 sm:px-6">
        <div className="flex w-max gap-2 pb-1">
          <button
            type="button"
            onClick={() => setStatus(null)}
            aria-pressed={status === null}
            className={`min-h-tap whitespace-nowrap rounded-full border px-4 text-sm font-medium leading-[1.8] transition-colors ${
              status === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("consultations.allStatuses")}
          </button>
          {CONSULTATION_STATUSES.map((item) => {
            const active = status === item.value
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setStatus(active ? null : item.value)}
                aria-pressed={active}
                className={`min-h-tap whitespace-nowrap rounded-full border px-4 text-sm font-medium leading-[1.8] transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(item.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      {/* ----------------------------------------------------- consultations */}
      <section aria-labelledby="my-consultations" className="mb-8">
        <h2 id="my-consultations" className="mb-3 text-lg font-bold leading-[1.7] text-foreground">
          {t("consultations.mine")}
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <Card key={key}>
                <CardContent className="space-y-3 p-4">
                  <div className="skeleton h-4 w-2/3" />
                  <div className="skeleton h-3 w-1/3" />
                  <div className="skeleton h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
              <p className="text-sm leading-[1.8] text-muted-foreground">{error}</p>
              <Button variant="outline" className="min-h-tap" onClick={() => void loadConsultations()}>
                {t("common.retry")}
              </Button>
            </CardContent>
          </Card>
        ) : consultations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <Stethoscope className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-sm leading-[1.8] text-muted-foreground">{t("consultations.noConsultations")}</p>
              <Button className="min-h-tap" onClick={() => openBooking(null)}>
                <Plus className="me-2 h-5 w-5" aria-hidden />
                {t("consultations.book")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {consultations.map((item) => {
              const statusKey = labelKeyFor(CONSULTATION_STATUSES, item.status)
              const typeKey = labelKeyFor(CONSULTATION_TYPES, item.type)
              const messageCount = item.analytics?.messagesExchanged ?? item.messages?.length ?? 0

              return (
                <li key={item._id}>
                  <Link
                    href={`/consultations/${item._id}`}
                    className="card-hover block rounded-xl border border-border bg-card p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-[1.7] ${
                          STATUS_STYLES[item.status ?? ""] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {statusKey ? t(statusKey) : item.status}
                      </span>
                      {typeKey ? (
                        <Badge variant="outline" className="text-[11px] leading-[1.7]">
                          {t(typeKey)}
                        </Badge>
                      ) : null}
                      {item.priority === "urgent" ? (
                        <Badge variant="destructive" className="text-[11px] leading-[1.7]">
                          {t("consultations.priorityUrgent")}
                        </Badge>
                      ) : null}
                    </div>

                    <h3 className="mt-2 text-base font-bold leading-[1.7] text-foreground">{item.subject}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-[1.9] text-muted-foreground">
                      {item.description}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-[1.8] text-muted-foreground">
                      <span>
                        {t("consultations.expert")}:{" "}
                        {item.expert?.name ? item.expert.name : t("consultations.awaitingExpert")}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                        <span className="force-ltr">{formatNumber(messageCount)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* -------------------------------------------------- expert directory */}
      <section aria-labelledby="expert-directory">
        <h2 id="expert-directory" className="text-lg font-bold leading-[1.7] text-foreground">
          {t("consultations.experts")}
        </h2>
        <p className="mb-3 text-sm leading-[1.8] text-muted-foreground">{t("consultations.expertsSubtitle")}</p>

        {expertsNotice ? (
          <p className={`mb-3 text-sm leading-[1.9] ${expertsSample ? "badge-sample" : "text-muted-foreground"}`}>
            {expertsNotice}
          </p>
        ) : null}

        {expertsLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1].map((key) => (
              <Card key={key}>
                <CardContent className="space-y-3 p-4">
                  <div className="skeleton h-4 w-1/2" />
                  <div className="skeleton h-3 w-3/4" />
                  <div className="skeleton h-3 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : experts.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm leading-[1.8] text-muted-foreground">
              {t("consultations.noExperts")}
            </CardContent>
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {experts.map((expert) => {
              const place = [expert.district, expert.province].filter(Boolean).join(", ")
              const bookable = Boolean(expert.userId) && expert.isAvailable !== false && !expert.isSample

              return (
                <li key={expert._id}>
                  <Card className="h-full">
                    <CardContent className="flex h-full flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold leading-[1.8] text-foreground">{expert.name}</h3>
                        {expert.isSample ? (
                          <span className="badge-sample shrink-0">{t("common.sampleData")}</span>
                        ) : expert.isVerified ? (
                          <BadgeCheck className="h-5 w-5 shrink-0 text-primary" aria-label={t("consultations.verified")} />
                        ) : null}
                      </div>

                      {expert.qualification ? (
                        <p className="text-xs leading-[1.9] text-muted-foreground">{expert.qualification}</p>
                      ) : null}

                      {place ? (
                        <p className="flex items-center gap-1 text-xs leading-[1.8] text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {place}
                        </p>
                      ) : null}

                      {(expert.specialization ?? []).length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {(expert.specialization ?? []).slice(0, 3).map((item) => {
                            const key = labelKeyFor(CONSULTATION_TYPES, item)
                            return (
                              <Badge key={item} variant="secondary" className="text-[11px] leading-[1.7]">
                                {key ? t(key) : item.replace(/_/g, " ")}
                              </Badge>
                            )
                          })}
                        </div>
                      ) : null}

                      {expert.experience ? (
                        <p className="text-xs leading-[1.8] text-muted-foreground">
                          {t("consultations.experienceYears", { count: expert.experience })}
                        </p>
                      ) : null}

                      <p className="text-xs leading-[1.8] text-muted-foreground">
                        {t("consultations.fee")}:{" "}
                        <span className="font-semibold text-foreground">
                          {expert.consultationFee ? formatCurrency(expert.consultationFee) : t("consultations.free")}
                        </span>
                      </p>

                      <div className="mt-auto pt-2">
                        {bookable ? (
                          <Button
                            variant="outline"
                            className="min-h-tap w-full"
                            onClick={() => openBooking(expert)}
                          >
                            {t("consultations.bookWithExpert")}
                          </Button>
                        ) : (
                          <p className="text-xs leading-[1.8] text-muted-foreground">
                            {t("consultations.notAvailable")}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <BookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        expert={preselectedExpert}
        onBooked={(created) => {
          setBookingOpen(false)
          setConsultations((current) => [created, ...current])
          toast.success(t("consultations.booked"))
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------ booking form */

function BookingDialog({
  open,
  onOpenChange,
  expert,
  onBooked,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  expert: DirectoryExpert | null
  onBooked: (created: ConsultationSummary) => void
}) {
  const { t } = useLanguage()

  const [type, setType] = useState("crop_disease")
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [cropName, setCropName] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  /* Reset the form each time the sheet opens, so a previous draft (or a previous
     expert) never leaks into the next booking. */
  useEffect(() => {
    if (!open) return
    setType(expert?.specialization?.[0] ?? "crop_disease")
    setSubject("")
    setDescription("")
    setPriority("medium")
    setCropName("")
    setFormError(null)
  }, [open, expert])

  const validType = useMemo(
    () => (CONSULTATION_TYPES.some((item) => item.value === type) ? type : "general"),
    [type],
  )

  const submit = async () => {
    setFormError(null)

    if (subject.trim().length < 5 || description.trim().length < 10) {
      setFormError(t("validation.tooShort"))
      return
    }

    setSaving(true)
    try {
      const res = await consultationsApi.create({
        type: validType,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        expertId: expert?.userId ?? undefined,
        cropDetails: cropName.trim() ? { cropName: cropName.trim() } : undefined,
      })

      if (!res.success || !res.data) {
        setFormError(res.message || t("validation.somethingWentWrong"))
        return
      }

      onBooked(res.data as ConsultationSummary)
    } catch {
      setFormError(t("validation.networkError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle className="leading-[1.7]">{t("consultations.book")}</DialogTitle>
          <DialogDescription className="leading-[1.8]">
            {expert ? `${t("consultations.selectedExpert")}: ${expert.name}` : t("consultations.anyExpert")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="consult-type" className="leading-[1.8]">
                {t("consultations.helpType")}
              </Label>
              <Select value={validType} onValueChange={setType}>
                <SelectTrigger id="consult-type" className="min-h-tap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSULTATION_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="min-h-tap">
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="consult-priority" className="leading-[1.8]">
                {t("consultations.priority")}
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="consult-priority" className="min-h-tap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((item) => (
                    <SelectItem key={item.value} value={item.value} className="min-h-tap">
                      {t(item.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="consult-subject" className="leading-[1.8]">
              {t("consultations.subject")}
            </Label>
            <Input
              id="consult-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t("consultations.subjectPlaceholder")}
              maxLength={200}
              className="min-h-tap leading-[1.8]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="consult-description" className="leading-[1.8]">
              {t("consultations.describe")}
            </Label>
            <Textarea
              id="consult-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("consultations.describePlaceholder")}
              rows={5}
              className="leading-[1.9]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="consult-crop" className="leading-[1.8]">
              {t("consultations.cropName")}{" "}
              <span className="text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input
              id="consult-crop"
              value={cropName}
              onChange={(event) => setCropName(event.target.value)}
              className="min-h-tap leading-[1.8]"
            />
          </div>

          {formError ? (
            <p role="alert" className="text-sm leading-[1.8] text-destructive">
              {formError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="min-h-tap" disabled={saving} onClick={() => void submit()}>
            {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            {saving ? t("consultations.booking") : t("consultations.book")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
