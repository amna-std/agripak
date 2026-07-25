"use client"

/**
 * /crop-scan — photo-based crop disease diagnosis. The flagship AI screen.
 *
 * Flow: capture or pick a photo -> downscale it in the browser -> POST it as a
 * data URL to `/api/ai/diagnose` -> render the structured diagnosis.
 *
 * Three things this screen takes seriously:
 *
 *  1. The upload budget. Vercel caps the request body at 4.5 MB and the route
 *     rejects anything over 3 MB of image, while a modern phone camera happily
 *     produces 6 MB. Every photo is therefore re-encoded to a bounded JPEG on
 *     the device before it is ever sent.
 *
 *  2. The "unusable photo" states. The model can answer `isPlant: false`,
 *     `imageQuality: "poor"` or `needsBetterPhoto: true`. Those get their own
 *     friendly retake screen — an empty diagnosis is never rendered as if it
 *     were a real one.
 *
 *  3. Honesty. `disclaimer` from the API is always shown, sample-free: nothing
 *     on this page is invented locally, and a failed call shows the API's own
 *     message rather than a made-up answer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Bug,
  Camera,
  CheckCircle2,
  ChevronDown,
  ImageIcon,
  Info,
  Leaf,
  Loader2,
  MessageCircle,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Square,
  Stethoscope,
  Trash2,
  TriangleAlert,
  Volume2,
  X,
} from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { aiApi, cropsApi, type ApiEnvelope } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

/* --------------------------------------------------------------- contract */

/**
 * The full `/api/ai/diagnose` payload. `lib/api.ts` only types a subset of it
 * and that file belongs to another agent, so the extra fields are declared here.
 */
interface TreatmentStep {
  step: number
  action: string | null
  type: "organic" | "chemical" | "biological" | "cultural" | string
  product: string | null
  dosage: string | null
  timing: string | null
  estimatedCostPKR: string | null
  safetyNote: string | null
}

interface AlternativeDiagnosis {
  name: string
  category: string
  confidence: number
  howToTell: string | null
}

interface Diagnosis {
  parsed: boolean
  isPlant: boolean
  imageQuality: "good" | "fair" | "poor" | string
  needsBetterPhoto: boolean
  cropIdentified: string | null
  disease: string | null
  diseaseLocalName: string | null
  category: string
  confidence: number
  severity: "mild" | "moderate" | "severe" | string
  affectedArea: string
  spreadRisk: "low" | "medium" | "high" | string
  symptoms: string[]
  alternatives: AlternativeDiagnosis[]
  treatment: TreatmentStep[]
  prevention: string[]
  organicOptions: string[]
  whenToConsultExpert: string | null
  yieldRiskNote: string | null
  farmerSummary: string | null
  diagnosisId: string | null
  disclaimer: string
  rawAnalysis?: string
}

type ScanResult = ApiEnvelope & Partial<Diagnosis>

/* ------------------------------------------------------- image processing */

/**
 * Longest edge of the photo we upload. 1400px is well above what the model
 * needs to see leaf lesions and keeps a re-encoded JPEG comfortably inside the
 * route's 3 MB ceiling.
 */
const MAX_DIMENSION = 1400
/** Stay under the route's 3 MB limit with room for the base64 envelope. */
const TARGET_BYTES = 2_200_000

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("read-failed"))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("decode-failed"))
    image.src = src
  })
}

/** Rough decoded size of a data URL, without allocating the buffer. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",")
  const body = comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
  return Math.floor((body.length * 3) / 4)
}

/**
 * Re-encodes a camera photo to a bounded JPEG. Falls back to the original data
 * URL when the browser cannot decode the format (HEIC on some Androids) — the
 * API accepts HEIC too, so that is still a usable upload.
 */
async function prepareImage(file: File): Promise<string> {
  const original = await readAsDataUrl(file)

  let image: HTMLImageElement
  try {
    image = await loadImage(original)
  } catch {
    return original
  }

  const longest = Math.max(image.width, image.height) || MAX_DIMENSION
  const scale = Math.min(1, MAX_DIMENSION / longest)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return original
  context.drawImage(image, 0, 0, width, height)

  let quality = 0.85
  let encoded = canvas.toDataURL("image/jpeg", quality)
  while (dataUrlBytes(encoded) > TARGET_BYTES && quality > 0.35) {
    quality -= 0.15
    encoded = canvas.toDataURL("image/jpeg", quality)
  }
  return encoded
}

/* -------------------------------------------------------------- constants */

/** Roughly how long a vision call takes, used to pace the progress bar. */
const EXPECTED_SECONDS = 15

/* --------------------------------------------------------- small building blocks */

function SectionCard({
  icon: Icon,
  title,
  tone = "default",
  children,
}: {
  icon: React.ElementType
  title: string
  tone?: "default" | "warning" | "success" | "info"
  children: React.ReactNode
}) {
  const tones = {
    default: "border-border bg-card",
    warning: "border-warning/40 bg-warning/10",
    success: "border-success/40 bg-success/10",
    info: "border-info/40 bg-info/10",
  } as const
  const iconTones = {
    default: "bg-secondary text-secondary-foreground",
    warning: "bg-warning/20 text-warning",
    success: "bg-success/20 text-success",
    info: "bg-info/20 text-info",
  } as const

  return (
    <section className={cn("rounded-2xl border p-4", tones[tone])}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold leading-[1.8] text-foreground">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconTones[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">{title}</span>
      </h2>
      {children}
    </section>
  )
}

function BulletList({ items, marker = "dot" }: { items: string[]; marker?: "dot" | "check" | "warn" }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${index}-${item.slice(0, 12)}`} className="flex gap-2 text-sm leading-[1.9] text-foreground">
          {marker === "check" ? (
            <CheckCircle2 className="mt-1.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          ) : marker === "warn" ? (
            <TriangleAlert className="mt-1.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          )}
          <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-2.5">
      <p className="text-[0.6875rem] font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("text-sm font-bold leading-[1.8]", tone ?? "text-foreground")}>{value}</p>
    </div>
  )
}

/* -------------------------------------------------------------------- page */

export default function CropScanPage() {
  const { t, currentLanguage, formatNumber, speak, stopSpeaking, voiceEnabled, toggleVoice } = useLanguage()
  const { user } = useAuth()

  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)

  const [crop, setCrop] = useState("")
  const [notes, setNotes] = useState("")
  const [cropOptions, setCropOptions] = useState<Array<{ id: string; name: string; nameUr: string }>>([])

  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [overrideRetake, setOverrideRetake] = useState(false)
  const [tipsOpen, setTipsOpen] = useState(false)
  const [narrating, setNarrating] = useState(false)
  const [pendingSpeak, setPendingSpeak] = useState<string | null>(null)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  /* ------------------------------------------------------------ crop list */

  useEffect(() => {
    let cancelled = false
    cropsApi
      .list({ limit: 60 })
      .then((res) => {
        if (cancelled || !res.success) return
        const crops = (res.data as any)?.crops
        if (Array.isArray(crops)) {
          setCropOptions(crops.map((c: any) => ({ id: c.id, name: c.name, nameUr: c.nameUr })))
        }
      })
      .catch(() => {
        /* the crop hint is optional — the scan works without it */
      })
    return () => {
      cancelled = true
    }
  }, [])

  /* -------------------------------------------------------------- progress */

  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [loading])

  const stageIndex = Math.min(3, Math.floor(elapsed / 4))
  const progress = Math.min(94, Math.round((elapsed / EXPECTED_SECONDS) * 90) + 4)

  /* ----------------------------------------------------------------- voice */

  useEffect(() => stopSpeaking, [stopSpeaking])

  useEffect(() => {
    if (voiceEnabled && pendingSpeak) {
      speak(pendingSpeak)
      setPendingSpeak(null)
    }
  }, [voiceEnabled, pendingSpeak, speak])

  /* ----------------------------------------------------------- photo intake */

  const onPickFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return
    setPhotoError(null)
    if (!file.type.startsWith("image/")) {
      setPhotoError(t("scan.imagesOnly"))
      return
    }
    setPreparing(true)
    try {
      const dataUrl = await prepareImage(file)
      if (dataUrlBytes(dataUrl) > 3_000_000) {
        setPhotoError(t("validation.imageTooLarge"))
        return
      }
      setPhoto(dataUrl)
      setResult(null)
      setFailure(null)
      setOverrideRetake(false)
    } catch {
      setPhotoError(t("scan.imageError"))
    } finally {
      setPreparing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearPhoto = () => {
    setPhoto(null)
    setResult(null)
    setFailure(null)
    setPhotoError(null)
    setOverrideRetake(false)
    if (cameraInputRef.current) cameraInputRef.current.value = ""
    if (galleryInputRef.current) galleryInputRef.current.value = ""
  }

  /* --------------------------------------------------------------- diagnose */

  const diagnose = async () => {
    if (!photo || loading) return
    stopSpeaking()
    setNarrating(false)
    setLoading(true)
    setResult(null)
    setFailure(null)
    setOverrideRetake(false)

    try {
      const res = (await aiApi.diagnose({
        image: photo,
        crop: crop && crop !== "unknown" ? crop : undefined,
        description: notes.trim() || undefined,
        language: currentLanguage,
      })) as unknown as ScanResult

      if (!res.success) {
        setFailure(res.message || t("validation.somethingWentWrong"))
      } else {
        setResult(res)
      }
    } catch {
      setFailure(t("validation.networkError"))
    } finally {
      setLoading(false)
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60)
    }
  }

  /* ------------------------------------------------------------- narration */

  const spokenSummary = useMemo(() => {
    if (!result?.success) return ""
    const parts: string[] = []
    if (result.disease) parts.push(result.disease)
    if (result.farmerSummary) parts.push(result.farmerSummary)
    for (const step of result.treatment ?? []) {
      if (step.action) parts.push(step.action)
    }
    return parts.join(". ")
  }, [result])

  const toggleNarration = () => {
    if (narrating) {
      stopSpeaking()
      setNarrating(false)
      return
    }
    if (!spokenSummary) return
    setNarrating(true)
    if (voiceEnabled) speak(spokenSummary)
    else {
      setPendingSpeak(spokenSummary)
      void toggleVoice()
    }
  }

  /* -------------------------------------------------------------- derived */

  const severityTone = (severity?: string) =>
    severity === "severe"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : severity === "mild"
        ? "border-success/40 bg-success/10 text-success"
        : "border-warning/40 bg-warning/10 text-warning"

  const levelLabel = (value?: string) =>
    value === "low"
      ? t("level.low")
      : value === "high"
        ? t("level.high")
        : value === "medium"
          ? t("level.medium")
          : value ?? "—"

  const severityLabel = (value?: string) =>
    value === "mild" ? t("level.mild") : value === "severe" ? t("level.severe") : t("level.moderate")

  const qualityLabel = (value?: string) =>
    value === "good" ? t("level.good") : value === "poor" ? t("level.poor") : t("level.fair")

  const areaLabel = (value?: string) =>
    value === "fruits"
      ? t("scan.partFruits")
      : value === "stems"
        ? t("scan.partStems")
        : value === "roots"
          ? t("scan.partRoots")
          : value === "whole_plant"
            ? t("scan.partWholePlant")
            : t("scan.partLeaves")

  const treatmentTypeLabel = (value?: string) =>
    value === "organic"
      ? t("scan.typeOrganic")
      : value === "chemical"
        ? t("scan.typeChemical")
        : value === "biological"
          ? t("scan.typeBiological")
          : t("scan.typeCultural")

  const stages = [t("scan.stage1"), t("scan.stage2"), t("scan.stage3"), t("scan.stage4")]

  const needsRetake =
    !!result?.success &&
    result.parsed !== false &&
    (result.isPlant === false || result.needsBetterPhoto === true || result.imageQuality === "poor")

  const healthy =
    !!result?.success && result.parsed !== false && !needsRetake && (result.category === "healthy" || !result.disease)

  const showDiagnosis = !!result?.success && result.parsed !== false && (!needsRetake || overrideRetake) && !healthy

  /* -------------------------------------------------------------- rendering */

  return (
    <div className="pb-8">
      {/* ------------------------------------------------------------- hero */}
      <header className="bg-brand-gradient">
        <div className="container-app py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <ScanLine className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-[1.8]">{t("scan.title")}</h1>
              <p className="text-sm leading-[1.9] opacity-90">{t("scan.subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container-app space-y-5 py-5">
        {/* ------------------------------------------------------ photo tips */}
        <div className="overflow-hidden rounded-2xl border border-gold/40 bg-gold-surface/60">
          <button
            type="button"
            onClick={() => setTipsOpen((open) => !open)}
            aria-expanded={tipsOpen}
            className="flex min-h-tap w-full items-center gap-2 px-4 py-3 text-start"
          >
            <Info className="h-5 w-5 shrink-0 text-gold-foreground" aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-bold leading-[1.8] text-gold-foreground">
              {t("scan.tipsTitle")}
            </span>
            <ChevronDown
              className={cn("h-5 w-5 shrink-0 text-gold-foreground transition-transform", tipsOpen && "rotate-180")}
              aria-hidden
            />
          </button>
          {tipsOpen ? (
            <div className="border-t border-gold/30 px-4 py-3">
              <BulletList items={[t("scan.tip1"), t("scan.tip2"), t("scan.tip3"), t("scan.tip4")]} marker="check" />
            </div>
          ) : null}
        </div>

        {/* --------------------------------------------------------- capture */}
        <Card className="overflow-hidden rounded-2xl">
          <CardContent className="space-y-4 p-4">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => onPickFile(event.target.files?.[0])}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => onPickFile(event.target.files?.[0])}
            />

            {photo ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt={t("scan.photoReady")}
                    className="mx-auto max-h-72 w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label={t("scan.removePhoto")}
                    className="tap-target absolute end-2 top-2 rounded-full bg-background/90 text-foreground shadow-md"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => cameraInputRef.current?.click()}
                    className="min-h-tap flex-1 rounded-xl"
                  >
                    <RefreshCw className="me-2 h-4 w-4" aria-hidden />
                    <span className="leading-[1.8]">{t("scan.retake")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={clearPhoto}
                    aria-label={t("scan.removePhoto")}
                    className="tap-target rounded-xl text-muted-foreground"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-border bg-muted/40 px-4 py-7 text-center">
                <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Leaf className="h-7 w-7" aria-hidden />
                </span>
                <p className="mb-4 text-sm leading-[1.9] text-muted-foreground">{t("scan.emptyHint")}</p>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={preparing}
                    className="min-h-tap w-full rounded-xl text-base"
                  >
                    {preparing ? (
                      <Loader2 className="me-2 h-5 w-5 animate-spin" aria-hidden />
                    ) : (
                      <Camera className="me-2 h-5 w-5" aria-hidden />
                    )}
                    <span className="leading-[1.8]">{t("scan.takePhoto")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={preparing}
                    className="min-h-tap w-full rounded-xl text-base"
                  >
                    <ImageIcon className="me-2 h-5 w-5" aria-hidden />
                    <span className="leading-[1.8]">{t("scan.choosePhoto")}</span>
                  </Button>
                </div>
              </div>
            )}

            {photoError ? (
              <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-[1.9] text-destructive">
                <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden />
                <span>{photoError}</span>
              </p>
            ) : null}

            {/* ------------------------------------------------- extra detail */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="scan-crop" className="text-sm font-semibold leading-[1.8]">
                  {t("scan.cropLabel")}{" "}
                  <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                </Label>
                <Select value={crop} onValueChange={setCrop}>
                  <SelectTrigger id="scan-crop" className="min-h-tap rounded-xl text-start">
                    <SelectValue placeholder={t("scan.cropUnknown")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">{t("scan.cropUnknown")}</SelectItem>
                    {cropOptions.map((option) => (
                      <SelectItem key={option.id} value={option.name}>
                        {currentLanguage === "en" ? option.name : `${option.nameUr} — ${option.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="scan-notes" className="text-sm font-semibold leading-[1.8]">
                  {t("scan.notesLabel")}{" "}
                  <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                </Label>
                <Textarea
                  id="scan-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={t("scan.notesPlaceholder")}
                  className="resize-none rounded-xl text-start text-base leading-[1.9]"
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={diagnose}
              disabled={!photo || loading || preparing}
              className="min-h-[3.25rem] w-full rounded-xl text-base font-bold"
            >
              {loading ? (
                <Loader2 className="me-2 h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="me-2 h-5 w-5" aria-hidden />
              )}
              <span className="leading-[1.8]">{loading ? t("scan.analyzing") : t("scan.diagnose")}</span>
            </Button>
            {!photo ? (
              <p className="text-center text-xs leading-[1.9] text-muted-foreground">{t("scan.needPhoto")}</p>
            ) : null}
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- progress */}
        {loading ? (
          <Card className="rounded-2xl border-primary/40">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
                <p className="min-w-0 flex-1 text-sm font-bold leading-[1.8] text-foreground">{t("scan.analyzing")}</p>
                <span className="shrink-0 text-sm font-bold tabular-nums text-primary force-ltr">
                  {formatNumber(progress)}%
                </span>
              </div>

              <Progress value={progress} className="h-2" />

              <ol className="space-y-2" aria-live="polite">
                {stages.map((stage, index) => (
                  <li
                    key={stage}
                    className={cn(
                      "flex items-center gap-2 text-sm leading-[1.9]",
                      index < stageIndex
                        ? "text-muted-foreground"
                        : index === stageIndex
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground/60",
                    )}
                  >
                    {index < stageIndex ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                    ) : index === stageIndex ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-border" aria-hidden />
                    )}
                    <span className="min-w-0">{stage}</span>
                  </li>
                ))}
              </ol>

              <p className="text-xs leading-[1.9] text-muted-foreground">{t("scan.analyzingNote")}</p>
            </CardContent>
          </Card>
        ) : null}

        {/* --------------------------------------------------------- results */}
        <div ref={resultRef} className="scroll-mt-20 space-y-5">
          {/* Call failed outright */}
          {failure ? (
            <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
              <CardContent className="space-y-3 p-4">
                <h2 className="flex items-center gap-2 text-sm font-bold leading-[1.8] text-destructive">
                  <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                  {t("scan.failedTitle")}
                </h2>
                <p className="text-sm leading-[1.9] text-foreground">{failure}</p>
                <Button type="button" onClick={diagnose} className="min-h-tap w-full rounded-xl">
                  <RefreshCw className="me-2 h-4 w-4" aria-hidden />
                  <span className="leading-[1.8]">{t("common.retry")}</span>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* The model answered, but not as JSON */}
          {result?.success && result.parsed === false ? (
            <Card className="rounded-2xl border-warning/40 bg-warning/5">
              <CardContent className="space-y-2 p-4">
                <h2 className="flex items-center gap-2 text-sm font-bold leading-[1.8] text-foreground">
                  <Info className="h-5 w-5 shrink-0 text-warning" aria-hidden />
                  {t("scan.rawTitle")}
                </h2>
                <p className="text-xs leading-[1.9] text-muted-foreground">{t("scan.rawBody")}</p>
                <p className="whitespace-pre-wrap break-words rounded-xl bg-background/70 p-3 text-sm leading-[1.9] text-foreground">
                  {result.rawAnalysis || result.message}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* Unusable photo — explicit retake screen, never an empty diagnosis */}
          {needsRetake && !overrideRetake ? (
            <Card className="rounded-2xl border-warning/50 bg-warning/10">
              <CardContent className="space-y-4 p-4 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/20 text-warning">
                  <Camera className="h-7 w-7" aria-hidden />
                </span>
                <div>
                  <h2 className="text-base font-bold leading-[1.8] text-foreground">
                    {result?.isPlant === false ? t("scan.notPlantTitle") : t("scan.unclearTitle")}
                  </h2>
                  <p className="mt-1 text-sm leading-[1.9] text-muted-foreground">
                    {result?.isPlant === false ? t("scan.notPlantBody") : t("scan.unclearBody")}
                  </p>
                </div>

                <div className="rounded-xl bg-background/70 p-3 text-start">
                  <BulletList items={[t("scan.tip1"), t("scan.tip2"), t("scan.tip3")]} marker="check" />
                </div>

                <Button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-tap w-full rounded-xl"
                >
                  <Camera className="me-2 h-5 w-5" aria-hidden />
                  <span className="leading-[1.8]">{t("scan.tryAgainPhoto")}</span>
                </Button>

                {result?.isPlant !== false && result?.disease ? (
                  <button
                    type="button"
                    onClick={() => setOverrideRetake(true)}
                    className="min-h-tap w-full text-sm font-semibold leading-[1.9] text-primary underline underline-offset-4"
                  >
                    {t("scan.showAnyway")}
                  </button>
                ) : null}

                {result?.disclaimer ? (
                  <p className="text-start text-xs leading-[1.9] text-muted-foreground">{result.disclaimer}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Healthy plant */}
          {healthy ? (
            <Card className="rounded-2xl border-success/50 bg-success/10">
              <CardContent className="space-y-3 p-4 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/20 text-success">
                  <ShieldCheck className="h-7 w-7" aria-hidden />
                </span>
                <h2 className="text-base font-bold leading-[1.8] text-foreground">{t("scan.healthyTitle")}</h2>
                <p className="text-sm leading-[1.9] text-muted-foreground">
                  {result?.farmerSummary || t("scan.healthyBody")}
                </p>
                {result?.prevention?.length ? (
                  <div className="rounded-xl bg-background/70 p-3 text-start">
                    <BulletList items={result.prevention} marker="check" />
                  </div>
                ) : null}
                {result?.disclaimer ? (
                  <p className="text-start text-xs leading-[1.9] text-muted-foreground">{result.disclaimer}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Full diagnosis */}
          {showDiagnosis && result ? (
            <div className="space-y-4">
              {/* Verdict */}
              <Card className="overflow-hidden rounded-2xl border-primary/30">
                <div className="bg-primary/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase leading-[1.8] tracking-wide text-primary">
                    {t("scan.resultTitle")}
                  </p>
                  <h2 className="text-lg font-bold leading-[1.8] text-foreground">
                    {result.disease || t("crops.diseaseDetected")}
                  </h2>
                  {result.diseaseLocalName ? (
                    <p className="text-sm leading-[1.9] text-muted-foreground">
                      {t("scan.localName")}: <span className="font-semibold">{result.diseaseLocalName}</span>
                    </p>
                  ) : null}
                </div>

                <CardContent className="space-y-4 p-4">
                  {/* Confidence */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                        {t("crops.confidence")}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-foreground force-ltr">
                        {formatNumber(result.confidence ?? 0)}%
                      </span>
                    </div>
                    <Progress value={result.confidence ?? 0} className="h-2" />
                    {(result.confidence ?? 0) < 60 ? (
                      <p className="mt-1.5 text-xs leading-[1.9] text-warning">{t("scan.lowConfidenceNote")}</p>
                    ) : null}
                  </div>

                  {/* Facts */}
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label={t("crops.severity")} value={severityLabel(result.severity)} />
                    <Stat label={t("scan.spreadRisk")} value={levelLabel(result.spreadRisk)} />
                    <Stat label={t("scan.affectedPart")} value={areaLabel(result.affectedArea)} />
                    <Stat label={t("scan.photoQuality")} value={qualityLabel(result.imageQuality)} />
                  </div>

                  {result.cropIdentified ? (
                    <p className="text-sm leading-[1.9] text-muted-foreground">
                      {t("scan.cropSeen")}: <span className="font-semibold text-foreground">{result.cropIdentified}</span>
                    </p>
                  ) : null}

                  <span
                    className={cn(
                      "inline-flex rounded-full border px-3 py-1 text-xs font-bold leading-[1.8]",
                      severityTone(result.severity),
                    )}
                  >
                    {severityLabel(result.severity)}
                  </span>
                </CardContent>
              </Card>

              {/* Plain-language summary + listen */}
              {result.farmerSummary ? (
                <section className="rounded-2xl border border-info/40 bg-info/10 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="min-w-0 flex-1 text-sm font-bold leading-[1.8] text-foreground">
                      {t("scan.summaryTitle")}
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={toggleNarration}
                      aria-pressed={narrating}
                      className="min-h-tap shrink-0 rounded-xl bg-background"
                    >
                      {narrating ? (
                        <Square className="me-1.5 h-3.5 w-3.5 fill-current" aria-hidden />
                      ) : (
                        <Volume2 className="me-1.5 h-4 w-4" aria-hidden />
                      )}
                      <span className="text-xs leading-[1.8]">
                        {narrating ? t("ai.stopReading") : t("scan.listen")}
                      </span>
                    </Button>
                  </div>
                  <p className="text-sm leading-[1.9] text-foreground">{result.farmerSummary}</p>
                </section>
              ) : null}

              {result.symptoms?.length ? (
                <SectionCard icon={Bug} title={t("crops.symptoms")}>
                  <BulletList items={result.symptoms} />
                </SectionCard>
              ) : null}

              {/* Treatment */}
              {result.treatment?.length ? (
                <SectionCard icon={Stethoscope} title={t("scan.treatmentTitle")}>
                  <ol className="space-y-3">
                    {result.treatment.map((step, index) => (
                      <li key={`${step.step}-${index}`} className="rounded-xl border border-border bg-background/60 p-3">
                        <div className="mb-1.5 flex items-start gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground force-ltr">
                            {formatNumber(step.step || index + 1)}
                          </span>
                          <p className="min-w-0 flex-1 text-sm font-semibold leading-[1.9] text-foreground">
                            {step.action}
                          </p>
                        </div>
                        <span className="mb-2 inline-flex rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-bold leading-[1.8] text-secondary-foreground">
                          {treatmentTypeLabel(step.type)}
                        </span>
                        <dl className="space-y-1">
                          {step.product ? (
                            <div className="flex flex-wrap gap-x-2 text-xs leading-[1.9]">
                              <dt className="font-semibold text-muted-foreground">{t("scan.product")}:</dt>
                              <dd className="min-w-0 text-foreground">{step.product}</dd>
                            </div>
                          ) : null}
                          {step.dosage ? (
                            <div className="flex flex-wrap gap-x-2 text-xs leading-[1.9]">
                              <dt className="font-semibold text-muted-foreground">{t("scan.dose")}:</dt>
                              <dd className="min-w-0 text-foreground">{step.dosage}</dd>
                            </div>
                          ) : null}
                          {step.timing ? (
                            <div className="flex flex-wrap gap-x-2 text-xs leading-[1.9]">
                              <dt className="font-semibold text-muted-foreground">{t("scan.when")}:</dt>
                              <dd className="min-w-0 text-foreground">{step.timing}</dd>
                            </div>
                          ) : null}
                          {step.estimatedCostPKR ? (
                            <div className="flex flex-wrap gap-x-2 text-xs leading-[1.9]">
                              <dt className="font-semibold text-muted-foreground">{t("scan.estCost")}:</dt>
                              <dd className="min-w-0 text-foreground">{step.estimatedCostPKR}</dd>
                            </div>
                          ) : null}
                        </dl>
                        {step.safetyNote ? (
                          <p className="mt-2 flex gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-xs leading-[1.9] text-foreground">
                            <TriangleAlert className="mt-1 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                            <span className="min-w-0">{step.safetyNote}</span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </SectionCard>
              ) : null}

              {result.organicOptions?.length ? (
                <SectionCard icon={Leaf} title={t("scan.organicTitle")} tone="success">
                  <BulletList items={result.organicOptions} marker="check" />
                </SectionCard>
              ) : null}

              {result.prevention?.length ? (
                <SectionCard icon={ShieldCheck} title={t("crops.prevention")}>
                  <BulletList items={result.prevention} />
                </SectionCard>
              ) : null}

              {result.alternatives?.length ? (
                <SectionCard icon={Info} title={t("scan.alternativesTitle")}>
                  <ul className="space-y-2">
                    {result.alternatives.map((alt) => (
                      <li key={alt.name} className="rounded-xl border border-border bg-background/60 p-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="min-w-0 text-sm font-semibold leading-[1.9] text-foreground">{alt.name}</p>
                          <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground force-ltr">
                            {formatNumber(alt.confidence)}%
                          </span>
                        </div>
                        {alt.howToTell ? (
                          <p className="mt-1 text-xs leading-[1.9] text-muted-foreground">
                            <span className="font-semibold">{t("scan.howToTell")}:</span> {alt.howToTell}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : null}

              {result.yieldRiskNote ? (
                <SectionCard icon={TriangleAlert} title={t("scan.yieldRisk")} tone="warning">
                  <p className="text-sm leading-[1.9] text-foreground">{result.yieldRiskNote}</p>
                </SectionCard>
              ) : null}

              {result.whenToConsultExpert ? (
                <SectionCard icon={Stethoscope} title={t("scan.expertTitle")} tone="info">
                  <p className="mb-3 text-sm leading-[1.9] text-foreground">{result.whenToConsultExpert}</p>
                  <Button asChild variant="outline" className="min-h-tap w-full rounded-xl bg-background">
                    <Link href="/community">
                      <MessageCircle className="me-2 h-4 w-4" aria-hidden />
                      <span className="leading-[1.8]">{t("community.askExperts")}</span>
                    </Link>
                  </Button>
                </SectionCard>
              ) : null}

              {/* Disclaimer — always shown, straight from the API */}
              {result.disclaimer ? (
                <p className="rounded-2xl border border-border bg-muted/60 p-3 text-xs leading-[1.9] text-muted-foreground">
                  {result.disclaimer}
                </p>
              ) : null}

              {/* Saved state */}
              <p className="text-center text-xs leading-[1.9] text-muted-foreground">
                {result.diagnosisId ? (
                  t("scan.savedToHistory")
                ) : !user ? (
                  <Link href="/auth/login" className="font-semibold text-primary underline underline-offset-2">
                    {t("scan.loginToSave")}
                  </Link>
                ) : null}
              </p>

              {/* Next actions */}
              <div className="flex flex-col gap-2">
                <Button type="button" onClick={clearPhoto} className="min-h-tap w-full rounded-xl">
                  <Camera className="me-2 h-5 w-5" aria-hidden />
                  <span className="leading-[1.8]">{t("scan.scanAgain")}</span>
                </Button>
                <Button asChild variant="outline" className="min-h-tap w-full rounded-xl">
                  <Link href="/ai-assistant">
                    <Sparkles className="me-2 h-5 w-5" aria-hidden />
                    <span className="leading-[1.8]">{t("scan.askAi")}</span>
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
