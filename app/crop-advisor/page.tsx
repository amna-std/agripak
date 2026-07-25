"use client"

/**
 * /crop-advisor — "what should I sow this season?"
 *
 * A short farm questionnaire posted to `POST /api/ai/advisor`, which answers
 * with a ranked crop shortlist plus the reasoning behind each choice.
 *
 * Notes:
 *  - Province and district come from `lib/data/pakistan-locations.ts`, so the
 *    picker is nationwide and never defaults to one city.
 *  - A signed-in farmer's saved profile pre-fills the form; the API fills any
 *    remaining gap from the same profile.
 *  - Costs and yields from the model are labelled as estimates everywhere they
 *    appear, and the API's own `disclaimer` is always rendered. Nothing on this
 *    page is invented locally.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Coins,
  Droplets,
  Info,
  Leaf,
  Loader2,
  Ruler,
  Sparkles,
  Sprout,
  TrendingUp,
  TriangleAlert,
} from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { aiApi, cropsApi, type ApiEnvelope } from "@/lib/api"
import { PROVINCES, PROVINCE_URDU, locationsByProvince, type Province } from "@/lib/data/pakistan-locations"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

/* --------------------------------------------------------------- contract */

interface Recommendation {
  rank: number
  crop: string
  localName: string | null
  suitabilityScore: number
  riskLevel: "low" | "medium" | "high" | string
  whyThisCrop: string | null
  sowingWindow: string | null
  varieties: string[]
  seedRatePerAcre: string | null
  waterRequirement: "low" | "medium" | "high" | null
  irrigations: string | null
  fertiliserPlan: string | null
  estimatedInputCostPerAcrePKR: string | null
  expectedYieldPerAcre: string | null
  durationDays: number | null
  marketNote: string | null
  risks: string[]
  keyPractices: string[]
}

interface AdvisorPayload {
  parsed: boolean
  province: string
  provinceRecognised: boolean
  district: string | null
  season: "rabi" | "kharif"
  seasonInferred: boolean
  seasonWindowNote: string | null
  landSizeAcres: number | null
  soilType: string | null
  budgetPKR: number | null
  recommendations: Recommendation[]
  landAllocationPlan: string | null
  budgetNote: string | null
  generalAdvice: string[]
  warnings: string[]
  nextSteps: string[]
  missingInformation: string[]
  confidence: "low" | "medium" | "high" | string
  costsAreEstimates: boolean
  disclaimer: string
  rawAdvice?: string
}

type AdvisorResult = ApiEnvelope & Partial<AdvisorPayload>

/* -------------------------------------------------------------- constants */

const SOIL_OPTIONS = ["loamy", "clay", "sandy", "alluvial", "saline"] as const
const WATER_OPTIONS = ["canal", "tubewell", "rainfed", "mixed"] as const
const EXPECTED_SECONDS = 16
const NOT_SURE = "unknown"

/* ------------------------------------------------------------------ page */

export default function CropAdvisorPage() {
  const { t, currentLanguage, isRTL, formatNumber, formatCurrency } = useLanguage()
  const { user } = useAuth()

  const [province, setProvince] = useState("")
  const [district, setDistrict] = useState("")
  const [landSize, setLandSize] = useState("")
  const [soilType, setSoilType] = useState(NOT_SURE)
  const [season, setSeason] = useState(NOT_SURE)
  const [waterSource, setWaterSource] = useState(NOT_SURE)
  const [previousCrop, setPreviousCrop] = useState("")
  const [budget, setBudget] = useState("")
  const [goal, setGoal] = useState("")

  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<AdvisorResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [catalogue, setCatalogue] = useState<Array<{ id: string; name: string; nameUr: string; season: string }>>([])

  /* ------------------------------------------------------- profile pre-fill */

  useEffect(() => {
    const profile = user as any
    if (!profile) return
    const saved = String(profile.state ?? profile.province ?? "")
    if (saved && PROVINCES.includes(saved as Province)) setProvince(saved)
    if (typeof profile.district === "string" && profile.district) setDistrict(profile.district)
    if (typeof profile.soilType === "string" && (SOIL_OPTIONS as readonly string[]).includes(profile.soilType)) {
      setSoilType(profile.soilType)
    }
    const acres = Number(profile.landSize?.value)
    if (Number.isFinite(acres) && acres > 0) {
      setLandSize(String(profile.landSize?.unit === "hectares" ? Math.round(acres * 2.471 * 100) / 100 : acres))
    }
  }, [user])

  /* -------------------------------------------------------- crop catalogue */

  useEffect(() => {
    let cancelled = false
    cropsApi
      .list({ limit: 60 })
      .then((res) => {
        if (cancelled || !res.success) return
        const crops = (res.data as any)?.crops
        if (Array.isArray(crops)) {
          setCatalogue(crops.map((c: any) => ({ id: c.id, name: c.name, nameUr: c.nameUr, season: c.season })))
        }
      })
      .catch(() => {
        /* the guide links are a bonus — the advisor works without them */
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

  /* ------------------------------------------------------------- districts */

  const districts = useMemo(
    () => (province ? locationsByProvince(province).map((location) => location.name) : []),
    [province],
  )

  /** Matches a model crop name back onto the catalogue so we can deep-link. */
  const catalogueId = (name: string) => {
    const needle = name.trim().toLowerCase()
    const hit = catalogue.find(
      (entry) => entry.name.toLowerCase() === needle || needle.includes(entry.name.toLowerCase()),
    )
    return hit?.id ?? null
  }

  /* --------------------------------------------------------------- submit */

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!province || loading) return

    setLoading(true)
    setResult(null)
    setFailure(null)
    setExpanded(null)

    try {
      const res = (await aiApi.advisor({
        province,
        district: district || undefined,
        landSize: landSize ? Number(landSize) : undefined,
        soilType: soilType !== NOT_SURE ? soilType : undefined,
        season: season !== NOT_SURE ? season : undefined,
        budget: budget ? Number(budget) : undefined,
        waterSource: waterSource !== NOT_SURE ? waterSource : undefined,
        previousCrop: previousCrop || undefined,
        goal: goal || undefined,
        language: currentLanguage,
      } as any)) as unknown as AdvisorResult

      if (!res.success) setFailure(res.message || t("validation.somethingWentWrong"))
      else setResult(res)
    } catch {
      setFailure(t("validation.networkError"))
    } finally {
      setLoading(false)
    }
  }

  /* --------------------------------------------------------------- labels */

  const provinceLabel = (name: string) => (isRTL ? PROVINCE_URDU[name as Province] ?? name : name)
  const soilLabel = (value: string) =>
    ({
      loamy: t("advisor.soilLoamy"),
      clay: t("advisor.soilClay"),
      sandy: t("advisor.soilSandy"),
      alluvial: t("advisor.soilAlluvial"),
      saline: t("advisor.soilSaline"),
    })[value] ?? value
  const waterLabel = (value: string) =>
    ({
      canal: t("advisor.waterCanal"),
      tubewell: t("advisor.waterTubewell"),
      rainfed: t("advisor.waterRainfed"),
      mixed: t("advisor.waterMixed"),
    })[value] ?? value
  const levelLabel = (value?: string | null) =>
    value === "low" ? t("level.low") : value === "high" ? t("level.high") : value ? t("level.medium") : "—"

  const riskTone = (value: string) =>
    value === "low"
      ? "border-success/40 bg-success/10 text-success"
      : value === "high"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-warning/40 bg-warning/10 text-warning"

  const stages = [t("advisor.stage1"), t("advisor.stage2"), t("advisor.stage3"), t("advisor.stage4")]

  const recommendations = result?.recommendations ?? []
  const showResults = !!result?.success && result.parsed !== false && recommendations.length > 0

  /* ------------------------------------------------------------ rendering */

  return (
    <div className="pb-8">
      {/* ------------------------------------------------------------- hero */}
      <header className="bg-brand-gradient">
        <div className="container-app py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <Sprout className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-[1.8]">{t("crops.advisor")}</h1>
              <p className="text-sm leading-[1.9] opacity-90">{t("advisor.subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container-app space-y-5 py-5">
        {/* ------------------------------------------------------------ form */}
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold leading-[1.8] text-foreground">
              <Ruler className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              {t("advisor.formTitle")}
            </h2>

            <form onSubmit={submit} className="space-y-4">
              {/* Province */}
              <div className="space-y-1.5">
                <Label htmlFor="adv-province" className="text-sm font-semibold leading-[1.8]">
                  {t("auth.province")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={province}
                  onValueChange={(value) => {
                    setProvince(value)
                    setDistrict("")
                  }}
                >
                  <SelectTrigger id="adv-province" className="min-h-tap rounded-xl text-start">
                    <SelectValue placeholder={t("validation.selectProvince")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCES.map((name) => (
                      <SelectItem key={name} value={name}>
                        {provinceLabel(name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* District */}
              <div className="space-y-1.5">
                <Label htmlFor="adv-district" className="text-sm font-semibold leading-[1.8]">
                  {t("auth.district")}{" "}
                  <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                </Label>
                <Select value={district || NOT_SURE} onValueChange={(value) => setDistrict(value === NOT_SURE ? "" : value)}>
                  <SelectTrigger id="adv-district" className="min-h-tap rounded-xl text-start" disabled={!province}>
                    <SelectValue placeholder={t("advisor.notSure")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOT_SURE}>{t("advisor.notSure")}</SelectItem>
                    {districts.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Land + budget */}
              <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="adv-land" className="text-sm font-semibold leading-[1.8]">
                    {t("advisor.landLabel")}
                  </Label>
                  <Input
                    id="adv-land"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.5"
                    value={landSize}
                    onChange={(event) => setLandSize(event.target.value)}
                    placeholder={t("advisor.landPlaceholder")}
                    className="min-h-tap rounded-xl text-base force-ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adv-budget" className="text-sm font-semibold leading-[1.8]">
                    {t("advisor.budgetLabel")}
                  </Label>
                  <Input
                    id="adv-budget"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="1000"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    placeholder={t("advisor.budgetPlaceholder")}
                    className="min-h-tap rounded-xl text-base force-ltr"
                  />
                  <p className="text-xs leading-[1.9] text-muted-foreground">
                    {budget && Number(budget) > 0 ? formatCurrency(Number(budget)) : t("advisor.budgetHelp")}
                  </p>
                </div>
              </div>

              {/* Soil + season */}
              <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="adv-soil" className="text-sm font-semibold leading-[1.8]">
                    {t("crops.soilType")}
                  </Label>
                  <Select value={soilType} onValueChange={setSoilType}>
                    <SelectTrigger id="adv-soil" className="min-h-tap rounded-xl text-start">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_SURE}>{t("advisor.notSure")}</SelectItem>
                      {SOIL_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {soilLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="adv-season" className="text-sm font-semibold leading-[1.8]">
                    {t("advisor.seasonLabel")}
                  </Label>
                  <Select value={season} onValueChange={setSeason}>
                    <SelectTrigger id="adv-season" className="min-h-tap rounded-xl text-start">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_SURE}>{t("advisor.seasonAuto")}</SelectItem>
                      <SelectItem value="rabi">{t("dashboard.rabi")}</SelectItem>
                      <SelectItem value="kharif">{t("dashboard.kharif")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Water + previous crop */}
              <div className="grid grid-cols-1 gap-4 xs:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="adv-water" className="text-sm font-semibold leading-[1.8]">
                    {t("advisor.waterLabel")}
                  </Label>
                  <Select value={waterSource} onValueChange={setWaterSource}>
                    <SelectTrigger id="adv-water" className="min-h-tap rounded-xl text-start">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_SURE}>{t("advisor.notSure")}</SelectItem>
                      {WATER_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {waterLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="adv-previous" className="text-sm font-semibold leading-[1.8]">
                    {t("advisor.previousLabel")}
                  </Label>
                  <Input
                    id="adv-previous"
                    value={previousCrop}
                    onChange={(event) => setPreviousCrop(event.target.value)}
                    placeholder={t("advisor.previousPlaceholder")}
                    maxLength={60}
                    className="min-h-tap rounded-xl text-base text-start"
                  />
                </div>
              </div>

              {/* Goal */}
              <div className="space-y-1.5">
                <Label htmlFor="adv-goal" className="text-sm font-semibold leading-[1.8]">
                  {t("advisor.goalLabel")}{" "}
                  <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                </Label>
                <Textarea
                  id="adv-goal"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder={t("advisor.goalPlaceholder")}
                  className="resize-none rounded-xl text-start text-base leading-[1.9]"
                />
              </div>

              <Button
                type="submit"
                disabled={!province || loading}
                className="min-h-[3.25rem] w-full rounded-xl text-base font-bold"
              >
                {loading ? (
                  <Loader2 className="me-2 h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="me-2 h-5 w-5" aria-hidden />
                )}
                <span className="leading-[1.8]">{loading ? t("advisor.working") : t("advisor.submit")}</span>
              </Button>
              {!province ? (
                <p className="text-center text-xs leading-[1.9] text-muted-foreground">{t("advisor.needProvince")}</p>
              ) : null}
            </form>
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- progress */}
        {loading ? (
          <Card className="rounded-2xl border-primary/40">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
                <p className="min-w-0 flex-1 text-sm font-bold leading-[1.8]">{t("advisor.working")}</p>
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
              <p className="text-xs leading-[1.9] text-muted-foreground">{t("advisor.workingNote")}</p>
            </CardContent>
          </Card>
        ) : null}

        {/* --------------------------------------------------------- failure */}
        {failure ? (
          <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
            <CardContent className="space-y-3 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold leading-[1.8] text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                {t("advisor.failedTitle")}
              </h2>
              <p className="text-sm leading-[1.9] text-foreground">{failure}</p>
              <Button type="button" onClick={() => submit()} className="min-h-tap w-full rounded-xl">
                {t("common.retry")}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* -------------------------------------------------- unstructured */}
        {result?.success && result.parsed === false ? (
          <Card className="rounded-2xl border-warning/40 bg-warning/5">
            <CardContent className="space-y-2 p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold leading-[1.8]">
                <Info className="h-5 w-5 shrink-0 text-warning" aria-hidden />
                {t("advisor.rawTitle")}
              </h2>
              <p className="whitespace-pre-wrap break-words rounded-xl bg-background/70 p-3 text-sm leading-[1.9]">
                {result.rawAdvice || result.message}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {/* --------------------------------------------------------- results */}
        {showResults && result ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <h2 className="text-base font-bold leading-[1.8] text-foreground">{t("advisor.resultsTitle")}</h2>
              <p className="text-sm leading-[1.9] text-muted-foreground">
                {provinceLabel(result.province ?? province)} ·{" "}
                {result.season === "kharif" ? t("dashboard.kharif") : t("dashboard.rabi")}
                {result.landSizeAcres ? ` · ${formatNumber(result.landSizeAcres)} ${t("units.acre")}` : ""}
              </p>
              {result.seasonInferred ? (
                <p className="mt-2 text-xs leading-[1.9] text-muted-foreground">{t("advisor.seasonInferred")}</p>
              ) : null}
              {result.provinceRecognised === false ? (
                <p className="mt-2 text-xs leading-[1.9] text-warning">{t("advisor.provinceUnknown")}</p>
              ) : null}
              {result.seasonWindowNote ? (
                <p className="mt-2 text-sm leading-[1.9] text-foreground">{result.seasonWindowNote}</p>
              ) : null}
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-[1.9] text-muted-foreground">
                <Info className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{t("advisor.estimateNotice")}</span>
              </p>
            </div>

            {/* Warnings first — they change what a farmer should do */}
            {result.warnings?.length ? (
              <section className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold leading-[1.8]">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                  {t("advisor.warningsTitle")}
                </h3>
                <ul className="space-y-2">
                  {result.warnings.map((warning) => (
                    <li key={warning} className="text-sm leading-[1.9] text-foreground">
                      {warning}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Ranked crops */}
            <ol className="space-y-3">
              {recommendations.map((item, index) => {
                const key = `${item.rank}-${item.crop}`
                const open = expanded === key
                const guideId = catalogueId(item.crop)
                return (
                  <li key={key}>
                    <Card className={cn("overflow-hidden rounded-2xl", index === 0 && "border-primary/50")}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold force-ltr",
                              index === 0
                                ? "bg-gold text-gold-foreground"
                                : "bg-secondary text-secondary-foreground",
                            )}
                            aria-hidden
                          >
                            {formatNumber(item.rank || index + 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-base font-bold leading-[1.8] text-foreground">{item.crop}</h3>
                            {item.localName ? (
                              <p className="text-sm leading-[1.9] text-muted-foreground">{item.localName}</p>
                            ) : null}
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold leading-[1.8]",
                              riskTone(item.riskLevel),
                            )}
                          >
                            {levelLabel(item.riskLevel)}
                          </span>
                        </div>

                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                              {t("advisor.suitability")}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-foreground force-ltr">
                              {formatNumber(item.suitabilityScore)}%
                            </span>
                          </div>
                          <Progress value={item.suitabilityScore} className="h-2" />
                        </div>

                        {item.whyThisCrop ? (
                          <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm leading-[1.9] text-foreground">
                            {item.whyThisCrop}
                          </p>
                        ) : null}

                        {/* Quick facts */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.sowingWindow ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs leading-[1.8] text-secondary-foreground">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {item.sowingWindow}
                            </span>
                          ) : null}
                          {item.waterRequirement ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs leading-[1.8] text-secondary-foreground">
                              <Droplets className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {levelLabel(item.waterRequirement)}
                            </span>
                          ) : null}
                          {item.durationDays ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs leading-[1.8] text-secondary-foreground">
                              <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {t("advisor.daysValue", { count: formatNumber(item.durationDays) })}
                            </span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : key)}
                          aria-expanded={open}
                          className="mt-3 flex min-h-tap w-full items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold leading-[1.8] text-primary"
                        >
                          {open ? t("advisor.lessDetail") : t("advisor.moreDetail")}
                          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
                        </button>

                        {open ? (
                          <dl className="mt-3 space-y-3">
                            {item.varieties.length ? (
                              <Detail label={t("advisor.varieties")} value={item.varieties.join("، ")} />
                            ) : null}
                            {item.seedRatePerAcre ? (
                              <Detail label={t("crops.seedRate")} value={item.seedRatePerAcre} />
                            ) : null}
                            {item.irrigations ? <Detail label={t("advisor.irrigations")} value={item.irrigations} /> : null}
                            {item.fertiliserPlan ? (
                              <Detail label={t("advisor.fertiliserPlan")} value={item.fertiliserPlan} />
                            ) : null}
                            {item.estimatedInputCostPerAcrePKR ? (
                              <Detail
                                label={t("advisor.inputCost")}
                                value={item.estimatedInputCostPerAcrePKR}
                                icon={Coins}
                              />
                            ) : null}
                            {item.expectedYieldPerAcre ? (
                              <Detail label={t("crops.expectedYield")} value={item.expectedYieldPerAcre} />
                            ) : null}
                            {item.marketNote ? <Detail label={t("advisor.marketNote")} value={item.marketNote} /> : null}

                            {item.risks.length ? (
                              <div>
                                <dt className="text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                                  {t("advisor.risks")}
                                </dt>
                                <dd>
                                  <ul className="mt-1 space-y-1">
                                    {item.risks.map((risk) => (
                                      <li key={risk} className="flex gap-2 text-sm leading-[1.9] text-foreground">
                                        <TriangleAlert className="mt-1.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                                        <span className="min-w-0">{risk}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </dd>
                              </div>
                            ) : null}

                            {item.keyPractices.length ? (
                              <div>
                                <dt className="text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                                  {t("advisor.keyPractices")}
                                </dt>
                                <dd>
                                  <ul className="mt-1 space-y-1">
                                    {item.keyPractices.map((practice) => (
                                      <li key={practice} className="flex gap-2 text-sm leading-[1.9] text-foreground">
                                        <CheckCircle2 className="mt-1.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                                        <span className="min-w-0">{practice}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </dd>
                              </div>
                            ) : null}

                            {guideId ? (
                              <Button asChild variant="outline" className="min-h-tap w-full rounded-xl">
                                <Link href={`/crop-advisor/${guideId}`}>
                                  <BookOpen className="me-2 h-4 w-4" aria-hidden />
                                  <span className="leading-[1.8]">{t("advisor.fullGuide")}</span>
                                </Link>
                              </Button>
                            ) : null}
                          </dl>
                        ) : null}
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ol>

            {result.landAllocationPlan ? (
              <Panel icon={Ruler} title={t("advisor.landPlanTitle")}>
                <p className="whitespace-pre-wrap text-sm leading-[1.9] text-foreground">{result.landAllocationPlan}</p>
              </Panel>
            ) : null}

            {result.budgetNote ? (
              <Panel icon={Coins} title={t("advisor.budgetNoteTitle")}>
                <p className="text-sm leading-[1.9] text-foreground">{result.budgetNote}</p>
              </Panel>
            ) : null}

            {result.generalAdvice?.length ? (
              <Panel icon={Leaf} title={t("advisor.generalAdviceTitle")}>
                <ul className="space-y-2">
                  {result.generalAdvice.map((advice) => (
                    <li key={advice} className="flex gap-2 text-sm leading-[1.9] text-foreground">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      <span className="min-w-0">{advice}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            {result.nextSteps?.length ? (
              <Panel icon={ArrowRight} title={t("advisor.nextStepsTitle")}>
                <ol className="space-y-2">
                  {result.nextSteps.map((step, index) => (
                    <li key={step} className="flex gap-2 text-sm leading-[1.9] text-foreground">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-foreground force-ltr">
                        {formatNumber(index + 1)}
                      </span>
                      <span className="min-w-0">{step}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            ) : null}

            {result.missingInformation?.length ? (
              <Panel icon={Info} title={t("advisor.missingInfoTitle")}>
                <ul className="space-y-1">
                  {result.missingInformation.map((missing) => (
                    <li key={missing} className="text-sm leading-[1.9] text-muted-foreground">
                      {missing}
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            {result.disclaimer ? (
              <p className="rounded-2xl border border-border bg-muted/60 p-3 text-xs leading-[1.9] text-muted-foreground">
                {result.disclaimer}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ------------------------------------------------ crop guide index */}
        {catalogue.length ? (
          <section>
            <h2 className="mb-1 text-base font-bold leading-[1.8] text-foreground">{t("advisor.browseTitle")}</h2>
            <p className="mb-3 text-sm leading-[1.9] text-muted-foreground">{t("advisor.browseSubtitle")}</p>
            <ul className="grid grid-cols-2 gap-2">
              {catalogue.slice(0, 12).map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/crop-advisor/${entry.id}`}
                    className="card-hover flex min-h-tap items-center gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Leaf className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold leading-[1.9] text-foreground">
                        {isRTL ? entry.nameUr : entry.name}
                      </span>
                      <span className="block truncate text-xs leading-[1.9] text-muted-foreground">
                        {entry.season === "kharif"
                          ? t("dashboard.kharif")
                          : entry.season === "rabi"
                            ? t("dashboard.rabi")
                            : t("advisor.perennial")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- fragments */

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
        {label}
      </dt>
      <dd className="text-sm leading-[1.9] text-foreground">{value}</dd>
    </div>
  )
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold leading-[1.8] text-foreground">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">{title}</span>
      </h3>
      {children}
    </section>
  )
}
