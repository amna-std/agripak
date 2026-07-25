import { ok, fail, handler, searchParams } from "@/lib/api-helpers"
import { PAKISTAN_CROPS, findCrop, windowsForProvince } from "../_data/pakistan-crops"
import { buildProfile, optionalUser, personalAdvice, scoreCrop, toDetail, toSummary } from "../_lib/select"

export const dynamic = "force-dynamic"

/**
 * GET /api/crops/[cropId] — full growing guidance for one crop.
 *
 * Public. `cropId` accepts the id (`rice-basmati`), the English name or a
 * local alias (`chana`, `phutti`). When a farm profile is available the
 * response gains a `personalised` block with the suitability score, the
 * sowing window for that province, and advice specific to that farm.
 */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ cropId: string }> }) => {
  const { cropId } = await ctx.params
  const crop = findCrop(cropId)

  if (!crop) {
    return fail(`Crop "${cropId}" not found. Call GET /api/crops for the full catalogue.`, 404)
  }

  const params = searchParams(req)
  const user = await optionalUser(req)
  const profile = buildProfile(params, user)

  const scored = scoreCrop(crop, profile)

  // Same season, same province, different crop — useful "what else could I sow".
  const related = PAKISTAN_CROPS.filter(
    (other) =>
      other.id !== crop.id &&
      other.season === crop.season &&
      (profile.province ? other.provinces.includes(profile.province) : other.zones.some((z) => crop.zones.includes(z))),
  )
    .slice(0, 6)
    .map(toSummary)

  return ok({
    data: {
      ...toDetail(crop),
      windowsForYou: windowsForProvince(crop, profile.province),
      personalised: profile.source !== "none",
      recommendationScore: scored.score,
      suitabilityReasons: scored.reasons,
      warnings: scored.warnings,
      riskAssessment: scored.risk,
      advice: personalAdvice(crop, profile),
      profile: {
        province: profile.province,
        district: profile.district,
        soilType: profile.soilType,
        irrigationType: profile.irrigationType,
        landSizeAcres: profile.landSizeAcres,
        source: profile.source,
      },
      relatedCrops: related,
    },
  })
})
