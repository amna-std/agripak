import { fail, handler, ok, readJson, searchParams } from "@/lib/api-helpers"
import { authenticate, hasRole } from "@/lib/auth-helpers"
import { AMIS_MARKETS, DEFAULT_REFRESH_MARKETS, findMarketsByPlace } from "@/lib/services/amisService"
import { refreshAllPrices } from "@/lib/services/marketService"

export const dynamic = "force-dynamic"
/** A full sweep of every mandi needs more than the default 10s lambda budget. */
export const maxDuration = 60

/**
 * Refreshes the cached `MarketPrice` documents from both live sources.
 *
 * AMIS (Punjab wholesale mandi rates) and the PBS weekly SPI annexure (retail
 * prices for 17 cities nationwide) run concurrently and are reported
 * separately. Either failing alone is not an error: for a farmer in Sindh, KP
 * or Balochistan the SPI is the only live source there is, so it must still
 * land when AMIS is down — and vice versa.
 *
 * This replaces the old `node-cron` job, which cannot exist on Vercel. Wire it
 * up in `vercel.json`:
 *
 *   { "crons": [{ "path": "/api/market/refresh", "schedule": "30 12 * * *" }] }
 *
 * Vercel Cron issues a GET, so both verbs are exported.
 *
 * Access — any one of:
 *   - the `x-vercel-cron` header (Vercel strips this from external requests)
 *   - `Authorization: Bearer $CRON_SECRET`
 *   - a signed-in user with the `admin` role
 */

interface RefreshRequest {
  cities?: unknown
  concurrency?: unknown
  /** Set `"amis"` or `"pbs"` to refresh just one source. Defaults to both. */
  only?: unknown
}

async function authorize(req: Request): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (req.headers.get("x-vercel-cron")) return { ok: true }

  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return { ok: true }
  }

  const auth = await authenticate(req)
  if (auth.ok && hasRole(auth, "admin")) return { ok: true }
  if (auth.ok) return { ok: false, status: 403, message: "Admin role required to refresh market prices." }

  return { ok: false, status: 401, message: "Not authorised to refresh market prices." }
}

/** Resolves the `cities` input (ids, names, or "all") to AMIS city ids. */
function resolveCities(input: unknown): { ids?: number[]; error?: string } {
  if (input == null || input === "") return { ids: undefined }

  const tokens = Array.isArray(input)
    ? input.map((t) => String(t).trim())
    : String(input)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)

  if (tokens.some((t) => t.toLowerCase() === "all")) {
    return { ids: AMIS_MARKETS.map((m) => m.id) }
  }

  const ids = new Set<number>()
  const unknown: string[] = []

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const id = Number.parseInt(token, 10)
      if (AMIS_MARKETS.some((m) => m.id === id)) ids.add(id)
      else unknown.push(token)
      continue
    }
    const matches = findMarketsByPlace(token)
    if (matches.length) matches.forEach((m) => ids.add(m.id))
    else unknown.push(token)
  }

  if (!ids.size) {
    return { error: `No AMIS market matched: ${unknown.join(", ")}` }
  }
  return { ids: Array.from(ids) }
}

async function runRefresh(req: Request, input: RefreshRequest) {
  const gate = await authorize(req)
  if (!gate.ok) return fail(gate.message, gate.status)

  const { ids, error } = resolveCities(input.cities)
  if (error) return fail(error, 400)

  const only = input.only == null || input.only === "" ? null : String(input.only).trim().toLowerCase()
  if (only && !["amis", "pbs", "both"].includes(only)) {
    return fail("`only` must be one of: amis, pbs, both")
  }
  const includeAmis = !only || only === "amis" || only === "both"
  const includePbs = !only || only === "pbs" || only === "both"

  const concurrencyRaw = input.concurrency
  const concurrency = concurrencyRaw == null ? 4 : Number.parseInt(String(concurrencyRaw), 10)
  if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 8) {
    return fail("`concurrency` must be between 1 and 8")
  }

  const { amis, pbs, errors } = await refreshAllPrices({
    cityIds: ids,
    concurrency,
    // Leave headroom inside maxDuration so we always return a real summary
    // instead of being killed mid-sweep.
    budgetMs: 35_000,
    includeAmis,
    includePbs,
  })

  const amisOk = (amis?.markets ?? 0) > 0
  const pbsOk = (pbs?.rowsParsed ?? 0) > 0

  // Only a total failure is a 502. One source surviving still refreshed real
  // prices for real farmers, and the cache is served regardless.
  if (!amisOk && !pbsOk) {
    return fail("Neither AMIS nor the PBS SPI could be reached — cached prices are unchanged and still being served.", 502, {
      amisFailures: amis?.marketsFailed ?? [],
      pbsAttempts: pbs?.attempts ?? [],
      errors,
    })
  }

  const requested = ids?.length ?? DEFAULT_REFRESH_MARKETS.length
  const summary: string[] = []
  if (amisOk) summary.push(`${amis!.markets} of ${requested} AMIS mandis`)
  if (pbsOk) summary.push(`${pbs!.citiesCovered} PBS SPI cities (week ending ${pbs!.weekEnding})`)

  return ok({
    message: `Refreshed ${summary.join(" and ")}.`,
    sources: {
      amis: amis
        ? {
            ok: amisOk,
            tradingDate: amis.date,
            marketsRefreshed: amis.markets,
            marketsRequested: requested,
            rowsParsed: amis.rowsParsed,
            rowsUpserted: amis.rowsUpserted,
            // Fruit sold by count (100 Pcs / dozen) cannot be stored as a
            // per-quintal price, so it is parsed and reported but not cached.
            rowsSkippedNonWeight: amis.rowsSkippedNonWeight,
            failures: amis.marketsFailed,
            durationMs: amis.durationMs,
          }
        : null,
      pbs: pbs
        ? {
            ok: pbsOk,
            weekEnding: pbs.weekEnding,
            workbook: pbs.url,
            citiesCovered: pbs.citiesCovered,
            rowsParsed: pbs.rowsParsed,
            rowsUpserted: pbs.rowsUpserted,
            durationMs: pbs.durationMs,
          }
        : null,
    },
    errors,
  })
}

export const POST = handler(async (req: Request) => {
  const body = (await readJson(req)) as RefreshRequest
  const params = searchParams(req)
  return runRefresh(req, {
    cities: body.cities ?? params.get("cities") ?? undefined,
    concurrency: body.concurrency ?? params.get("concurrency") ?? undefined,
    only: body.only ?? params.get("only") ?? undefined,
  })
})

/** Vercel Cron only issues GET requests. */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  return runRefresh(req, {
    cities: params.get("cities") ?? undefined,
    concurrency: params.get("concurrency") ?? undefined,
    only: params.get("only") ?? undefined,
  })
})
