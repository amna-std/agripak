import { ok, handler, searchParams } from "@/lib/api-helpers"
import { ADVISORY_NOTE, PAKISTAN_CROPS, currentSeason, windowsForProvince } from "../_data/pakistan-crops"
import {
  applyFilters,
  buildProfile,
  optionalUser,
  personalAdvice,
  readFilters,
  scoreCrop,
  toSummary,
} from "../_lib/select"

export const dynamic = "force-dynamic"

/**
 * GET /api/crops/recommendations — crops ranked for one farmer.
 *
 * Personalised from the signed-in farm profile (province, district, soil,
 * irrigation, land size, experience). Every field can be overridden with a
 * query param so the page also works for a visitor who has not signed in, or
 * for a farmer exploring a different district.
 *
 * ?season= defaults to the season we are actually in (Rabi Nov–Apr,
 * Kharif May–Oct). Pass ?season=all to rank the whole catalogue.
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const user = await optionalUser(req)
  const profile = buildProfile(params, user)

  const requested = params.get("season")?.trim().toLowerCase()
  const season = requested === "all" ? null : requested || currentSeason()

  // Perennials belong in every seasonal list — you plant an orchard year-round.
  const filters = readFilters(params)
  const inSeason = (crop: (typeof PAKISTAN_CROPS)[number]) =>
    !season || crop.season === season || crop.season === "perennial"

  let pool = applyFilters(PAKISTAN_CROPS, { ...filters, season: null }).filter(inSeason)

  /**
   * Thinly covered territories (ICT, AJK, Gilgit-Baltistan) can have no crop at
   * all in the catalogue for one season. Returning an empty list would render a
   * blank page, so widen to the national list for that season and say plainly
   * that these are not province-specific. Never show nothing.
   */
  let coverageNote: string | null = null
  if (pool.length === 0 && filters.province) {
    pool = applyFilters(PAKISTAN_CROPS, { ...filters, season: null, province: null }).filter(inSeason)
    coverageNote = `The catalogue has no ${season ?? "matching"} crop recorded specifically for ${filters.province}. These are the national rankings for the season — confirm the sowing window with your district Agriculture Extension office before you sow.`
  }

  const limit = Math.min(Math.max(Math.trunc(Number(params.get("limit")) || 10), 1), 50)

  const ranked = pool
    .map((crop) => {
      const scored = scoreCrop(crop, profile)
      return {
        ...toSummary(crop),
        recommendationScore: scored.score,
        suitabilityReasons: scored.reasons,
        warnings: scored.warnings,
        riskAssessment: scored.risk,
        windows: windowsForProvince(crop, profile.province),
        advice: personalAdvice(crop, profile),
      }
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, limit)

  return ok({
    data: {
      recommendations: ranked,
      season: season ?? "all",
      currentSeason: currentSeason(),
      personalised: profile.source !== "none",
      /** Set when the province had no crop of its own and we widened to the national list. */
      coverageNote,
      profile: {
        province: profile.province,
        district: profile.district,
        soilType: profile.soilType,
        irrigationType: profile.irrigationType,
        landSizeAcres: profile.landSizeAcres,
        experienceYears: profile.experienceYears,
        source: profile.source,
      },
      note:
        profile.source === "none"
          ? "No farm profile found. These are general rankings for the season — sign in or pass ?province=&soil=&irrigation= for advice tailored to your farm."
          : "Ranked against your saved farm profile. Scores are a planning aid, not a guarantee.",
      advisory: ADVISORY_NOTE,
    },
  })
})
