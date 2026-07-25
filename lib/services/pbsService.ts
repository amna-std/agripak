import { connectDB } from "@/lib/db"
import MarketPrice from "@/lib/models/MarketPrice"
import { looksLikeZip, readSheet, type SheetRow } from "@/lib/services/xlsxLite"

/**
 * ---------------------------------------------------------------------------
 * PBS SPI — Pakistan Bureau of Statistics, weekly Sensitive Price Indicator
 * ---------------------------------------------------------------------------
 *
 * The national counterpart to AMIS. Every Thursday PBS publishes the SPI, and
 * alongside the headline index it publishes an *annexure workbook* holding the
 * underlying collected prices:
 *
 *   https://www.pbs.gov.pk/wp-content/uploads/2020/07/Annex_DD.MM.YYYY.xlsx
 *
 * `Appendix-A` of that workbook is a MIN / AVG / MAX price for each of 51
 * essential items in each of **17 cities across every province** — the exact
 * coverage gap AMIS leaves open. This is a real machine-readable government
 * file, not a scraped HTML table, and it needs no API key.
 *
 * ## What this data is, and is not
 *
 * SPI prices are **retail consumer prices**, collected in city bazaars. They
 * are *not* mandi wholesale rates. A farmer selling a truck of potatoes gets
 * the AMIS wholesale figure, not this one. We therefore keep the two sources
 * distinct end to end: rows land with `source: "pbs"` and the API reports
 * `priceType: "retail"` so the UI can never present them as a farm-gate quote.
 *
 * Prices are stored converted to PKR per 100 kg (the AMIS convention) purely so
 * that one list can be sorted and charted coherently. The conversion is exact
 * arithmetic on the published per-kg figure — no modelling, no markup.
 *
 * ## Coverage
 *
 *   Islamabad Capital Territory  Islamabad
 *   Punjab                       Rawalpindi, Gujranwala, Sialkot, Lahore,
 *                                Faisalabad, Sargodha, Multan, Bahawalpur
 *   Sindh                        Karachi, Hyderabad, Sukkur, Larkana
 *   Khyber Pakhtunkhwa           Peshawar, Bannu
 *   Balochistan                  Quetta, Khuzdar
 *
 * Gilgit-Baltistan and Azad Jammu & Kashmir are not in the SPI basket. No free
 * machine-readable source publishes prices for them, so we say so rather than
 * inventing a figure. See the coverage notice in `marketService.ts`.
 */

/** One workbook is ~55 KB; a slow week should still not hang a lambda. */
const FETCH_TIMEOUT_MS = 9000

/** How many past Thursdays to probe before giving up on a live publication. */
const MAX_WEEKS_BACK = 5

const UPLOADS_BASE = "https://www.pbs.gov.pk/wp-content/uploads/2020/07"

/** PBS quotes per kg; we normalise to 100 kg to match AMIS. */
const KG_PER_QUINTAL = 100

export interface PbsCity {
  name: string
  district: string
  province: string
}

/**
 * The 17 SPI urban centres, keyed by the two-digit code PBS prints in the
 * `Appendix-A` column headers (`"Lahore (05)"`).
 */
export const PBS_CITIES: Record<string, PbsCity> = {
  "01": { name: "Islamabad", district: "Islamabad", province: "Islamabad Capital Territory" },
  "02": { name: "Rawalpindi", district: "Rawalpindi", province: "Punjab" },
  "03": { name: "Gujranwala", district: "Gujranwala", province: "Punjab" },
  "04": { name: "Sialkot", district: "Sialkot", province: "Punjab" },
  "05": { name: "Lahore", district: "Lahore", province: "Punjab" },
  "06": { name: "Faisalabad", district: "Faisalabad", province: "Punjab" },
  "07": { name: "Sargodha", district: "Sargodha", province: "Punjab" },
  "08": { name: "Multan", district: "Multan", province: "Punjab" },
  "09": { name: "Bahawalpur", district: "Bahawalpur", province: "Punjab" },
  "10": { name: "Karachi", district: "Karachi", province: "Sindh" },
  "11": { name: "Hyderabad", district: "Hyderabad", province: "Sindh" },
  "12": { name: "Sukkur", district: "Sukkur", province: "Sindh" },
  "13": { name: "Larkana", district: "Larkana", province: "Sindh" },
  "14": { name: "Peshawar", district: "Peshawar", province: "Khyber Pakhtunkhwa" },
  "15": { name: "Bannu", district: "Bannu", province: "Khyber Pakhtunkhwa" },
  "16": { name: "Quetta", district: "Quetta", province: "Balochistan" },
  "17": { name: "Khuzdar", district: "Khuzdar", province: "Balochistan" },
}

/** Provinces the SPI reaches — used to build an honest coverage statement. */
export const PBS_PROVINCES = Array.from(new Set(Object.values(PBS_CITIES).map((c) => c.province)))

export interface PbsItem {
  /** Exact `Appendix-A` description, lower-cased for matching. */
  label: string
  /** Canonical crop name stored on `MarketPrice.cropName`. */
  cropName: string
  /** Variety label kept verbatim so the UI can show what was actually priced. */
  variety: string
  /** Kilograms in one published unit — the divisor that yields a per-kg price. */
  kgPerUnit: number
}

/**
 * The agricultural subset of the 51-item SPI basket.
 *
 * An explicit allowlist rather than a call to `resolveCrop`, for two reasons.
 * First, most of the basket is not farm produce at all (cement, CNG, soap,
 * wage rates) and must never reach a crop price screen. Second, fuzzy matching
 * actively misleads here: `resolveCrop("Wheat Flour Bag")` returns **Wheat**,
 * which would merge a 20 kg bag of atta into the same series as AMIS wheat
 * *grain* — two different commodities at very different prices. Flour is
 * therefore carried under its own name.
 *
 * Items priced by count or volume (eggs by the dozen, milk by the litre,
 * bananas by the dozen) are omitted: `MarketPrice` models weight only, and
 * storing a per-dozen figure as a per-100 kg rate would be a lie.
 */
export const PBS_ITEMS: PbsItem[] = [
  { label: "wheat flour bag", cropName: "Wheat Flour", variety: "Wheat Flour Bag (20 kg)", kgPerUnit: 20 },
  {
    label: "rice basmati broken (average quality)",
    cropName: "Rice (Basmati)",
    variety: "Rice Basmati Broken (Average Quality)",
    kgPerUnit: 1,
  },
  {
    label: "rice irri-6/9 (sindh/punjab)",
    cropName: "Rice (IRRI)",
    variety: "Rice IRRI-6/9 (Sindh/Punjab)",
    kgPerUnit: 1,
  },
  { label: "pulse masoor (washed)", cropName: "Masoor", variety: "Pulse Masoor (Washed)", kgPerUnit: 1 },
  { label: "pulse moong (washed)", cropName: "Moong", variety: "Pulse Moong (Washed)", kgPerUnit: 1 },
  { label: "pulse mash (washed)", cropName: "Mash", variety: "Pulse Mash (Washed)", kgPerUnit: 1 },
  { label: "pulse gram", cropName: "Chickpea (Chana)", variety: "Pulse Gram", kgPerUnit: 1 },
  { label: "potatoes", cropName: "Potato", variety: "Potatoes", kgPerUnit: 1 },
  { label: "onions", cropName: "Onion", variety: "Onions", kgPerUnit: 1 },
  { label: "tomatoes", cropName: "Tomato", variety: "Tomatoes", kgPerUnit: 1 },
  { label: "garlic (lehsun)", cropName: "Garlic", variety: "Garlic (Lehsun)", kgPerUnit: 1 },
  { label: "gur (average quality)", cropName: "Jaggery (Gur)", variety: "Gur (Average Quality)", kgPerUnit: 1 },
  { label: "sugar refined", cropName: "Sugar", variety: "Sugar Refined", kgPerUnit: 1 },
]

const ITEMS_BY_LABEL = new Map(PBS_ITEMS.map((i) => [i.label, i]))

// ---------------------------------------------------------------------------
// Locating the current workbook
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** `Annex_23.07.2026.xlsx` — the filename PBS uses for a week's annexure. */
export function annexUrl(date: Date): string {
  const name = `Annex_${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}.xlsx`
  return `${UPLOADS_BASE}/${name}`
}

/**
 * The SPI week ends on a Thursday, and the annexure is published the following
 * day. Returns candidate Thursdays newest-first.
 */
export function recentSpiThursdays(from = new Date(), weeks = MAX_WEEKS_BACK): Date[] {
  const anchor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  // 4 = Thursday. Step back to the most recent one (today included).
  const back = (anchor.getUTCDay() - 4 + 7) % 7
  anchor.setUTCDate(anchor.getUTCDate() - back)

  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(anchor)
    d.setUTCDate(d.getUTCDate() - i * 7)
    return d
  })
}

async function fetchWorkbook(url: string, timeoutMs: number): Promise<Buffer | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgriPak/1.0; +https://www.pbs.gov.pk)",
        Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
      },
    })
    if (!res.ok) return null

    const buf = Buffer.from(await res.arrayBuffer())

    // pbs.gov.pk answers a missing upload with its WordPress 404 *page* under
    // HTTP 200, so the status line proves nothing. The ZIP magic number does.
    return looksLikeZip(buf) ? buf : null
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Parsing Appendix-A
// ---------------------------------------------------------------------------

export interface PbsRow {
  item: PbsItem
  city: PbsCity
  /** PKR per 100 kg. */
  min: number
  max: number
  avg: number
}

export interface PbsSheet {
  /** Trading week the workbook is dated, at UTC midnight. */
  date: Date | null
  rows: PbsRow[]
}

/** Spreadsheet column letters to a zero-based index (`"A"`→0, `"AB"`→27). */
function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function colName(index: number): string {
  let n = index + 1
  let out = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function toNumber(raw: string | undefined): number {
  if (!raw) return 0
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) ? n : 0
}

/** Matches a city header cell such as `"Lahore (05)"`. */
const CITY_HEADER_RE = /^(.+?)\s*\((\d{2})\)$/

/**
 * Parses `Appendix-A`.
 *
 * The sheet is laid out as three stacked blocks of cities (7 + 7 + 3). Each
 * block opens with a header row naming its cities and, under each city, a
 * MIN / AVG / MAX column triple; the 51 item rows follow. Rather than pinning
 * the block boundaries to row numbers — PBS shifts them whenever a note is
 * added — we detect a header row by its `City (NN)` cells and treat every item
 * row beneath it as belonging to that block until the next header appears.
 *
 * The trailing `National Average` columns of the third block are intentionally
 * skipped: an average across 17 cities is not a market, and presenting it as
 * one would put a price on a mandi that does not exist.
 */
export function parseAppendixA(rows: SheetRow[]): PbsSheet {
  let date: Date | null = null
  let active: Array<{ city: PbsCity; min: string; avg: string; max: string }> = []
  const out: PbsRow[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    for (const value of Object.values(row)) {
      if (date) break
      const m = /PRICES ON\s*(\d{2})-(\d{2})-(\d{4})/i.exec(value)
      if (m) {
        const parsed = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
        if (!Number.isNaN(parsed.getTime())) date = parsed
      }
    }

    // A header row re-binds which columns belong to which city.
    const headers: typeof active = []
    for (const [col, value] of Object.entries(row)) {
      const m = CITY_HEADER_RE.exec(value)
      if (!m) continue
      const city = PBS_CITIES[m[2]]
      if (!city) continue
      const base = colIndex(col)
      headers.push({ city, min: colName(base), avg: colName(base + 1), max: colName(base + 2) })
    }
    if (headers.length) {
      active = headers
      continue
    }

    if (!active.length) continue

    // Item rows carry a serial number in A, a description in B and a unit in C.
    // The block's column-number legend row (A="1", B="2", C="3") also matches
    // that shape, so it is filtered out by the description lookup below.
    const label = row.B?.toLowerCase()
    if (!label || !/^\d+$/.test(row.A ?? "")) continue

    const item = ITEMS_BY_LABEL.get(label)
    if (!item) continue

    for (const { city, min, avg, max } of active) {
      const rawMin = toNumber(row[min])
      const rawAvg = toNumber(row[avg])
      const rawMax = toNumber(row[max])

      // PBS writes 0 for an item that is not sold in that city. Keeping those
      // would drag every average down and invent a free commodity.
      if (rawAvg <= 0 && rawMin <= 0 && rawMax <= 0) continue

      const key = `${item.cropName}|${city.name}`
      if (seen.has(key)) continue
      seen.add(key)

      const perQuintal = (value: number) => Math.round((value / item.kgPerUnit) * KG_PER_QUINTAL)

      const avgQ = perQuintal(rawAvg > 0 ? rawAvg : (rawMin + rawMax) / 2)
      const minQ = rawMin > 0 ? perQuintal(rawMin) : avgQ
      const maxQ = rawMax > 0 ? perQuintal(rawMax) : avgQ

      out.push({ item, city, min: minQ, max: maxQ, avg: avgQ })
    }
  }

  return { date, rows: out }
}

// ---------------------------------------------------------------------------
// Fetch + persist
// ---------------------------------------------------------------------------

export interface PbsRefreshResult {
  /** URL of the workbook actually used, if one was found. */
  url: string | null
  weekEnding: string | null
  citiesCovered: number
  rowsParsed: number
  rowsUpserted: number
  attempts: string[]
  durationMs: number
}

/**
 * Downloads the newest available SPI annexure and parses `Appendix-A`.
 *
 * Walks back week by week because PBS publishes on the Friday after the
 * Thursday week-end, and occasionally slips a day or skips a public holiday.
 * Returns `null` when no workbook inside the window is retrievable.
 */
export async function fetchLatestSpi(
  options: { weeks?: number; timeoutMs?: number; now?: Date } = {},
): Promise<{ url: string; sheet: PbsSheet; attempts: string[] } | null> {
  const attempts: string[] = []

  for (const thursday of recentSpiThursdays(options.now, options.weeks ?? MAX_WEEKS_BACK)) {
    const url = annexUrl(thursday)
    attempts.push(url)
    try {
      const buf = await fetchWorkbook(url, options.timeoutMs ?? FETCH_TIMEOUT_MS)
      if (!buf) continue

      const sheet = parseAppendixA(readSheet(buf, 0))
      if (sheet.rows.length) return { url, sheet, attempts }
    } catch (error) {
      // A single unreadable week must not stop us finding an older one.
      console.error(`PBS SPI fetch failed for ${url}:`, error)
    }
  }

  return null
}

/**
 * Refreshes the cached `MarketPrice` documents from the latest SPI annexure.
 *
 * Upserts are keyed on (cropName, variety, market, date) exactly as the AMIS
 * refresh is, so re-running for the same week overwrites instead of stacking
 * duplicate rows.
 */
export async function refreshPbsPrices(
  options: { weeks?: number; timeoutMs?: number } = {},
): Promise<PbsRefreshResult> {
  const started = Date.now()

  const result: PbsRefreshResult = {
    url: null,
    weekEnding: null,
    citiesCovered: 0,
    rowsParsed: 0,
    rowsUpserted: 0,
    attempts: [],
    durationMs: 0,
  }

  const found = await fetchLatestSpi(options)
  result.attempts = found?.attempts ?? []

  if (!found) {
    result.durationMs = Date.now() - started
    return result
  }

  await connectDB()

  const date = found.sheet.date ?? new Date(new Date().toISOString().slice(0, 10))
  result.url = found.url
  result.weekEnding = date.toISOString().slice(0, 10)
  result.rowsParsed = found.sheet.rows.length
  result.citiesCovered = new Set(found.sheet.rows.map((r) => r.city.name)).size

  const operations = found.sheet.rows.map((row) => ({
    updateOne: {
      filter: {
        cropName: row.item.cropName,
        variety: row.item.variety,
        "market.name": row.city.name,
        date,
      },
      update: {
        $set: {
          cropName: row.item.cropName,
          variety: row.item.variety,
          market: {
            name: row.city.name,
            district: row.city.district,
            state: row.city.province,
            marketCode: `PBS-SPI-${row.city.name}`,
          },
          prices: {
            minimum: row.min,
            maximum: row.max,
            modal: row.avg,
            average: row.avg,
          },
          unit: "quintal",
          date,
          arrivals: 0,
          source: "pbs",
          isVerified: true,
        },
      },
      upsert: true,
    },
  }))

  if (operations.length) {
    const written = await (MarketPrice as any).bulkWrite(operations, { ordered: false })
    result.rowsUpserted = (written.upsertedCount ?? 0) + (written.modifiedCount ?? 0)
    // Re-running within the same week matches every row without changing it.
    // Report the rows the sweep actually covered rather than a misleading zero.
    if (result.rowsUpserted === 0) result.rowsUpserted = written.matchedCount ?? 0
  }

  result.durationMs = Date.now() - started
  return result
}
