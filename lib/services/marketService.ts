import { connectDB } from "@/lib/db"
import MarketPrice from "@/lib/models/MarketPrice"
import { resolveCrop } from "@/lib/data/pakistan-crops"
import { DEFAULT_REFRESH_MARKETS, findMarketsByPlace, refreshMarketPrices } from "@/lib/services/amisService"
import { PBS_CITIES, PBS_PROVINCES, refreshPbsPrices, type PbsRefreshResult } from "@/lib/services/pbsService"

/**
 * ---------------------------------------------------------------------------
 * Market prices — the read layer shared by every price source
 * ---------------------------------------------------------------------------
 *
 * Two live sources feed the `MarketPrice` cache, and this module is the only
 * thing that reads it back:
 *
 *   `amis`  AMIS Punjab (amis.pk) — daily **wholesale mandi** rates, Punjab only.
 *   `pbs`   PBS weekly SPI annexure — **retail** prices in 17 cities across
 *           Punjab, Sindh, KP, Balochistan and Islamabad.
 *
 * The two are never blended into one number. Rows keep their own `source` and
 * `priceType`, so a Karachi retail figure can sit in the same list as a Multan
 * mandi rate without either pretending to be the other.
 *
 * Everything is quoted in PKR per 100 kg. AMIS publishes that unit natively;
 * PBS per-kg prices are converted by exact arithmetic at write time.
 *
 * Guarantees the API contract depends on:
 *   - every response carries a `source` tag the UI renders as a badge;
 *   - a failed live fetch always falls back to the cache, never to an error;
 *   - a cold cache falls back to rows explicitly flagged `isSample`;
 *   - no price is ever invented.
 */

/** How far back a stored row still counts as "current". */
const FRESH_WINDOW_DAYS = 7

/** Both sources are normalised to 100 kg, which is one quintal. */
const QUOTE_UNIT = "quintal" as const

/**
 * Where a served price came from.
 *
 * `amis` / `pbs` mean a live fetch happened during this request; `cache` means
 * it was served from MongoDB; `sample` means placeholder figures because both
 * the network and the cache had nothing.
 */
export type PriceSource = "amis" | "pbs" | "cache" | "sample"

/** Wholesale mandi rate versus retail bazaar price — never interchangeable. */
export type PriceType = "wholesale" | "retail"

/** Per-row provenance stored in Mongo, mapped to what it actually means. */
const SOURCE_META: Record<string, { source: Exclude<PriceSource, "cache" | "sample">; priceType: PriceType }> = {
  amis: { source: "amis", priceType: "wholesale" },
  scraping: { source: "amis", priceType: "wholesale" },
  pbs: { source: "pbs", priceType: "retail" },
}

/**
 * Sources we will serve as real prices.
 *
 * Deliberately excludes `seeded` (demo
 * fixtures). The contract is explicit that fixture data must surface as
 * `source: "sample"`, so fixtures must never be read back as cached truth — and
 * the database may still hold demo seed rows.
 */
const TRUSTED_SOURCES = ["amis", "pbs", "scraping", "manual", "api"]

/** Every Pakistani province/territory, matched case-insensitively. */
export const PAKISTAN_PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Azad Jammu & Kashmir",
  "Gilgit-Baltistan",
  "Islamabad Capital Territory",
]

/**
 * Territories no free machine-readable source publishes prices for.
 *
 * AMIS is a Punjab service and the SPI basket stops at 17 urban centres, none
 * of them in GB or AJK. Rather than quietly showing a farmer in Skardu someone
 * else's prices, the API says plainly that the figures are from elsewhere.
 */
export const UNCOVERED_PROVINCES = ["Gilgit-Baltistan", "Azad Jammu & Kashmir"]

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const PROVINCE_RE = new RegExp(`^(${PAKISTAN_PROVINCES.map(escapeRegex).join("|")})$`, "i")

export interface PriceQuery {
  crop?: string
  /** City or district name. */
  city?: string
  province?: string
  days?: number
  limit?: number
  sortBy?: "date" | "price" | "crop"
}

export interface PriceRow {
  cropName: string
  variety: string
  market: { name: string; district: string; province: string }
  prices: { minimum: number; maximum: number; modal: number; average: number }
  /** Always "quintal" (= 100 kg). */
  unit: string
  currency: "PKR"
  date: string
  arrivals: number
  trend: { direction: "up" | "down" | "stable"; percentage: number }
  /** Which provider published this particular row. */
  source: Exclude<PriceSource, "cache">
  /** Whether this row is a mandi wholesale rate or a retail bazaar price. */
  priceType: PriceType
  isSample?: boolean
}

export interface Coverage {
  provider: string
  provinces: string[]
  uncoveredProvinces: string[]
}

export interface PricesResponse {
  prices: PriceRow[]
  source: PriceSource
  lastUpdated: string | null
  coverage: Coverage
  /** Present when the caller should know why the data is not what they asked for. */
  notice?: string
}

/** A single honest statement of what this deployment can and cannot see. */
export function coverage(): Coverage {
  const provinces = Array.from(new Set(["Punjab", ...PBS_PROVINCES])).sort()
  return {
    provider: "AMIS Punjab (amis.pk) wholesale + Pakistan Bureau of Statistics SPI (pbs.gov.pk) retail",
    provinces,
    uncoveredProvinces: UNCOVERED_PROVINCES,
  }
}

/** Resolves free text to one of the canonical province names. */
function matchProvince(input: string): string | undefined {
  const needle = input.trim().toLowerCase()
  if (!needle) return undefined
  return (
    PAKISTAN_PROVINCES.find((p) => p.toLowerCase() === needle) ??
    PAKISTAN_PROVINCES.find((p) => p.toLowerCase().includes(needle))
  )
}

/**
 * Turns a crop query into a `cropName` matcher.
 *
 * A recognised crop matches its canonical name **exactly**. A substring match
 * would undo the whole `excludeAliases` mechanism at read time: `crop=wheat`
 * would pull in "Wheat Straw" (fodder at a fifth of the grain price) and
 * `crop=potato` would pull in "Sweet Potato". Resolving first also means the
 * canonical key (`rice-basmati`) and the local name (`gram`, `chana`) find the
 * stored rows, which a raw substring regex never could.
 *
 * Unrecognised text stays a substring search so free-text queries for the
 * commodities we do not model ("Sugar", "Guava") still work.
 */
function cropMatcher(raw: string): RegExp {
  const canonical = resolveCrop(raw)
  return canonical ? new RegExp(`^${escapeRegex(canonical.en)}$`, "i") : new RegExp(escapeRegex(raw.trim()), "i")
}

function buildFilter(query: PriceQuery): Record<string, any> {
  const days = query.days && query.days > 0 ? Math.min(query.days, 365) : FRESH_WINDOW_DAYS
  const filter: Record<string, any> = {
    date: { $gte: new Date(Date.now() - days * 86_400_000) },
    source: { $in: TRUSTED_SOURCES },
    "market.state": PROVINCE_RE,
  }
  if (query.crop?.trim()) filter.cropName = cropMatcher(query.crop)

  if (query.province) {
    // Narrow, never widen: the caller's province must also be a Pakistani one.
    const wanted = matchProvince(query.province)
    filter["market.state"] = wanted ? new RegExp(`^${escapeRegex(wanted)}$`, "i") : "__no_such_province__"
  }

  if (query.city) {
    const re = new RegExp(escapeRegex(query.city), "i")
    filter.$or = [{ "market.name": re }, { "market.district": re }]
  }

  return filter
}

function toPriceRow(doc: any): PriceRow {
  const meta = SOURCE_META[doc.source] ?? { source: "amis" as const, priceType: "wholesale" as const }
  return {
    cropName: doc.cropName,
    variety: doc.variety,
    market: {
      name: doc.market?.name ?? "",
      district: doc.market?.district ?? "",
      province: doc.market?.state ?? "",
    },
    prices: {
      minimum: doc.prices?.minimum ?? 0,
      maximum: doc.prices?.maximum ?? 0,
      modal: doc.prices?.modal ?? 0,
      average: doc.prices?.average ?? 0,
    },
    unit: doc.unit ?? QUOTE_UNIT,
    currency: "PKR",
    date: new Date(doc.date).toISOString(),
    arrivals: doc.arrivals ?? 0,
    trend: { direction: "stable", percentage: 0 },
    source: meta.source,
    priceType: meta.priceType,
  }
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  date: { date: -1, "prices.modal": -1 },
  price: { "prices.modal": -1 },
  crop: { cropName: 1, date: -1 },
}

/**
 * Placeholder rows used only when every live source is unreachable *and* the
 * cache is empty (a cold database). Every row is flagged so no caller can
 * mistake it for a live quote. These are never written to MongoDB.
 */
const SAMPLE_PRICES: PriceRow[] = [
  ["Wheat", "Wheat", "Lahore", "Lahore", 8600, 8800],
  ["Rice (Basmati)", "Rice Basmati Super (New)", "Lahore", "Lahore", 30500, 32000],
  ["Maize", "Maize", "Faisalabad", "Faisalabad", 8700, 9000],
  ["Chickpea (Chana)", "Gram White(local)", "Multan", "Multan", 22500, 23500],
  ["Potato", "Potato Store", "Sahiwal", "Sahiwal", 6500, 7200],
  ["Onion", "Onion", "Multan", "Multan", 9000, 10500],
  ["Tomato", "Tomato", "Lahore", "Lahore", 8000, 9500],
  ["Mango", "Mango(Chounsa)", "Multan", "Multan", 14000, 18000],
].map(([cropName, variety, market, district, min, max]) => ({
  cropName: cropName as string,
  variety: variety as string,
  market: { name: market as string, district: district as string, province: "Punjab" },
  prices: {
    minimum: min as number,
    maximum: max as number,
    modal: Math.round(((min as number) + (max as number)) / 2),
    average: Math.round(((min as number) + (max as number)) / 2),
  },
  unit: QUOTE_UNIT,
  currency: "PKR" as const,
  date: new Date().toISOString(),
  arrivals: 0,
  trend: { direction: "stable" as const, percentage: 0 },
  source: "sample" as const,
  priceType: "wholesale" as const,
  isSample: true,
}))

/**
 * Attaches a 7-day trend to each row by comparing the oldest and newest stored
 * quote for the same crop + variety + market. Variety matters: "Potato Fresh"
 * and "Potato Store" are different price series in the same mandi.
 */
async function attachTrends(rows: PriceRow[]): Promise<void> {
  if (!rows.length) return
  const since = new Date(Date.now() - FRESH_WINDOW_DAYS * 86_400_000)

  const history: any[] = await (MarketPrice as any).aggregate([
    {
      $match: {
        date: { $gte: since },
        source: { $in: TRUSTED_SOURCES },
        cropName: { $in: Array.from(new Set(rows.map((r) => r.cropName))) },
      },
    },
    { $sort: { date: 1 } },
    {
      $group: {
        _id: { crop: "$cropName", variety: "$variety", market: "$market.name" },
        first: { $first: "$prices.modal" },
        last: { $last: "$prices.modal" },
      },
    },
  ])

  const index = new Map(history.map((h) => [`${h._id.crop}|${h._id.variety}|${h._id.market}`, h]))

  for (const row of rows) {
    const h = index.get(`${row.cropName}|${row.variety}|${row.market.name}`)
    if (!h?.first || h.first === h.last) continue
    const change = ((h.last - h.first) / h.first) * 100
    row.trend = {
      direction: change > 2 ? "up" : change < -2 ? "down" : "stable",
      percentage: Math.round(Math.abs(change) * 100) / 100,
    }
  }
}

/** True when a place name is a Punjab mandi AMIS actually publishes. */
function amisTargets(city?: string): number[] {
  if (!city) return []
  return findMarketsByPlace(city).map((m) => m.id)
}

/** True when the requested place is one of the 17 SPI urban centres. */
function isPbsCity(city?: string): boolean {
  if (!city) return false
  const needle = city.trim().toLowerCase()
  return Object.values(PBS_CITIES).some(
    (c) => c.name.toLowerCase().includes(needle) || c.district.toLowerCase().includes(needle),
  )
}

/**
 * Current prices, cache-first.
 *
 * Reads the cache, and only if it is empty tries a live fetch targeted at the
 * requested location — AMIS when the place is a Punjab mandi, PBS otherwise,
 * because PBS is the only source that reaches Sindh, KP and Balochistan.
 *
 * Falls back to tagged sample rows rather than failing: a farmer opening the
 * app offline should still see a working screen, clearly marked as such.
 */
export async function getMarketPrices(query: PriceQuery = {}): Promise<PricesResponse> {
  await connectDB()

  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200)
  const sort = SORTS[query.sortBy ?? "date"] ?? SORTS.date
  const cov = coverage()

  const read = async (q: PriceQuery) =>
    (await (MarketPrice as any).find(buildFilter(q)).sort(sort).limit(limit).lean()) as any[]

  let docs = await read(query)
  let source: PriceSource = "cache"
  let notice: string | undefined

  if (!docs.length) {
    // Only a genuinely cold *location* justifies a live fetch. Without this
    // probe an anonymous `?crop=<anything we do not stock>` would force a fresh
    // sweep and a bulk write on every single request, because the empty result
    // is caused by the crop filter, not by a missing cache.
    const locationIsCached = query.crop?.trim()
      ? await (MarketPrice as any).exists(buildFilter({ ...query, crop: undefined }))
      : null

    if (!locationIsCached) {
      const punjabIds = amisTargets(query.city)
      const wantsPbs = !query.city || isPbsCity(query.city) || !punjabIds.length

      // AMIS first when the caller named a Punjab mandi — it is the only
      // wholesale source, and wholesale is what a seller actually needs.
      if (punjabIds.length) {
        try {
          await refreshMarketPrices({ cityIds: punjabIds.slice(0, 3), concurrency: 3, budgetMs: 9_000 })
          docs = await read(query)
          if (docs.length) source = "amis"
        } catch (error) {
          console.error("AMIS on-demand refresh failed:", error)
        }
      }

      // PBS covers everywhere AMIS does not. One workbook holds all 17 cities,
      // so this single fetch backfills the whole country at once.
      if (!docs.length && wantsPbs) {
        try {
          const refreshed = await refreshPbsPrices({ weeks: 3, timeoutMs: 9_000 })
          if (refreshed.rowsParsed) {
            docs = await read(query)
            if (docs.length) source = "pbs"
          }
        } catch (error) {
          console.error("PBS SPI on-demand refresh failed:", error)
        }
      }

      // Last resort for an unfiltered cold start: the Punjab divisional mandis.
      if (!docs.length && !query.city && !query.province) {
        try {
          await refreshMarketPrices({
            cityIds: DEFAULT_REFRESH_MARKETS.slice(0, 3),
            concurrency: 3,
            budgetMs: 9_000,
          })
          docs = await read(query)
          if (docs.length) source = "amis"
        } catch (error) {
          console.error("AMIS fallback refresh failed:", error)
        }
      }
    }
  }

  // Still nothing for that place. Widen to the whole country and say so, rather
  // than pretending the farmer's district has no prices at all.
  if (!docs.length && (query.city || query.province)) {
    const widened = await read({ ...query, city: undefined, province: undefined })
    if (widened.length) {
      docs = widened
      const place = query.city ?? query.province
      const uncovered = query.province && UNCOVERED_PROVINCES.some((p) => matchProvince(query.province!) === p)
      notice = uncovered
        ? `No price service publishes rates for ${place}. AMIS covers Punjab mandis and the PBS SPI covers 17 cities in ` +
          `Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan and Islamabad. Showing the nearest available nationwide prices.`
        : `No prices are published for ${place} yet. Showing the nearest available nationwide prices.`
    }
  }

  if (!docs.length) {
    const wanted = query.crop?.trim()
    const label = wanted ? (resolveCrop(wanted)?.en ?? wanted) : undefined
    const filtered = label
      ? SAMPLE_PRICES.filter((row) => row.cropName.toLowerCase() === label.toLowerCase())
      : SAMPLE_PRICES

    // Returning eight unrelated crops to someone who asked for one is worse than
    // returning nothing, and claiming "the source could not be reached" when the
    // real reason is "we hold no prices for that crop" is simply untrue.
    if (label && !filtered.length) {
      const days = query.days && query.days > 0 ? Math.min(query.days, 365) : FRESH_WINDOW_DAYS
      return {
        prices: [],
        source: "sample",
        lastUpdated: null,
        coverage: cov,
        notice: `No prices are cached for "${label}". It was not quoted by AMIS or in the PBS SPI basket in the last ${days} days.`,
      }
    }

    return {
      prices: filtered,
      source: "sample",
      lastUpdated: null,
      coverage: cov,
      notice:
        "Sample data — neither AMIS nor the PBS SPI could be reached and no cached prices are stored yet. " +
        "These are placeholder figures, not real market rates.",
    }
  }

  const rows = docs.map(toPriceRow)
  await attachTrends(rows)

  const lastUpdated = rows.reduce<string | null>((latest, r) => (!latest || r.date > latest ? r.date : latest), null)

  return { prices: rows, source, lastUpdated, coverage: cov, notice }
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export interface TrendPoint {
  date: string
  modal: number
  minimum: number
  maximum: number
  arrivals: number
}

export interface TrendSeries {
  cropName: string
  market: string | null
  unit: string
  currency: "PKR"
  /** Whether this curve tracks wholesale mandi rates or retail bazaar prices. */
  priceType: PriceType
  /** The provider behind the curve, for an honest chart caption. */
  source: Exclude<PriceSource, "cache" | "sample">
  points: TrendPoint[]
  change: { absolute: number; percentage: number; direction: "up" | "down" | "stable" }
}

export interface TrendsResponse {
  series: TrendSeries[]
  source: PriceSource
  days: number
  coverage: Coverage
  notice?: string
}

/**
 * Daily price history per crop, averaged across the matching markets so a
 * series has one point per trading day.
 *
 * Reads the cache only; it never fetches. History accumulates from repeated
 * refresh runs, so a cold database legitimately returns an empty series rather
 * than a fabricated curve.
 *
 * **Wholesale and retail are never averaged into one curve.** Multan potatoes
 * were PKR 2,900/100 kg wholesale on the same day they were PKR 6,396 retail;
 * blending the two produces a chart that swings 40% whenever the mix of
 * reporting sources changes, which is pure artefact. We therefore group by
 * price type as well as by day, and give each crop the single series a farmer
 * should act on — wholesale where it exists, because that is what they are
 * paid, and retail elsewhere so Sindh, KP and Balochistan still get a curve.
 */
export async function getMarketTrends(query: PriceQuery = {}): Promise<TrendsResponse> {
  await connectDB()

  const days = Math.min(Math.max(query.days ?? 30, 1), 365)
  const match = buildFilter({ ...query, days })

  const grouped: any[] = await (MarketPrice as any).aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          crop: "$cropName",
          source: "$source",
          day: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
        },
        modal: { $avg: "$prices.modal" },
        minimum: { $min: "$prices.minimum" },
        maximum: { $max: "$prices.maximum" },
        arrivals: { $sum: "$arrivals" },
        unit: { $first: "$unit" },
      },
    },
    { $sort: { "_id.day": 1 } },
  ])

  // Keyed by crop + price type, so one crop can hold a wholesale and a retail
  // curve side by side before we choose between them.
  const byCropAndType = new Map<string, TrendSeries>()

  for (const row of grouped) {
    const crop = row._id.crop
    const meta = SOURCE_META[row._id.source] ?? { source: "amis" as const, priceType: "wholesale" as const }
    const key = `${crop}|${meta.priceType}`

    if (!byCropAndType.has(key)) {
      byCropAndType.set(key, {
        cropName: crop,
        market: query.city ?? null,
        unit: row.unit ?? QUOTE_UNIT,
        currency: "PKR",
        priceType: meta.priceType,
        source: meta.source,
        points: [],
        change: { absolute: 0, percentage: 0, direction: "stable" },
      })
    }
    byCropAndType.get(key)!.points.push({
      date: row._id.day,
      modal: Math.round(row.modal),
      minimum: Math.round(row.minimum),
      maximum: Math.round(row.maximum),
      arrivals: row.arrivals ?? 0,
    })
  }

  // Collapse to one series per crop. The client selects a chart by crop name,
  // so two entries sharing a name would make the picker ambiguous.
  const series: TrendSeries[] = []
  const chosen = new Map<string, TrendSeries>()
  for (const candidate of byCropAndType.values()) {
    const current = chosen.get(candidate.cropName)
    if (!current) {
      chosen.set(candidate.cropName, candidate)
      continue
    }
    // Prefer whichever actually describes a trend; break ties toward wholesale.
    const better =
      candidate.points.length >= 2 && current.points.length < 2
        ? candidate
        : current.points.length >= 2 && candidate.points.length < 2
          ? current
          : candidate.priceType === "wholesale"
            ? candidate
            : current
    chosen.set(candidate.cropName, better)
  }
  series.push(...chosen.values())
  for (const s of series) {
    const first = s.points[0]?.modal
    const last = s.points[s.points.length - 1]?.modal
    if (!first || !last) continue
    const absolute = last - first
    const percentage = Math.round((absolute / first) * 10_000) / 100
    s.change = {
      absolute,
      percentage,
      direction: percentage > 2 ? "up" : percentage < -2 ? "down" : "stable",
    }
  }

  // Only crops with at least two observations describe a trend.
  const usable = series.filter((s) => s.points.length >= 2)

  return {
    series: usable.length ? usable : series,
    source: "cache",
    days,
    coverage: coverage(),
    notice: series.length
      ? undefined
      : "No price history stored for this filter yet. Run POST /api/market/refresh to populate the cache.",
  }
}

// ---------------------------------------------------------------------------
// Refresh orchestration
// ---------------------------------------------------------------------------

export interface CombinedRefreshResult {
  amis: Awaited<ReturnType<typeof refreshMarketPrices>> | null
  pbs: PbsRefreshResult | null
  errors: Array<{ source: "amis" | "pbs"; error: string }>
}

/**
 * Refreshes both sources.
 *
 * They run concurrently and are reported independently: AMIS being down must
 * not stop the SPI workbook landing, because for a farmer in Sindh or KP the
 * SPI is the *only* live source there is.
 */
export async function refreshAllPrices(
  options: { cityIds?: number[]; concurrency?: number; budgetMs?: number; includeAmis?: boolean; includePbs?: boolean } = {},
): Promise<CombinedRefreshResult> {
  const includeAmis = options.includeAmis ?? true
  const includePbs = options.includePbs ?? true
  const errors: CombinedRefreshResult["errors"] = []

  const [amis, pbs] = await Promise.all([
    includeAmis
      ? refreshMarketPrices({
          cityIds: options.cityIds,
          concurrency: options.concurrency,
          budgetMs: options.budgetMs ?? 35_000,
        }).catch((error) => {
          errors.push({ source: "amis", error: String(error?.message ?? error) })
          return null
        })
      : Promise.resolve(null),
    includePbs
      ? refreshPbsPrices().catch((error) => {
          errors.push({ source: "pbs", error: String(error?.message ?? error) })
          return null
        })
      : Promise.resolve(null),
  ])

  return { amis, pbs, errors }
}
