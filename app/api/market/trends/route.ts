import { fail, handler, ok, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import { getMarketTrends, type PriceQuery } from "@/lib/services/marketService"

export const dynamic = "force-dynamic"

/**
 * GET /api/market/trends
 *
 * Daily price history built from the stored `MarketPrice` documents — one point
 * per crop per trading day, averaged across the matching mandis.
 *
 * This reads the cache only; it never fetches. History accumulates from repeated
 * POST /api/market/refresh runs, so a cold database legitimately returns an
 * empty series rather than a fabricated curve.
 *
 * Query: crop, city, district (alias of city), province, days (default 30)
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)

  const daysRaw = params.get("days")
  const days = daysRaw ? Number.parseInt(daysRaw, 10) : 30
  if (!Number.isFinite(days) || days < 1) return fail("`days` must be a positive integer")

  const query: PriceQuery = {
    crop: params.get("crop") ?? undefined,
    city: params.get("city") ?? params.get("district") ?? undefined,
    province: params.get("province") ?? params.get("state") ?? undefined,
    days,
  }

  if (!query.city && !query.province) {
    const auth = await authenticate(req)
    if (auth.ok && auth.user?.district) query.city = auth.user.district
  }

  const result = await getMarketTrends(query)

  return ok({
    trends: result.series,
    source: result.source,
    currency: "PKR",
    unit: "quintal (100 kg)",
    days: result.days,
    coverage: result.coverage,
    filters: query,
    ...(result.notice ? { notice: result.notice } : {}),
  })
})
