import { ok, fail, handler, readJson } from "@/lib/api-helpers"
import { COVERAGE_NOTE, type Scheme } from "@/lib/data/pakistan-schemes"
import { loadSchemes } from "@/lib/services/schemesRefresh"
import {
  findSchemeIn,
  matchScheme,
  normalizeTenure,
  optionalUser,
  resolveProvince,
  toAcres,
  type Applicant,
  type SchemeMatch,
} from "../_lib/match"

export const dynamic = "force-dynamic"

/**
 * POST /api/schemes/check-eligibility — match a farmer against the schemes.
 *
 * Public; a token only pre-fills missing fields from the saved farm profile.
 *
 * Body (every field optional — anything missing is reported back as an
 * "unknown" rather than silently assumed):
 * ```json
 * {
 *   "province": "Punjab",          // or "state"; accepts "KPK", "Sindh", ...
 *   "landSize": 6,                 // number
 *   "landUnit": "acres",           // acres | hectares | kanal | marla
 *   "tenure": "owner",             // owner | owner-cum-tenant | tenant | sharecropper | landless
 *   "hasLandRecord": true,
 *   "schemeId": "cm-punjab-kissan-card"   // or "schemeIds": [...] to narrow the check
 * }
 * ```
 */
export const POST = handler(async (req: Request) => {
  const body = await readJson(req)
  const user = await optionalUser(req)
  // Match against the refreshed list so a farmer is never told to apply to a
  // round the refresh has already learnt is closed.
  const { schemes: allSchemes } = await loadSchemes()

  const bodyProvince = resolveProvince(body.province ?? body.state).canonical
  const profileProvince = resolveProvince(user?.state).canonical
  const bodyLand = toAcres(body.landSize ?? body.landSizeAcres, body.landUnit ?? "acres")
  const profileLand = toAcres(user?.landSize?.value, user?.landSize?.unit)
  const tenure = normalizeTenure(body.tenure)

  const usedBody = bodyProvince !== null || bodyLand !== null || tenure !== null
  const usedProfile = profileProvince !== null || profileLand !== null

  const applicant: Applicant = {
    province: bodyProvince ?? profileProvince,
    landSizeAcres: bodyLand ?? profileLand,
    tenure,
    hasLandRecord: typeof body.hasLandRecord === "boolean" ? body.hasLandRecord : null,
    source: usedBody && usedProfile ? "mixed" : usedBody ? "body" : usedProfile ? "profile" : "none",
  }

  if (applicant.source === "none") {
    return fail(
      "Send at least one of province, landSize or tenure — or sign in so your saved farm profile can be used.",
      400,
    )
  }

  // Optionally narrow the check to specific schemes.
  const requestedIds: string[] = Array.isArray(body.schemeIds)
    ? body.schemeIds.filter((v: unknown) => typeof v === "string")
    : typeof body.schemeId === "string"
      ? [body.schemeId]
      : []

  let pool: Scheme[] = allSchemes
  if (requestedIds.length) {
    const resolved = requestedIds.map((id) => findSchemeIn(allSchemes, id))
    const missing = requestedIds.filter((_, i) => resolved[i] === null)
    if (missing.length) return fail(`Unknown scheme id(s): ${missing.join(", ")}`, 404)
    pool = resolved as Scheme[]
  }

  const results = pool
    .map((scheme) => matchScheme(scheme, applicant))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
      // A scheme whose round has closed must never outrank one the farmer can
      // actually apply for today, however big its headline figure.
      const open = (s: SchemeMatch) => (s.status === "active" ? 0 : 1)
      if (open(a) !== open(b)) return open(a) - open(b)
      if (a.score !== b.score) return b.score - a.score
      return (b.benefitAmount ?? 0) - (a.benefitAmount ?? 0)
    })

  const eligible = results.filter((r) => r.eligible)
  const openNow = eligible.filter((r) => r.status === "active")

  return ok({
    data: {
      applicant: {
        province: applicant.province,
        landSizeAcres: applicant.landSizeAcres,
        tenure: applicant.tenure,
        hasLandRecord: applicant.hasLandRecord,
        source: applicant.source,
      },
      summary: {
        checked: results.length,
        eligible: eligible.length,
        openForApplicationNow: openNow.length,
        notEligible: results.length - eligible.length,
      },
      eligibleSchemes: eligible,
      otherSchemes: results.filter((r) => !r.eligible),
      results,
      currency: "PKR",
      disclaimer:
        "This is an indicative check against published scheme rules, not an approval. The issuing department verifies your CNIC, revenue record and credit history before any scheme is granted.",
      coverageNote: COVERAGE_NOTE,
    },
  })
})
