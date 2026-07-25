import { fail, handler, ok, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import { getMarketPrices, type PriceQuery } from "@/lib/services/marketService"

export const dynamic = "force-dynamic"

/**
 * GET /api/market/prices
 *
 * Current Pakistani market prices (PKR per 100 kg / quintal), cache-first with a
 * live fetch as backfill.
 *
 * Two sources feed this, and each row says which one it came from:
 *   - `amis` — AMIS Punjab wholesale mandi rates (`priceType: "wholesale"`)
 *   - `pbs`  — PBS weekly SPI retail prices for 17 cities nationwide
 *              (`priceType: "retail"`)
 *
 * Query: crop, city, district (alias of city), province, days, limit, sortBy
 *
 * Auth is optional. Signed-in farmers with no explicit filter get their own
 * district first; anonymous callers get a nationwide view. We never silently
 * default to a single city.
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)

  const limitRaw = params.get("limit")
  const daysRaw = params.get("days")
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined
  const days = daysRaw ? Number.parseInt(daysRaw, 10) : undefined

  if (limitRaw && (!Number.isFinite(limit!) || limit! < 1)) return fail("`limit` must be a positive integer")
  if (daysRaw && (!Number.isFinite(days!) || days! < 1)) return fail("`days` must be a positive integer")

  const sortBy = (params.get("sortBy") ?? "date") as PriceQuery["sortBy"]
  if (sortBy && !["date", "price", "crop"].includes(sortBy)) {
    return fail("`sortBy` must be one of: date, price, crop")
  }

  const query: PriceQuery = {
    crop: params.get("crop") ?? undefined,
    city: params.get("city") ?? params.get("district") ?? undefined,
    province: params.get("province") ?? params.get("state") ?? undefined,
    days,
    limit,
    sortBy,
  }

  // Personalise only when the caller gave no location of their own. The service
  // widens back out to nationwide if the district has no published prices.
  if (!query.city && !query.province) {
    const auth = await authenticate(req)
    if (auth.ok && auth.user?.district) query.city = auth.user.district
  }

  const result = await getMarketPrices(query)

  return ok({
    prices: result.prices,
    source: result.source,
    currency: "PKR",
    unit: "quintal (100 kg)",
    lastUpdated: result.lastUpdated,
    totalRecords: result.prices.length,
    coverage: result.coverage,
    filters: query,
    ...(result.notice ? { notice: result.notice } : {}),
  })
})
