import * as cheerio from "cheerio"

import { connectDB } from "@/lib/db"
import MarketPrice from "@/lib/models/MarketPrice"
import { resolveCrop } from "@/lib/data/pakistan-crops"

/**
 * AMIS (Agricultural Marketing Information Service), Directorate of Agriculture
 * Punjab — the only free, key-less source of real Pakistani mandi prices.
 *
 *   http://www.amis.pk/ViewPrices.aspx?searchType=1&commodityId=<cityId>
 *
 * Despite the parameter name, `commodityId` under `searchType=1` selects the
 * **city**; the page then lists every commodity traded in that city's mandi.
 * The price table renders as rows of
 *
 *   [ "<n> <Commodity>", "Graph", Min, Max, FQP, Quantity ]
 *
 * under single-cell section headers (Grains / Vegetables / Fruits), with a
 * `Dated:DD-MM-YYYY` header cell. **All prices are PKR per 100 kg** unless the
 * commodity label says otherwise (`(100Pcs)`, `(DOZEN)`).
 *
 * Coverage note: AMIS is a *Punjab* service with no Sindh / KP / Balochistan
 * mandis. The rest of the country is covered by the PBS SPI annexure — see
 * `pbsService.ts` — and the two are combined by `marketService.ts`, which owns
 * every read of the `MarketPrice` cache. This module only fetches and writes.
 *
 * AMIS remains the more valuable of the two where it reaches, because it quotes
 * **wholesale mandi** rates: what a farmer is actually paid. The SPI quotes
 * retail. They are tagged distinctly and never averaged together.
 */

/** Hard ceiling on a single AMIS page fetch so a slow mandi never hangs a lambda. */
const FETCH_TIMEOUT_MS = 8000

/** How far back a stored row still counts as "current". */
const FRESH_WINDOW_DAYS = 7

/** AMIS quotes per 100 kg, which is exactly one quintal. */
const AMIS_UNIT = "quintal" as const

export interface AmisMarket {
  /** `commodityId` query value. */
  id: number
  /** Display name of the mandi city. */
  name: string
  /** Administrative district the mandi sits in. */
  district: string
  /** Stored in `MarketPrice.market.state` (the model predates the rename to province). */
  province: string
}

/**
 * Every city AMIS publishes (verified by enumeration — ids 12 and 40 are gaps).
 * All are Punjab; `district` maps tehsil-level mandis onto their district.
 */
export const AMIS_MARKETS: AmisMarket[] = [
  { id: 1, name: "Lahore", district: "Lahore", province: "Punjab" },
  { id: 2, name: "Faisalabad", district: "Faisalabad", province: "Punjab" },
  { id: 3, name: "Gujranwala", district: "Gujranwala", province: "Punjab" },
  { id: 4, name: "Okara", district: "Okara", province: "Punjab" },
  { id: 5, name: "Sargodha", district: "Sargodha", province: "Punjab" },
  { id: 6, name: "Rawalpindi", district: "Rawalpindi", province: "Punjab" },
  { id: 7, name: "Multan", district: "Multan", province: "Punjab" },
  { id: 8, name: "Rahim Yar Khan", district: "Rahim Yar Khan", province: "Punjab" },
  { id: 9, name: "Bhakkar", district: "Bhakkar", province: "Punjab" },
  { id: 10, name: "Bhalwal", district: "Sargodha", province: "Punjab" },
  { id: 11, name: "Kasur", district: "Kasur", province: "Punjab" },
  { id: 13, name: "Sahiwal", district: "Sahiwal", province: "Punjab" },
  { id: 14, name: "Vehari", district: "Vehari", province: "Punjab" },
  { id: 15, name: "Burewala", district: "Vehari", province: "Punjab" },
  { id: 16, name: "Layyah", district: "Layyah", province: "Punjab" },
  { id: 17, name: "Gujrat", district: "Gujrat", province: "Punjab" },
  { id: 18, name: "Khanewal", district: "Khanewal", province: "Punjab" },
  { id: 19, name: "Muzaffargarh", district: "Muzaffargarh", province: "Punjab" },
  { id: 20, name: "Bahawalpur", district: "Bahawalpur", province: "Punjab" },
  { id: 21, name: "Toba Tek Singh", district: "Toba Tek Singh", province: "Punjab" },
  { id: 22, name: "Kabirwala", district: "Khanewal", province: "Punjab" },
  { id: 23, name: "Pattoki", district: "Kasur", province: "Punjab" },
  { id: 24, name: "Arifwala", district: "Pakpattan", province: "Punjab" },
  { id: 25, name: "Jaranwala", district: "Faisalabad", province: "Punjab" },
  { id: 26, name: "Pakpattan", district: "Pakpattan", province: "Punjab" },
  { id: 27, name: "Bahawalnagar", district: "Bahawalnagar", province: "Punjab" },
  { id: 28, name: "Lodhran", district: "Lodhran", province: "Punjab" },
  { id: 29, name: "Haroonabad", district: "Bahawalnagar", province: "Punjab" },
  { id: 30, name: "Chishtian", district: "Bahawalnagar", province: "Punjab" },
  { id: 31, name: "Gujar Khan", district: "Rawalpindi", province: "Punjab" },
  { id: 32, name: "Mailsi", district: "Vehari", province: "Punjab" },
  { id: 33, name: "Kahror Pacca", district: "Lodhran", province: "Punjab" },
  { id: 34, name: "Chichawatni", district: "Sahiwal", province: "Punjab" },
  { id: 35, name: "Dunyapur", district: "Lodhran", province: "Punjab" },
  { id: 36, name: "Dera Ghazi Khan", district: "Dera Ghazi Khan", province: "Punjab" },
  { id: 37, name: "Chunian", district: "Kasur", province: "Punjab" },
  { id: 38, name: "Phool Nagar", district: "Kasur", province: "Punjab" },
  { id: 39, name: "Lala Musa", district: "Gujrat", province: "Punjab" },
  { id: 41, name: "Mandi Bahauddin", district: "Mandi Bahauddin", province: "Punjab" },
  { id: 42, name: "Jalalpur Jattan", district: "Gujrat", province: "Punjab" },
  { id: 43, name: "Daska", district: "Sialkot", province: "Punjab" },
  { id: 44, name: "Gojra", district: "Toba Tek Singh", province: "Punjab" },
  { id: 45, name: "Kamalia", district: "Toba Tek Singh", province: "Punjab" },
]

/**
 * Divisional headquarters — the default sweep when no cities are named. Keeps a
 * cron refresh inside the lambda budget while covering every Punjab division.
 */
export const DEFAULT_REFRESH_MARKETS = [1, 2, 7, 6, 20, 5, 13, 36, 3, 8]

const MARKETS_BY_ID = new Map(AMIS_MARKETS.map((m) => [m.id, m]))

export function findMarket(id: number): AmisMarket | undefined {
  return MARKETS_BY_ID.get(id)
}

/** Resolves a free-text city/district query to AMIS market ids. */
export function findMarketsByPlace(place: string): AmisMarket[] {
  const needle = place.trim().toLowerCase()
  if (!needle) return []
  return AMIS_MARKETS.filter(
    (m) => m.name.toLowerCase().includes(needle) || m.district.toLowerCase().includes(needle),
  )
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** What a price is quoted per. AMIS defaults to 100 kg; some fruit is sold by count. */
export type QuoteBasis = "100kg" | "100pcs" | "dozen"

export interface AmisRow {
  /** Raw AMIS commodity label, kept verbatim as the variety. */
  rawLabel: string
  /** Canonical crop name where we recognise it, else the cleaned AMIS label. */
  cropName: string
  /** Canonical crop key from `pakistan-crops`, when resolved. */
  cropKey?: string
  section: string
  min: number
  max: number
  /** Fair/most-frequent price quoted by AMIS — used as the modal price. */
  fqp: number
  quantity: number
  basis: QuoteBasis
}

export interface AmisPage {
  cityId: number
  /** City name as AMIS reports it, for cross-checking our market table. */
  reportedCity: string | null
  /** Trading day the page is dated, at UTC midnight. */
  date: Date | null
  rows: AmisRow[]
}

const SECTION_LABELS = new Set(["grains", "vegetables", "fruits", "others", "pulses"])

function toNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "")
  if (!cleaned) return 0
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function quoteBasis(label: string): QuoteBasis {
  const l = label.toLowerCase()
  if (l.includes("dozen")) return "dozen"
  if (/\d+\s*pcs/.test(l)) return "100pcs"
  return "100kg"
}

/** Strips the AMIS row number and the Urdu gloss in parentheses. */
function cleanLabel(cell: string): string {
  return cell
    .replace(/^\d+\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function parseAmisHtml(html: string, cityId: number): AmisPage {
  const $ = cheerio.load(html)

  const reportedCity = $("#ctl00_cphPage_lblMsg").first().text().trim() || null

  let date: Date | null = null
  const dated = $.root().text().match(/Dated:\s*(\d{2})-(\d{2})-(\d{4})/)
  if (dated) {
    const [, dd, mm, yyyy] = dated
    date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
    if (Number.isNaN(date.getTime())) date = null
  }

  const rows: AmisRow[] = []
  const seen = new Set<string>()
  let section = "other"

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("td,th")
      .map((__, c) => $(c).text().replace(/\s+/g, " ").trim())
      .get()

    // Single-cell section header, e.g. "Vegetables".
    if (cells.length === 1) {
      const candidate = cells[0].toLowerCase()
      if (SECTION_LABELS.has(candidate)) section = candidate
      return
    }

    // Data rows are exactly [label, "Graph", min, max, fqp, quantity].
    if (cells.length !== 6) return
    if (cells[1].toLowerCase() !== "graph") return
    if (!/^\d+\s+\S/.test(cells[0])) return

    const rawLabel = cleanLabel(cells[0])
    if (!rawLabel || seen.has(rawLabel)) return

    const min = toNumber(cells[2])
    const max = toNumber(cells[3])
    const fqp = toNumber(cells[4])

    // AMIS prints "-" when a commodity did not trade that day. Skipping keeps
    // zero-price rows out of the cache instead of poisoning trend maths.
    if (min <= 0 && max <= 0 && fqp <= 0) return

    seen.add(rawLabel)
    const crop = resolveCrop(rawLabel)

    rows.push({
      rawLabel,
      cropName: crop?.en ?? rawLabel,
      cropKey: crop?.key,
      section,
      min,
      max,
      fqp,
      quantity: toNumber(cells[5]),
      basis: quoteBasis(rawLabel),
    })
  })

  return { cityId, reportedCity, date, rows }
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        // AMIS serves a stripped page to clients that look like bots.
        "User-Agent": "Mozilla/5.0 (compatible; AgriPak/1.0; +https://amis.pk)",
        Accept: "text/html,application/xhtml+xml",
      },
    })
    if (!res.ok) throw new Error(`AMIS responded ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Fetches and parses one AMIS city page. Throws on network/HTTP failure. */
export async function scrapeMarket(cityId: number, timeoutMs = FETCH_TIMEOUT_MS): Promise<AmisPage> {
  const url = `http://www.amis.pk/ViewPrices.aspx?searchType=1&commodityId=${cityId}`
  return parseAmisHtml(await fetchWithTimeout(url, timeoutMs), cityId)
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * The `MarketPrice.source` enum predates this integration. Pick the closest
 * value the live schema actually allows so upserts never fail validation if
 * another agent widens (or narrows) the enum later.
 */
function dbSourceValue(): string {
  const path: any = (MarketPrice as any).schema?.path?.("source")
  const allowed: string[] | undefined = path?.enumValues
  const preferred = ["amis", "scraping", "api", "manual"]
  if (!allowed?.length) return preferred[0]
  return preferred.find((v) => allowed.includes(v)) ?? allowed[0]
}

export interface RefreshResult {
  markets: number
  marketsFailed: Array<{ cityId: number; name?: string; error: string }>
  rowsParsed: number
  rowsUpserted: number
  /** Count-only commodities we cannot store, because they are not priced by weight. */
  rowsSkippedNonWeight: number
  date: string | null
  durationMs: number
}

/** Runs `task` over `items` with a bounded worker pool and a wall-clock budget. */
async function pool<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  task: (item: T) => Promise<R>,
): Promise<Array<{ item: T; result?: R; error?: any; skipped?: boolean }>> {
  const out: Array<{ item: T; result?: R; error?: any; skipped?: boolean }> = []
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++]
      if (Date.now() > deadline) {
        out.push({ item, skipped: true })
        continue
      }
      try {
        out.push({ item, result: await task(item) })
      } catch (error) {
        out.push({ item, error })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export interface RefreshOptions {
  /** AMIS city ids to sweep. Defaults to the divisional headquarters. */
  cityIds?: number[]
  /** Parallel page fetches. AMIS is a modest ASP.NET box — keep this small. */
  concurrency?: number
  /** Wall-clock budget for the whole sweep. */
  budgetMs?: number
}

/**
 * Scrapes AMIS and upserts the results into `MarketPrice`.
 *
 * Upserts are keyed on (cropName, market name, trading day) so re-running the
 * refresh for the same day overwrites rather than duplicating.
 */
export async function refreshMarketPrices(options: RefreshOptions = {}): Promise<RefreshResult> {
  const started = Date.now()
  const cityIds = (options.cityIds?.length ? options.cityIds : DEFAULT_REFRESH_MARKETS).filter((id) =>
    MARKETS_BY_ID.has(id),
  )
  const budgetMs = options.budgetMs ?? 45_000
  const deadline = started + budgetMs
  const source = dbSourceValue()

  await connectDB()

  const outcomes = await pool(cityIds, options.concurrency ?? 4, deadline, (id) => scrapeMarket(id))

  const result: RefreshResult = {
    markets: 0,
    marketsFailed: [],
    rowsParsed: 0,
    rowsUpserted: 0,
    rowsSkippedNonWeight: 0,
    date: null,
    durationMs: 0,
  }

  const operations: any[] = []

  for (const outcome of outcomes) {
    const market = MARKETS_BY_ID.get(outcome.item)!

    if (outcome.skipped) {
      result.marketsFailed.push({ cityId: market.id, name: market.name, error: "Skipped: time budget exhausted" })
      continue
    }
    if (outcome.error || !outcome.result) {
      result.marketsFailed.push({
        cityId: market.id,
        name: market.name,
        error: outcome.error?.name === "AbortError" ? "Timed out" : String(outcome.error?.message ?? outcome.error),
      })
      continue
    }

    const page = outcome.result
    const date = page.date ?? new Date(new Date().toISOString().slice(0, 10))
    if (!result.date) result.date = date.toISOString().slice(0, 10)
    result.markets += 1
    result.rowsParsed += page.rows.length

    for (const row of page.rows) {
      if (row.basis !== "100kg") {
        // MarketPrice only models weight units; storing a per-piece price as a
        // quintal price would be a lie, so these are reported but not cached.
        result.rowsSkippedNonWeight += 1
        continue
      }

      const modal = row.fqp > 0 ? row.fqp : Math.round((row.min + row.max) / 2)
      const min = row.min > 0 ? row.min : modal
      const max = row.max > 0 ? row.max : modal

      operations.push({
        updateOne: {
          // `variety` is part of the key: one mandi quotes several lines of the
          // same crop on the same day (Gram White vs Gram Black, Potato Fresh
          // vs Potato Store) and they must not overwrite each other.
          filter: { cropName: row.cropName, variety: row.rawLabel, "market.name": market.name, date },
          update: {
            $set: {
              cropName: row.cropName,
              variety: row.rawLabel,
              market: {
                name: market.name,
                district: market.district,
                state: market.province,
                marketCode: `AMIS-${market.id}`,
              },
              prices: {
                minimum: min,
                maximum: max,
                modal,
                average: Math.round((min + max) / 2),
              },
              unit: AMIS_UNIT,
              date,
              arrivals: row.quantity,
              source,
              isVerified: true,
            },
          },
          upsert: true,
        },
      })
    }
  }

  if (operations.length) {
    const written = await (MarketPrice as any).bulkWrite(operations, { ordered: false })
    result.rowsUpserted = (written.upsertedCount ?? 0) + (written.modifiedCount ?? 0)
    // A same-day re-run matches every row without changing it; report the real
    // number of rows the sweep covered rather than a misleading zero.
    if (result.rowsUpserted === 0) result.rowsUpserted = written.matchedCount ?? 0
  }

  result.durationMs = Date.now() - started
  return result
}
