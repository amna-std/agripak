import { ok, fail, handler, searchParams } from "@/lib/api-helpers"
import { loadSchemes } from "@/lib/services/schemesRefresh"
import {
  findSchemeIn,
  matchScheme,
  normalizeTenure,
  optionalUser,
  resolveProvince,
  toAcres,
  toSummary,
} from "../_lib/match"

export const dynamic = "force-dynamic"

/**
 * GET /api/schemes/[id] — one scheme in full.
 *
 * Public. When a farm profile is available (signed-in user, or ?province=,
 * ?landSize=, ?tenure= query params) the response also carries an eligibility
 * check for that farmer against this scheme.
 *
 * Reads the same merged list as the index route, so `sources` and
 * `lastVerified` shown on the detail page reflect the last refresh rather than
 * the day the curated file was written.
 */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const { schemes, source, refreshedAt } = await loadSchemes()
  const scheme = findSchemeIn(schemes, id)

  if (!scheme) {
    return fail(`Scheme "${id}" not found. Call GET /api/schemes for the full list.`, 404)
  }

  const params = searchParams(req)
  const user = await optionalUser(req)

  const province =
    resolveProvince(params.get("province") ?? params.get("state")).canonical ??
    resolveProvince(user?.state).canonical
  const landSizeAcres =
    toAcres(params.get("landSize"), params.get("landUnit") ?? "acres") ??
    toAcres(user?.landSize?.value, user?.landSize?.unit)
  const tenure = normalizeTenure(params.get("tenure"))

  const hasProfile = Boolean(province || landSizeAcres !== null || tenure)
  // Named `eligibilityCheck`, not `eligibility` — `scheme.eligibility` is the
  // human-readable criteria list and must survive the spread below.
  const eligibilityCheck = hasProfile
    ? matchScheme(scheme, {
        province,
        landSizeAcres,
        tenure,
        hasLandRecord: params.get("hasLandRecord") === null ? null : params.get("hasLandRecord") === "true",
        source: user ? "mixed" : "body",
      })
    : null

  const related = schemes
    .filter(
      (other) => other.id !== scheme.id && (other.category === scheme.category || other.province === scheme.province),
    )
    .slice(0, 4)
    .map(toSummary)

  return ok({
    data: {
      ...scheme,
      currency: "PKR",
      eligibilityCheck,
      relatedSchemes: related,
      // Additive; the detail page already renders `sources` and `lastVerified`
      // from the scheme itself.
      meta: { source, lastRefreshedAt: refreshedAt },
    },
  })
})
