"use client"

/**
 * /crop-advisor/[cropId] — the full growing guide for one crop.
 *
 * Data comes from `GET /api/crops/[cropId]`, which is public. When the caller
 * is signed in (or arrives with query params) the response also carries a
 * `personalised` block — suitability score, the sowing window for that
 * province, and advice specific to that farm — which is rendered first.
 *
 * The economics block is qualitative on purpose: the catalogue tags it
 * `source: "sample"`, so it is shown behind a sample badge with a link to the
 * live mandi rates instead of pretending to be a price.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Coins,
  Droplets,
  Leaf,
  MapPin,
  Package,
  ShieldCheck,
  Sprout,
  Thermometer,
  TrendingUp,
  TriangleAlert,
  Wheat,
} from "lucide-react"

import { useLanguage } from "@/lib/contexts"
import { cropsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/* --------------------------------------------------------------- contract */

interface CropWindow {
  region: string
  regionUr: string
  provinces: string[]
  sowing: { from: string; to: string }
  harvest: { from: string; to: string }
  note?: string
}

interface CropIssue {
  name: string
  nameUr: string
  symptoms: string[]
  management: string[]
}

interface CropDetail {
  id: string
  name: string
  nameUr: string
  otherNames: string[]
  category: string
  season: string
  summary: string
  summaryUr: string
  durationDays: { min: number; max: number }
  provinces: string[]
  windows: CropWindow[]
  soils: string[]
  soilNote: string
  climate: { temperature: { min: number; max: number; optimal: number }; rainfallMm?: { min: number; max: number } }
  water: { requirement: string; irrigations: { min: number; max: number }; criticalStages: string[] }
  seedRate: string
  spacing: string
  varieties: string[]
  fertiliser: Array<{ name: string; dose: string; timing: string }>
  expectedYield: { min: number; max: number; unit: string; note?: string }
  pests: CropIssue[]
  diseases: CropIssue[]
  practices: string[]
  postHarvest: string[]
  marketDemand: string
  profitability: string
  riskFactor: string
  economics: { costLevel: string; note: string; source: string }
  zoneDetails: Array<{ id: string; name: string; nameUr: string; districts: string[] }>
  advisory: string
  windowsForYou: CropWindow[]
  personalised: boolean
  recommendationScore: number
  suitabilityReasons: string[]
  warnings: string[]
  riskAssessment: { level: string; score: number; factors: string[] }
  advice: string[]
  profile: { province: string | null; source: string }
  relatedCrops: Array<{ id: string; name: string; nameUr: string; season: string }>
}

/* ------------------------------------------------------------------ page */

export default function CropDetailPage() {
  const params = useParams<{ cropId: string }>()
  const cropId = Array.isArray(params?.cropId) ? params.cropId[0] : params?.cropId
  const { t, isRTL, formatNumber } = useLanguage()

  const [crop, setCrop] = useState<CropDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openIssue, setOpenIssue] = useState<string | null>(null)

  useEffect(() => {
    if (!cropId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    cropsApi
      .get(cropId)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) setCrop(res.data as unknown as CropDetail)
        else setError(res.message || t("validation.notFound"))
      })
      .catch(() => {
        if (!cancelled) setError(t("validation.networkError"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropId])

  /* --------------------------------------------------------------- labels */

  const level = (value?: string) =>
    value === "low"
      ? t("level.low")
      : value === "high"
        ? t("level.high")
        : value === "very-high"
          ? t("level.veryHigh")
          : value === "medium"
            ? t("level.medium")
            : (value ?? "—")

  const soilLabel = (value: string) =>
    ({
      loamy: t("advisor.soilLoamy"),
      clay: t("advisor.soilClay"),
      sandy: t("advisor.soilSandy"),
      alluvial: t("advisor.soilAlluvial"),
      saline: t("advisor.soilSaline"),
      black: t("advisor.soilBlack"),
      red: t("advisor.soilRed"),
      laterite: t("advisor.soilLaterite"),
      acidic: t("advisor.soilAcidic"),
    })[value] ?? value

  const seasonLabel = (value?: string) =>
    value === "kharif" ? t("dashboard.kharif") : value === "rabi" ? t("dashboard.rabi") : t("advisor.perennial")

  const categoryLabel = (value?: string) =>
    ({
      cereal: t("cropDetail.catCereal"),
      pulse: t("cropDetail.catPulse"),
      oilseed: t("cropDetail.catOilseed"),
      "cash-crop": t("cropDetail.catCashCrop"),
      vegetable: t("cropDetail.catVegetable"),
      fruit: t("cropDetail.catFruit"),
      fodder: t("cropDetail.catFodder"),
    })[value ?? ""] ?? value

  const riskTone = (value?: string) =>
    value === "low"
      ? "border-success/40 bg-success/10 text-success"
      : value === "high"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-warning/40 bg-warning/10 text-warning"

  /* -------------------------------------------------------------- loading */

  if (loading) {
    return (
      <div className="container-app space-y-4 py-5">
        <Skeleton className="h-8 w-2/3 rounded-xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    )
  }

  if (error || !crop) {
    return (
      <div className="container-app py-10">
        <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-4 p-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-7 w-7" aria-hidden />
            </span>
            <h1 className="text-base font-bold leading-[1.8] text-foreground">{t("cropDetail.notFoundTitle")}</h1>
            <p className="text-sm leading-[1.9] text-muted-foreground">{error || t("cropDetail.notFoundBody")}</p>
            <Button asChild className="min-h-tap w-full rounded-xl">
              <Link href="/crop-advisor">
                <ArrowLeft className="me-2 h-4 w-4 flip-rtl" aria-hidden />
                <span className="leading-[1.8]">{t("cropDetail.backToAdvisor")}</span>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const displayName = isRTL && crop.nameUr ? crop.nameUr : crop.name
  const displaySummary = isRTL && crop.summaryUr ? crop.summaryUr : crop.summary

  return (
    <div className="pb-8">
      {/* ------------------------------------------------------------- hero */}
      <header className="bg-brand-gradient">
        <div className="container-app py-5">
          <Link
            href="/crop-advisor"
            className="mb-3 inline-flex min-h-tap items-center gap-1.5 text-sm font-semibold leading-[1.8] text-white/90 underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-4 w-4 flip-rtl" aria-hidden />
            {t("cropDetail.backToAdvisor")}
          </Link>

          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <Wheat className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-[1.8]">{displayName}</h1>
              {isRTL ? (
                <p className="text-sm leading-[1.9] opacity-90">{crop.name}</p>
              ) : crop.nameUr ? (
                <p className="font-nastaliq text-sm opacity-90">{crop.nameUr}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{seasonLabel(crop.season)}</Badge>
            <Badge>{categoryLabel(crop.category)}</Badge>
            <Badge>
              {t("cropDetail.daysRange", {
                min: formatNumber(crop.durationDays.min),
                max: formatNumber(crop.durationDays.max),
              })}
            </Badge>
          </div>
        </div>
      </header>

      <div className="container-app space-y-4 py-5">
        {/* --------------------------------------------------------- summary */}
        <p className="text-sm leading-[1.9] text-foreground">{displaySummary}</p>

        {crop.otherNames?.length ? (
          <p className="text-xs leading-[1.9] text-muted-foreground">
            <span className="font-semibold">{t("cropDetail.alsoCalled")}:</span> {crop.otherNames.join("، ")}
          </p>
        ) : null}

        {/* ---------------------------------------------------- for your farm */}
        <Section icon={Sprout} title={t("cropDetail.forYourFarm")} tone={crop.personalised ? "primary" : "default"}>
          {crop.personalised ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                    {t("cropDetail.suitabilityScore")}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-foreground force-ltr">
                    {formatNumber(crop.recommendationScore)}%
                  </span>
                </div>
                <Progress value={crop.recommendationScore} className="h-2" />
              </div>

              <span
                className={cn(
                  "inline-flex rounded-full border px-3 py-1 text-xs font-bold leading-[1.8]",
                  riskTone(crop.riskAssessment?.level),
                )}
              >
                {t("cropDetail.riskLevel")}: {level(crop.riskAssessment?.level)}
              </span>

              {crop.suitabilityReasons?.length ? (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                    {t("cropDetail.whyItSuits")}
                  </h3>
                  <Bullets items={crop.suitabilityReasons} marker="check" />
                </div>
              ) : null}

              {crop.warnings?.length ? (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                    {t("cropDetail.watchOut")}
                  </h3>
                  <Bullets items={crop.warnings} marker="warn" />
                </div>
              ) : null}

              {crop.windowsForYou?.length ? (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                    {t("cropDetail.yourWindow")}
                  </h3>
                  {crop.windowsForYou.map((window) => (
                    <WindowRow key={window.region} window={window} isRTL={isRTL} t={t} highlight />
                  ))}
                </div>
              ) : null}

              {crop.advice?.length ? <Bullets items={crop.advice} /> : null}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm leading-[1.9] text-muted-foreground">{t("cropDetail.notPersonalised")}</p>
              <Button asChild variant="outline" className="min-h-tap w-full rounded-xl">
                <Link href="/profile">{t("nav.profile")}</Link>
              </Button>
            </div>
          )}
        </Section>

        {/* --------------------------------------------------------- windows */}
        {crop.windows?.length ? (
          <Section icon={CalendarDays} title={t("cropDetail.windowsTitle")}>
            <div className="space-y-3">
              {crop.windows.map((window) => (
                <WindowRow key={window.region} window={window} isRTL={isRTL} t={t} />
              ))}
            </div>
          </Section>
        ) : null}

        {/* --------------------------------------------------- climate & soil */}
        <Section icon={Thermometer} title={t("cropDetail.climateSoil")}>
          <dl className="space-y-3">
            <Row
              label={t("cropDetail.optimalTemp")}
              value={`${formatNumber(crop.climate.temperature.min)}–${formatNumber(crop.climate.temperature.max)} ${t("units.celsius")}`}
            />
            {crop.climate.rainfallMm ? (
              <Row
                label={t("weather.rainfall")}
                value={`${formatNumber(crop.climate.rainfallMm.min)}–${formatNumber(crop.climate.rainfallMm.max)} ${t("units.mm")}`}
              />
            ) : null}
            <Row label={t("cropDetail.suitableSoils")} value={crop.soils.map(soilLabel).join("، ")} />
            <Row label={t("cropDetail.soilNote")} value={crop.soilNote} />
          </dl>
        </Section>

        {/* ----------------------------------------------------------- water */}
        <Section icon={Droplets} title={t("cropDetail.waterTitle")}>
          <dl className="space-y-3">
            <Row label={t("crops.waterRequirement")} value={level(crop.water.requirement)} />
            <Row
              label={t("advisor.irrigations")}
              value={t("cropDetail.irrigationsRange", {
                min: formatNumber(crop.water.irrigations.min),
                max: formatNumber(crop.water.irrigations.max),
              })}
            />
          </dl>
          {crop.water.criticalStages?.length ? (
            <div className="mt-3">
              <h3 className="mb-1 text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                {t("cropDetail.criticalStages")}
              </h3>
              <Bullets items={crop.water.criticalStages} />
            </div>
          ) : null}
        </Section>

        {/* -------------------------------------------------------- planting */}
        <Section icon={Package} title={t("cropDetail.plantingTitle")}>
          <dl className="space-y-3">
            <Row label={t("crops.seedRate")} value={crop.seedRate} />
            <Row label={t("cropDetail.spacing")} value={crop.spacing} />
          </dl>
          {crop.varieties?.length ? (
            <div className="mt-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                {t("advisor.varieties")}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {crop.varieties.map((variety) => (
                  <li
                    key={variety}
                    className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium leading-[1.8] text-secondary-foreground"
                  >
                    {variety}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        {/* ------------------------------------------------------ fertiliser */}
        {crop.fertiliser?.length ? (
          <Section icon={Leaf} title={t("cropDetail.fertiliserTitle")}>
            <ul className="space-y-2">
              {crop.fertiliser.map((entry) => (
                <li key={entry.name} className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-sm font-bold leading-[1.9] text-foreground">{entry.name}</p>
                  <p className="text-xs leading-[1.9] text-muted-foreground">
                    <span className="font-semibold">{t("cropDetail.dose")}:</span> {entry.dose}
                  </p>
                  <p className="text-xs leading-[1.9] text-muted-foreground">
                    <span className="font-semibold">{t("cropDetail.timing")}:</span> {entry.timing}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* ----------------------------------------------------------- yield */}
        <Section icon={TrendingUp} title={t("cropDetail.yieldTitle")}>
          <p className="text-lg font-bold leading-[1.8] text-primary">
            <span className="force-ltr">
              {formatNumber(crop.expectedYield.min)}–{formatNumber(crop.expectedYield.max)}
            </span>{" "}
            {crop.expectedYield.unit}
          </p>
          {crop.expectedYield.note ? (
            <p className="mt-1 text-xs leading-[1.9] text-muted-foreground">{crop.expectedYield.note}</p>
          ) : null}
        </Section>

        {/* ------------------------------------------------ pests & diseases */}
        {crop.diseases?.length || crop.pests?.length ? (
          <Section icon={Bug} title={`${t("cropDetail.pestsTitle")} & ${t("cropDetail.diseasesTitle")}`}>
            <ul className="space-y-2">
              {[...(crop.diseases ?? []), ...(crop.pests ?? [])].map((issue) => {
                const open = openIssue === issue.name
                return (
                  <li key={issue.name} className="overflow-hidden rounded-xl border border-border">
                    <button
                      type="button"
                      onClick={() => setOpenIssue(open ? null : issue.name)}
                      aria-expanded={open}
                      className="flex min-h-tap w-full items-center gap-2 bg-background/60 px-3 py-2 text-start"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-[1.9] text-foreground">{issue.name}</span>
                        {issue.nameUr ? (
                          <span className="block font-nastaliq text-xs text-muted-foreground">{issue.nameUr}</span>
                        ) : null}
                      </span>
                      <ChevronDown
                        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                        aria-hidden
                      />
                    </button>
                    {open ? (
                      <div className="space-y-3 border-t border-border px-3 py-3">
                        <div>
                          <h4 className="mb-1 text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                            {t("crops.symptoms")}
                          </h4>
                          <Bullets items={issue.symptoms} marker="warn" />
                        </div>
                        <div>
                          <h4 className="mb-1 text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                            {t("cropDetail.management")}
                          </h4>
                          <Bullets items={issue.management} marker="check" />
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </Section>
        ) : null}

        {/* ------------------------------------------------------- practices */}
        {crop.practices?.length ? (
          <Section icon={CheckCircle2} title={t("cropDetail.practicesTitle")}>
            <Bullets items={crop.practices} marker="check" />
          </Section>
        ) : null}

        {crop.postHarvest?.length ? (
          <Section icon={Package} title={t("cropDetail.postHarvestTitle")}>
            <Bullets items={crop.postHarvest} />
          </Section>
        ) : null}

        {/* ------------------------------------------------------- economics */}
        <Section icon={Coins} title={t("cropDetail.economicsTitle")}>
          <div className="grid grid-cols-2 gap-2">
            <Tile label={t("cropDetail.marketDemand")} value={level(crop.marketDemand)} />
            <Tile label={t("cropDetail.profitability")} value={level(crop.profitability)} />
            <Tile label={t("cropDetail.riskFactor")} value={level(crop.riskFactor)} />
            <Tile label={t("cropDetail.costLevel")} value={level(crop.economics?.costLevel)} />
          </div>
          {crop.economics?.note ? (
            <div className="mt-3">
              {crop.economics.source === "sample" ? (
                <span className="badge-sample mb-1.5">{t("common.sampleData")}</span>
              ) : null}
              <p className="text-xs leading-[1.9] text-muted-foreground">{crop.economics.note}</p>
            </div>
          ) : null}
          <Button asChild variant="outline" className="mt-3 min-h-tap w-full rounded-xl">
            <Link href="/market">
              <TrendingUp className="me-2 h-4 w-4" aria-hidden />
              <span className="leading-[1.8]">{t("cropDetail.livePrices")}</span>
            </Link>
          </Button>
        </Section>

        {/* ----------------------------------------------------------- zones */}
        {crop.zoneDetails?.length ? (
          <Section icon={MapPin} title={t("cropDetail.zonesTitle")}>
            <ul className="space-y-1.5">
              {crop.zoneDetails.map((zone) => (
                <li key={zone.id} className="text-sm leading-[1.9] text-foreground">
                  <span className="font-semibold">{isRTL ? zone.nameUr : zone.name}</span>
                  {zone.districts?.length ? (
                    <span className="text-muted-foreground"> — {zone.districts.slice(0, 5).join("، ")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* -------------------------------------------------------- advisory */}
        {crop.advisory ? (
          <p className="flex gap-2 rounded-2xl border border-border bg-muted/60 p-3 text-xs leading-[1.9] text-muted-foreground">
            <ShieldCheck className="mt-1 h-4 w-4 shrink-0" aria-hidden />
            <span>{crop.advisory}</span>
          </p>
        ) : null}

        {/* --------------------------------------------------------- related */}
        {crop.relatedCrops?.length ? (
          <section>
            <h2 className="mb-2 text-base font-bold leading-[1.8] text-foreground">{t("cropDetail.relatedTitle")}</h2>
            <ul className="grid grid-cols-2 gap-2">
              {crop.relatedCrops.map((related) => (
                <li key={related.id}>
                  <Link
                    href={`/crop-advisor/${related.id}`}
                    className="card-hover flex min-h-tap items-center gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Leaf className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold leading-[1.9] text-foreground">
                      {isRTL ? related.nameUr : related.name}
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold leading-[1.8] text-white">
      {children}
    </span>
  )
}

function Section({
  icon: Icon,
  title,
  tone = "default",
  children,
}: {
  icon: React.ElementType
  title: string
  tone?: "default" | "primary"
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border p-4",
        tone === "primary" ? "border-primary/40 bg-primary/5" : "border-border bg-card",
      )}
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold leading-[1.8] text-foreground">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            tone === "primary" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">{title}</span>
      </h2>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-[1.9] text-foreground">{value}</dd>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-2.5">
      <p className="text-[0.6875rem] font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-bold leading-[1.8] text-foreground">{value}</p>
    </div>
  )
}

function Bullets({ items, marker = "dot" }: { items: string[]; marker?: "dot" | "check" | "warn" }) {
  return (
    <ul className="space-y-1.5">
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

function WindowRow({
  window,
  isRTL,
  t,
  highlight,
}: {
  window: CropWindow
  isRTL: boolean
  t: (key: string, vars?: Record<string, string | number>) => string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background/60",
      )}
    >
      <p className="text-sm font-bold leading-[1.9] text-foreground">
        {isRTL && window.regionUr ? window.regionUr : window.region}
      </p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
            {t("cropDetail.sowing")}
          </p>
          <p className="text-sm leading-[1.9] text-foreground">
            {window.sowing.from} – {window.sowing.to}
          </p>
        </div>
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
            {t("cropDetail.harvest")}
          </p>
          <p className="text-sm leading-[1.9] text-foreground">
            {window.harvest.from} – {window.harvest.to}
          </p>
        </div>
      </div>
      {window.note ? <p className="mt-2 text-xs leading-[1.9] text-muted-foreground">{window.note}</p> : null}
    </div>
  )
}
