"use client"

/**
 * Market prices — real rates from GET /api/market/prices, with the saved price
 * history from GET /api/market/trends behind the chart.
 *
 * HONESTY CONTRACT (AGENT_CONTRACT.md rule 5): the API tags every response with
 * `source: "amis" | "pbs" | "cache" | "sample"` and sometimes a `notice`. Both
 * are surfaced permanently in the UI — a cached or sample figure must never
 * look like a live quote.
 *
 * Two providers sit behind those tags, and they are NOT interchangeable:
 *   - `amis` AMIS Punjab (amis.pk) — **wholesale mandi** rates, Punjab only.
 *            This is what a farmer is actually paid at the gate.
 *   - `pbs`  PBS weekly SPI (pbs.gov.pk) — **retail** bazaar prices for 17
 *            cities across Punjab, Sindh, KP, Balochistan and Islamabad.
 *
 * Every row therefore carries its own `source` and `priceType`, and each card
 * shows which provider it came from. Retail is always dearer than wholesale, so
 * silently mixing the two would badly mislead someone deciding when to sell.
 * Gilgit-Baltistan and Azad Jammu & Kashmir have no published feed at all; the
 * API says so in `coverage.uncoveredProvinces` and the UI repeats it.
 *
 * Both providers are normalised to PKR per 100 kg. Farmers trade by the maund
 * (40 kg), so both are shown; the maund figure is a straight 0.4x of the 100 kg
 * rate and is labelled as such.
 *
 * Chrome (header / nav) belongs to components/AppShell.tsx.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  BarChart3,
  Database,
  Info,
  MapPin,
  Minus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Wifi,
  X,
} from "lucide-react"
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { marketApi, weatherApi } from "@/lib/api"
import { useLanguage } from "@/lib/contexts"

/* ------------------------------------------------------------------ types */

interface PriceRow {
  cropName: string
  variety: string
  market: { name: string; district: string; province: string }
  prices: { minimum: number; maximum: number; modal: number; average: number }
  unit: string
  currency: string
  date: string
  arrivals: number
  trend: { direction: "up" | "down" | "stable"; percentage: number }
  /** Which provider published this row. */
  source?: "amis" | "pbs" | "sample"
  /** Mandi wholesale rate versus retail bazaar price. */
  priceType?: "wholesale" | "retail"
  isSample?: boolean
}

interface TrendPoint {
  date: string
  modal: number
  minimum: number
  maximum: number
  arrivals: number
}

interface TrendSeries {
  cropName: string
  market: string | null
  unit: string
  currency: string
  /** Wholesale mandi rates or retail bazaar prices — never both in one curve. */
  priceType?: "wholesale" | "retail"
  source?: "amis" | "pbs"
  points: TrendPoint[]
  change: { absolute: number; percentage: number; direction: "up" | "down" | "stable" }
}

type SourceTag = "amis" | "pbs" | "cache" | "sample"

interface Province {
  name: string
  nameUr: string
}

/** Kilograms in one maund — how Pakistani farmers actually trade. */
const MAUND_KG = 40
/** Both providers are normalised to per 100 kg. */
const QUOTE_KG = 100

/**
 * Provider names stay untranslated — they are proper nouns, the names of two
 * government services, and rendering "AMIS" differently per locale would make
 * the badge harder to trust, not easier. The price type beside them IS
 * translated, because that is the part carrying the meaning.
 */
const PROVIDER_NAME: Record<string, string> = {
  amis: "AMIS",
  pbs: "PBS SPI",
}

/**
 * "AMIS · Wholesale (mandi)" / "PBS SPI · Retail (bazaar)".
 *
 * The price type is the part that matters to a farmer — a Multan mandi rate and
 * a Karachi bazaar rate for the same crop can differ by more than 2x — so it is
 * shown in their own language rather than left as English.
 */
function providerLabel(
  source: string | undefined,
  priceType: "wholesale" | "retail" | undefined,
  t: (key: string) => string,
): string | null {
  if (!source || !PROVIDER_NAME[source]) return null
  const kind =
    priceType === "wholesale"
      ? t("market.priceWholesale")
      : priceType === "retail"
        ? t("market.priceRetail")
        : null
  return kind ? `${PROVIDER_NAME[source]} · ${kind}` : PROVIDER_NAME[source]
}
const TREND_DAYS = 30
const ALL = "__all__"

/**
 * AMIS crop labels we also carry as translation keys. Anything not listed keeps
 * the API's own label — inventing a translation for "Lychee" would be worse than
 * showing the real commodity name from the mandi board.
 */
const CROP_KEYS: Record<string, string> = {
  Wheat: "crops.wheat",
  Rice: "crops.rice",
  "Rice (Basmati)": "crops.basmati",
  "Rice (IRRI)": "crops.irri",
  Cotton: "crops.cotton",
  Sugarcane: "crops.sugarcane",
  Maize: "crops.maize",
  Potato: "crops.potato",
  Onion: "crops.onion",
  Tomato: "crops.tomato",
  "Chickpea (Chana)": "crops.chickpea",
  Mustard: "crops.mustard",
  Mango: "crops.mango",
  "Citrus (Kinnow)": "crops.citrus",
  Dates: "crops.dates",
}

/* -------------------------------------------------------------- page */

export default function MarketPage() {
  const { t, currentLanguage, formatCurrency, formatNumber } = useLanguage()

  const isEnglish = currentLanguage === "en"
  const scriptClass =
    currentLanguage === "ur" || currentLanguage === "pa"
      ? "font-nastaliq"
      : currentLanguage === "sd" || currentLanguage === "ps"
        ? "font-naskh"
        : ""

  /** Translate a crop name when we carry a key for it, else keep the mandi label. */
  const cropLabel = useCallback(
    (name: string) => (CROP_KEYS[name] ? t(CROP_KEYS[name]) : name),
    [t],
  )

  /* -- filters ----------------------------------------------------------- */

  const [province, setProvince] = useState<string>("")
  const [mandi, setMandi] = useState<string>(ALL)
  const [crop, setCrop] = useState<string>(ALL)
  const [search, setSearch] = useState("")

  /* -- data -------------------------------------------------------------- */

  const [rows, setRows] = useState<PriceRow[]>([])
  const [source, setSource] = useState<SourceTag>("cache")
  /** Provinces the API says have no price feed at all (e.g. GB, AJK). */
  const [uncovered, setUncovered] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const [series, setSeries] = useState<TrendSeries[]>([])
  const [trendNotice, setTrendNotice] = useState<string | null>(null)
  const [chartCrop, setChartCrop] = useState<string>("")

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Facets come from one unfiltered read so the dropdowns never collapse to
   *  the current selection. */
  const [facetCrops, setFacetCrops] = useState<string[]>([])
  const [facetMandis, setFacetMandis] = useState<Array<{ name: string; province: string }>>([])
  const [provinces, setProvinces] = useState<Province[]>([])

  /* -- facets + provinces (once) ----------------------------------------- */

  useEffect(() => {
    let cancelled = false

    marketApi
      .getPrices({ limit: 200 })
      .then((res) => {
        if (cancelled || !res.success) return
        const all = (res.prices ?? []) as PriceRow[]
        setFacetCrops(Array.from(new Set(all.map((r) => r.cropName))).sort((a, b) => a.localeCompare(b)))

        const mandis = new Map<string, { name: string; province: string }>()
        for (const r of all) {
          if (r.market?.name && !mandis.has(r.market.name)) {
            mandis.set(r.market.name, { name: r.market.name, province: r.market.province })
          }
        }
        setFacetMandis(Array.from(mandis.values()).sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => {
        /* the filters degrade to "all"; the price list itself still loads */
      })

    // The canonical Pakistan province list, with Urdu names, already ships with
    // the weather location reference — reuse it instead of hardcoding geography.
    weatherApi
      .getLocations()
      .then((res) => {
        if (cancelled || !res.success) return
        const seen = new Map<string, Province>()
        for (const loc of (res.data ?? []) as Array<{ province: string; provinceUr: string }>) {
          if (!seen.has(loc.province)) seen.set(loc.province, { name: loc.province, nameUr: loc.provinceUr })
        }
        setProvinces(Array.from(seen.values()))
      })
      .catch(() => {
        /* province chips are hidden; crop and mandi filters still work */
      })

    return () => {
      cancelled = true
    }
  }, [])

  /* -- prices + trends for the current filter ---------------------------- */

  const requestId = useRef(0)

  // See the weather page: `t` changes identity on every language-context update,
  // so it is read through a ref rather than kept in `load`'s dependency list.
  const tRef = useRef(t)
  tRef.current = t

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      const id = ++requestId.current
      if (mode === "refresh") setRefreshing(true)
      else setLoading(true)
      setError(null)

      const filters = {
        crop: crop === ALL ? undefined : crop,
        city: mandi === ALL ? undefined : mandi,
        province: province || undefined,
      }

      try {
        const [priceRes, trendRes] = await Promise.all([
          marketApi.getPrices({ ...filters, limit: 200 } as Record<string, any>),
          marketApi.getTrends({ ...filters, days: TREND_DAYS } as Record<string, any>),
        ])
        if (id !== requestId.current) return

        if (!priceRes.success) {
          setError(priceRes.message || tRef.current("market.loadError"))
          return
        }

        setRows((priceRes.prices ?? []) as PriceRow[])
        setSource(((priceRes.source as SourceTag) ?? "cache") as SourceTag)
        const cov = (priceRes as Record<string, any>).coverage as
          | { provider?: string; uncoveredProvinces?: string[] }
          | undefined
        // Keep the raw list; the sentence around it is built with t() at render
        // time so it is not hardcoded English inside an Urdu page.
        setUncovered(cov?.uncoveredProvinces ?? [])
        setNotice(((priceRes as Record<string, any>).notice as string) ?? null)
        setLastUpdated((priceRes.lastUpdated as string) ?? null)

        if (trendRes.success) {
          const next = (trendRes.trends ?? []) as TrendSeries[]
          setSeries(next)
          setTrendNotice(((trendRes as Record<string, any>).notice as string) ?? null)
        } else {
          setSeries([])
          setTrendNotice(trendRes.message ?? null)
        }
      } catch {
        if (id !== requestId.current) return
        setError(tRef.current("validation.networkError"))
      } finally {
        if (id === requestId.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [crop, mandi, province],
  )

  useEffect(() => {
    load("initial")
  }, [load])

  /* -- keep the chart pointed at a series that still exists -------------- */

  useEffect(() => {
    if (series.length === 0) {
      setChartCrop("")
      return
    }
    setChartCrop((prev) => {
      if (prev && series.some((s) => s.cropName === prev)) return prev
      // Prefer a series that actually has a curve to draw.
      const drawable = series.find((s) => s.points.length >= 2)
      return (drawable ?? series[0]).cropName
    })
  }, [series])

  /* -- derived ----------------------------------------------------------- */

  const mandiOptions = useMemo(
    () => (province ? facetMandis.filter((m) => m.province === province) : facetMandis),
    [facetMandis, province],
  )

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.cropName.toLowerCase().includes(needle) ||
        r.variety.toLowerCase().includes(needle) ||
        r.market.name.toLowerCase().includes(needle) ||
        r.market.district.toLowerCase().includes(needle),
    )
  }, [rows, search])

  const activeSeries = useMemo(
    () => series.find((s) => s.cropName === chartCrop) ?? null,
    [series, chartCrop],
  )

  const filtersActive = province !== "" || mandi !== ALL || crop !== ALL || search !== ""

  const clearFilters = useCallback(() => {
    setProvince("")
    setMandi(ALL)
    setCrop(ALL)
    setSearch("")
  }, [])

  /* -- render ------------------------------------------------------------ */

  return (
    <div className="container-app space-y-5 py-4 md:max-w-5xl md:py-6">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("market.title")}</h1>
            <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
              {t("market.coverageNote")}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={() => load("refresh")}
            disabled={loading || refreshing}
            aria-label={t("common.refresh")}
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>

        <SourceBanner
          source={source}
          lastUpdated={lastUpdated}
          uncovered={uncovered}
          t={t}
          scriptClass={scriptClass}
        />
      </header>

      {/* The API's own explanation of why the data is not what you asked for. */}
      {notice ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-gold/50 bg-gold-surface p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
          <p dir="ltr" className="text-body-sm leading-[1.7] text-start text-foreground">
            {notice}
          </p>
        </div>
      ) : null}

      {/* -- filters -------------------------------------------------------- */}
      <section aria-label={t("market.filters")} className="space-y-3">
        {provinces.length > 0 ? (
          <div className="scroll-x no-scrollbar -mx-4 flex gap-2 px-4 pb-1">
            <FilterChip label={t("market.allProvinces")} active={province === ""} onClick={() => setProvince("")} />
            {provinces.map((p) => (
              <FilterChip
                key={p.name}
                label={isEnglish ? p.name : p.nameUr}
                active={province === p.name}
                onClick={() => {
                  setProvince(p.name)
                  setMandi(ALL)
                }}
              />
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
          <Select value={crop} onValueChange={setCrop}>
            <SelectTrigger className="h-11 text-base" aria-label={t("market.selectCommodity")}>
              <SelectValue placeholder={t("market.selectCommodity")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("market.allCrops")}</SelectItem>
              {facetCrops.map((c) => (
                <SelectItem key={c} value={c}>
                  {cropLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={mandi} onValueChange={setMandi}>
            <SelectTrigger className="h-11 text-base" aria-label={t("market.selectMandi")}>
              <SelectValue placeholder={t("market.selectMandi")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("market.allMandis")}</SelectItem>
              {mandiOptions.map((m) => (
                <SelectItem key={m.name} value={m.name}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("market.searchCrop")}
            aria-label={t("market.searchCrop")}
            className="h-11 ps-9 pe-9 text-base"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("common.reset")}
              className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {filtersActive ? (
          <Button variant="ghost" size="sm" className="min-h-tap gap-1.5" onClick={clearFilters}>
            <X className="size-4" aria-hidden="true" />
            <span className={scriptClass}>{t("market.clearFilters")}</span>
          </Button>
        ) : null}
      </section>

      {loading ? (
        <MarketSkeleton />
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <p className="font-semibold leading-[1.7]">{t("market.loadError")}</p>
                <p className="text-body-sm leading-[1.7] text-muted-foreground">{error}</p>
              </div>
            </div>
            <Button className="min-h-tap" onClick={() => load("refresh")}>
              <RefreshCw className="me-2 size-4" aria-hidden="true" />
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <TrendCard
            series={series}
            active={activeSeries}
            chartCrop={chartCrop}
            setChartCrop={setChartCrop}
            trendNotice={trendNotice}
            cropLabel={cropLabel}
            scriptClass={scriptClass}
            formatCurrency={formatCurrency}
            t={t}
          />

          <section aria-labelledby="market-prices-heading" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="market-prices-heading" className="text-lg font-semibold leading-[1.7]">
                {t("market.price")}
              </h2>
              <span className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
                {t("market.pricesShown", { count: visibleRows.length })}
              </span>
            </div>

            <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>{t("market.maundNote")}</p>

            {visibleRows.length === 0 ? (
              <Card>
                <CardContent className="space-y-3 p-5 text-center">
                  <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
                    {t("market.noPrices")}
                  </p>
                  {filtersActive ? (
                    <Button variant="outline" className="min-h-tap" onClick={clearFilters}>
                      {t("market.clearFilters")}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-2.5">
                {visibleRows.map((row) => (
                  <li key={`${row.cropName}|${row.variety}|${row.market.name}|${row.date}`}>
                    <PriceCard
                      row={row}
                      cropLabel={cropLabel}
                      scriptClass={scriptClass}
                      formatCurrency={formatCurrency}
                      formatNumber={formatNumber}
                      t={t}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------- source banner */

function SourceBanner({
  source,
  lastUpdated,
  uncovered,
  t,
  scriptClass,
}: {
  source: SourceTag
  lastUpdated: string | null
  /** The API's own description of what it served — used where no t() key fits. */
  uncovered: string[]
  t: (key: string, vars?: Record<string, string | number>) => string
  scriptClass: string
}) {
  const config = {
    amis: {
      Icon: Wifi,
      label: t("market.sourceLive"),
      note: t("market.sourceLiveNote"),
      className: "border-primary/40 bg-primary/10 text-foreground",
      badge: "bg-primary text-primary-foreground",
    },
    // PBS is a different provider from AMIS (national retail vs Punjab
    // wholesale), so it gets its own label and note rather than reusing the
    // AMIS copy, which would be untrue here.
    pbs: {
      Icon: Wifi,
      label: t("market.sourcePbs"),
      note: t("market.sourcePbsNote"),
      className: "border-primary/40 bg-primary/10 text-foreground",
      badge: "bg-primary text-primary-foreground",
    },
    cache: {
      Icon: Database,
      label: t("market.sourceCached"),
      note: t("market.sourceCachedNote"),
      className: "border-info/40 bg-info/10 text-foreground",
      badge: "bg-info text-info-foreground",
    },
    sample: {
      Icon: AlertTriangle,
      label: t("market.sourceSample"),
      note: t("market.sourceSampleNote"),
      className: "border-gold bg-gold-surface text-foreground",
      badge: "bg-gold text-gold-foreground",
    },
  }[source]

  const { Icon } = config

  return (
    <div className={`space-y-1.5 rounded-lg border p-2.5 ${config.className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.badge}`}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {config.label}
        </span>
        {lastUpdated ? (
          <span className="text-xs leading-[1.8] opacity-80">
            {t("common.lastUpdated")}{" "}
            <span className="force-ltr">{new Date(lastUpdated).toISOString().slice(0, 10)}</span>
          </span>
        ) : null}
      </div>
      <p className={`text-xs leading-[1.8] ${scriptClass}`}>{config.note}</p>
      {/* Say plainly where we have nothing, rather than letting an empty result
          look like "no price change". GB and AJK publish no feed at all. */}
      {uncovered.length > 0 ? (
        <p className={`text-xs leading-[1.8] opacity-80 ${scriptClass}`}>
          {t("market.noCoverage", { provinces: uncovered.join("، ") })}
        </p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ trend chart */

function TrendCard({
  series,
  active,
  chartCrop,
  setChartCrop,
  trendNotice,
  cropLabel,
  scriptClass,
  formatCurrency,
  t,
}: {
  series: TrendSeries[]
  active: TrendSeries | null
  chartCrop: string
  setChartCrop: (crop: string) => void
  trendNotice: string | null
  cropLabel: (name: string) => string
  scriptClass: string
  formatCurrency: (amount: number) => string
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  // Range band + modal line are two marks of ONE entity, so no legend is needed;
  // the card title names the series.
  const data = useMemo(
    () =>
      (active?.points ?? []).map((p) => ({
        date: p.date,
        label: p.date.slice(5),
        modal: p.modal,
        range: [p.minimum, p.maximum] as [number, number],
        minimum: p.minimum,
        maximum: p.maximum,
      })),
    [active],
  )

  const latest = active?.points[active.points.length - 1] ?? null
  const drawable = data.length >= 2

  return (
    <section aria-labelledby="market-trend-heading">
      <Card>
        <CardHeader className="space-y-3 p-4 pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle id="market-trend-heading" className={`text-lg leading-[1.7] ${scriptClass}`}>
                {t("market.priceTrend")}
              </CardTitle>
              <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
                {t("market.lastDays", { days: TREND_DAYS })} · {t("market.per100kg")}
                {providerLabel(active?.source, active?.priceType, t) ? (
                  // The curve tracks one provider only, never a blend of
                  // wholesale and retail, so name which one it is.
                  <>
                    {" · "}
                    <span>{providerLabel(active?.source, active?.priceType, t)}</span>
                  </>
                ) : null}
              </p>
            </div>
            {series.length > 0 ? (
              <Select value={chartCrop} onValueChange={setChartCrop}>
                <SelectTrigger className="h-11 w-full text-base xs:w-48" aria-label={t("market.selectCommodity")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {series.map((s) => (
                    <SelectItem key={s.cropName} value={s.cropName}>
                      {cropLabel(s.cropName)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {/* Hero figure — the number the card exists to deliver. */}
          {latest ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="force-ltr text-3xl font-bold leading-none">{formatCurrency(latest.modal)}</span>
              {active && active.points.length >= 2 ? (
                <ChangeBadge
                  direction={active.change.direction}
                  percentage={active.change.percentage}
                  t={t}
                  scriptClass={scriptClass}
                />
              ) : null}
              <span className="force-ltr text-xs text-muted-foreground">{latest.date}</span>
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="p-4 pt-2">
          {series.length === 0 ? (
            <EmptyTrend message={trendNotice ?? t("market.noTrendData")} scriptClass={scriptClass} />
          ) : !drawable ? (
            <EmptyTrend message={t("market.notEnoughHistory")} scriptClass={scriptClass} />
          ) : (
            <div dir="ltr" className="h-56 w-full sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid
                    vertical={false}
                    stroke="hsl(var(--border))"
                    strokeDasharray="2 4"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    minTickGap={16}
                  />
                  <YAxis
                    width={54}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    domain={["dataMin - 500", "dataMax + 500"]}
                  />
                  <Tooltip
                    cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" }}
                    content={<TrendTooltip formatCurrency={formatCurrency} t={t} />}
                  />
                  {/* min–max band for the same crop: context, not a second series */}
                  <Area
                    dataKey="range"
                    stroke="none"
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.12}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="modal"
                    type="monotone"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={data.length <= 14 ? { r: 4, fill: "hsl(var(--chart-1))", strokeWidth: 0 } : false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function EmptyTrend({ message, scriptClass }: { message: string; scriptClass: string }) {
  return (
    <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-5 text-center">
      <BarChart3 className="size-6 text-muted-foreground" aria-hidden="true" />
      <p dir="ltr" className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
        {message}
      </p>
    </div>
  )
}

function TrendTooltip({
  active,
  payload,
  label,
  formatCurrency,
  t,
}: {
  active?: boolean
  payload?: Array<{ payload: { modal: number; minimum: number; maximum: number; date: string } }>
  label?: string
  formatCurrency?: (amount: number) => string
  t?: (key: string, vars?: Record<string, string | number>) => string
}) {
  if (!active || !payload?.length || !formatCurrency || !t) return null
  const point = payload[0].payload

  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-card-lg">
      <p className="force-ltr text-xs text-muted-foreground">{point.date ?? label}</p>
      <p className="force-ltr mt-1 text-base font-semibold">{formatCurrency(point.modal)}</p>
      <p className="text-xs text-muted-foreground">
        {t("market.range")}:{" "}
        <span className="force-ltr">
          {formatCurrency(point.minimum)} – {formatCurrency(point.maximum)}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        {t("market.perMaund")}: <span className="force-ltr">{formatCurrency(toMaund(point.modal))}</span>
      </p>
    </div>
  )
}

/* --------------------------------------------------------------- helpers */

/** A published 100 kg rate converted to the 40 kg maund farmers trade in. */
function toMaund(per100kg: number): number {
  return Math.round((per100kg * MAUND_KG) / QUOTE_KG)
}

function ChangeBadge({
  direction,
  percentage,
  t,
  scriptClass,
}: {
  direction: "up" | "down" | "stable"
  percentage: number
  t: (key: string, vars?: Record<string, string | number>) => string
  scriptClass: string
}) {
  const config = {
    up: { Icon: TrendingUp, className: "text-price-up", labelKey: "market.rising" },
    down: { Icon: TrendingDown, className: "text-price-down", labelKey: "market.falling" },
    stable: { Icon: Minus, className: "text-muted-foreground", labelKey: "market.stable" },
  }[direction]

  const { Icon } = config

  return (
    <span className={`inline-flex items-center gap-1 text-body-sm font-semibold ${config.className}`}>
      <Icon className="size-4" aria-hidden="true" />
      <span className="force-ltr">
        {direction === "down" ? "−" : direction === "up" ? "+" : ""}
        {Math.abs(percentage)}%
      </span>
      <span className={`font-normal ${scriptClass}`}>{t(config.labelKey)}</span>
    </span>
  )
}

/* ------------------------------------------------------------- price card */

function PriceCard({
  row,
  cropLabel,
  scriptClass,
  formatCurrency,
  formatNumber,
  t,
}: {
  row: PriceRow
  cropLabel: (name: string) => string
  scriptClass: string
  formatCurrency: (amount: number) => string
  formatNumber: (value: number | string) => string
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const showVariety = row.variety && row.variety !== row.cropName

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className={`text-base font-semibold leading-[1.8] ${scriptClass}`}>{cropLabel(row.cropName)}</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {showVariety ? (
                <Badge variant="outline" className="max-w-full truncate leading-[1.7]">
                  {row.variety}
                </Badge>
              ) : null}
              {row.isSample ? (
                <span className="inline-flex items-center rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-gold-foreground">
                  {t("market.sourceSample")}
                </span>
              ) : providerLabel(row.source, row.priceType, t) ? (
                // Wholesale and retail rows sit side by side in one list, so
                // each card has to say which it is. A farmer comparing a Multan
                // mandi rate against a Karachi bazaar rate must see the
                // difference, not infer it.
                <span className={`inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ${scriptClass}`}>
                  {providerLabel(row.source, row.priceType, t)}
                </span>
              ) : null}
            </div>
            <p className="flex items-center gap-1 text-xs leading-[1.8] text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {row.market.name}
                {row.market.district && row.market.district !== row.market.name ? `, ${row.market.district}` : ""}
              </span>
            </p>
          </div>

          {row.trend.direction !== "stable" ? (
            <ChangeBadge
              direction={row.trend.direction}
              percentage={row.trend.percentage}
              t={t}
              scriptClass={scriptClass}
            />
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>{t("market.per100kg")}</p>
            <p className="force-ltr text-xl font-bold leading-tight text-primary">
              {formatCurrency(row.prices.modal)}
            </p>
          </div>
          <div className="rounded-lg bg-muted p-2.5">
            <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>{t("market.perMaund")}</p>
            <p className="force-ltr text-xl font-bold leading-tight">{formatCurrency(toMaund(row.prices.modal))}</p>
          </div>
        </div>

        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-[1.8]">
          <div className="flex items-center gap-1">
            <dt className={`text-muted-foreground ${scriptClass}`}>{t("market.range")}</dt>
            <dd className="force-ltr font-medium">
              {formatCurrency(row.prices.minimum)} – {formatCurrency(row.prices.maximum)}
            </dd>
          </div>
          {row.arrivals > 0 ? (
            <div className="flex items-center gap-1">
              <dt className={`text-muted-foreground ${scriptClass}`}>{t("market.arrivals")}</dt>
              <dd className="force-ltr font-medium">{formatNumber(row.arrivals)}</dd>
            </div>
          ) : null}
          <div className="flex items-center gap-1">
            <dt className={`text-muted-foreground ${scriptClass}`}>{t("common.lastUpdated")}</dt>
            <dd className="force-ltr font-medium">{row.date.slice(0, 10)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------- chrome-ish */

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-tap shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-body-sm leading-[1.7] ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
      }`}
    >
      {label}
    </button>
  )
}

function MarketSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-72 w-full rounded-lg" />
      <Skeleton className="h-6 w-32" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-44 w-full rounded-lg" />
      ))}
    </div>
  )
}
