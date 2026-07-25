/**
 * Filtering, scoring and shaping helpers for the /api/crops routes.
 *
 * `_lib` is a Next.js private folder — nothing here is routable.
 */

import { authenticate } from "@/lib/auth-helpers"
import { normalizeProvince, type Province } from "../../auth/_lib/pakistan"
import {
  ADVISORY_NOTE,
  PAKISTAN_AGRO_ZONES,
  PAKISTAN_CROPS,
  currentSeason,
  findZone,
  windowsForProvince,
  type Crop,
  type CropCategory,
  type CropSeason,
  type Level,
  type SoilType,
} from "../_data/pakistan-crops"

/* --------------------------------------------------------------------- auth */

/**
 * Crop guidance is public — a farmer should be able to read it before signing
 * in. When a valid token happens to be present we personalise with the saved
 * farm profile, but a missing token, a bad token or an unreachable database is
 * never an error here.
 */
export async function optionalUser(req: Request): Promise<any | null> {
  try {
    const auth = await authenticate(req)
    return auth.ok ? auth.user : null
  } catch {
    return null
  }
}

/* ---------------------------------------------------------------- profiles */

export interface FarmerProfile {
  province: Province | null
  district: string | null
  soilType: SoilType | null
  irrigationType: string | null
  landSizeAcres: number | null
  experienceYears: number | null
  /** Where each field came from, so the API can be honest about personalisation. */
  source: "profile" | "query" | "mixed" | "none"
}

const SOIL_TYPES: SoilType[] = ["clay", "sandy", "loamy", "black", "red", "alluvial", "laterite", "saline", "acidic"]

function asSoil(value: unknown): SoilType | null {
  if (typeof value !== "string") return null
  const key = value.trim().toLowerCase() as SoilType
  return SOIL_TYPES.includes(key) ? key : null
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Land size in acres, converting from hectares when the profile says so. */
function acres(value: unknown, unit?: unknown): number | null {
  const n = asNumber(value)
  if (n === null) return null
  return String(unit).toLowerCase() === "hectares" ? Number((n * 2.471).toFixed(2)) : n
}

/**
 * Builds the profile used for scoring. Query params always win over the saved
 * profile so a signed-in farmer can explore "what if I were in Sindh".
 */
export function buildProfile(params: URLSearchParams, user?: any): FarmerProfile {
  const fromQuery = {
    province: normalizeProvince(params.get("province") ?? params.get("state")),
    district: params.get("district")?.trim() || null,
    soilType: asSoil(params.get("soil") ?? params.get("soilType")),
    irrigationType: params.get("irrigation")?.trim().toLowerCase() || null,
    landSizeAcres: acres(params.get("landSize"), params.get("landUnit") ?? "acres"),
    experienceYears: asNumber(params.get("experience")),
  }

  const fromProfile = user
    ? {
        province: normalizeProvince(user.state),
        district: typeof user.district === "string" ? user.district : null,
        soilType: asSoil(user.soilType),
        irrigationType: typeof user.irrigationType === "string" ? user.irrigationType.toLowerCase() : null,
        landSizeAcres: acres(user.landSize?.value, user.landSize?.unit),
        experienceYears: asNumber(user.experience),
      }
    : null

  const merged = {
    province: fromQuery.province ?? fromProfile?.province ?? null,
    district: fromQuery.district ?? fromProfile?.district ?? null,
    soilType: fromQuery.soilType ?? fromProfile?.soilType ?? null,
    irrigationType: fromQuery.irrigationType ?? fromProfile?.irrigationType ?? null,
    landSizeAcres: fromQuery.landSizeAcres ?? fromProfile?.landSizeAcres ?? null,
    experienceYears: fromQuery.experienceYears ?? fromProfile?.experienceYears ?? null,
  }

  const usedQuery = Object.values(fromQuery).some((v) => v !== null)
  const usedProfile = fromProfile ? Object.values(fromProfile).some((v) => v !== null) : false
  const source: FarmerProfile["source"] =
    usedQuery && usedProfile ? "mixed" : usedQuery ? "query" : usedProfile ? "profile" : "none"

  return { ...merged, source }
}

/* ----------------------------------------------------------------- scoring */

const DEMAND_POINTS: Record<Level, number> = { low: 4, medium: 8, high: 12, "very-high": 15 }
const PROFIT_POINTS: Record<Level, number> = { low: 2, medium: 5, high: 8, "very-high": 10 }

/** Irrigation methods that can actually deliver water on demand. */
const ASSURED_IRRIGATION = new Set(["canal", "borewell", "drip", "sprinkler", "flood", "furrow"])

function experienceLevel(years: number | null): "beginner" | "intermediate" | "experienced" {
  if (years === null || years < 5) return "beginner"
  if (years < 15) return "intermediate"
  return "experienced"
}

export interface CropScore {
  score: number
  reasons: string[]
  warnings: string[]
  risk: { level: "low" | "medium" | "high"; score: number; factors: string[] }
}

export function scoreCrop(crop: Crop, profile: FarmerProfile): CropScore {
  let score = 0
  const reasons: string[] = []
  const warnings: string[] = []

  // Region — 30 points, plus 10 for a district that sits inside a matching zone.
  if (profile.province && crop.provinces.includes(profile.province)) {
    score += 30
    reasons.push(`Commonly grown in ${profile.province}`)
  } else if (profile.province) {
    warnings.push(`Not a mainstream crop for ${profile.province}`)
  } else {
    score += 15 // no province known: don't punish the crop, just don't credit it
  }

  if (profile.district) {
    const district = profile.district.toLowerCase()
    const zone = PAKISTAN_AGRO_ZONES.find(
      (z) => z.mainCrops.includes(crop.id) && z.districts.some((d) => d.toLowerCase().includes(district)),
    )
    if (zone) {
      score += 10
      reasons.push(`${profile.district} sits in the ${zone.name}, a main tract for this crop`)
    }
  }

  // Soil — 25 points.
  if (profile.soilType && crop.soils.includes(profile.soilType)) {
    score += 25
    reasons.push(`Suits your ${profile.soilType} soil`)
  } else if (profile.soilType) {
    warnings.push(`${crop.name} prefers ${crop.soils.join(", ")} soil rather than ${profile.soilType}`)
  } else {
    score += 12
  }

  // Water availability — 15 points.
  const need = crop.water.requirement
  const thirsty = need === "high" || need === "very-high"
  const assured = profile.irrigationType ? ASSURED_IRRIGATION.has(profile.irrigationType) : null
  if (assured === true) {
    score += 15
    if (thirsty) reasons.push("Your irrigation can support a high-water crop")
  } else if (assured === false) {
    // Rainfed (barani): only genuinely low-water crops are a comfortable fit.
    if (need === "low") {
      score += 15
      reasons.push("Low water requirement suits rainfed (barani) farming")
    } else if (need === "medium") {
      score += 6
      warnings.push(
        `Needs ${crop.water.irrigations.min}–${crop.water.irrigations.max} irrigations — hard to manage on rainfed (barani) land`,
      )
    } else {
      warnings.push("High water requirement — not realistic on rainfed (barani) land without assured water")
    }
  } else {
    score += 8
  }

  // Market pull and margin — 25 points.
  score += DEMAND_POINTS[crop.marketDemand]
  score += PROFIT_POINTS[crop.profitability]
  if (crop.marketDemand === "very-high") reasons.push("Very strong market demand")
  if (crop.profitability === "high" || crop.profitability === "very-high") reasons.push("Good margin potential")

  // Experience vs difficulty — 10 points.
  const level = experienceLevel(profile.experienceYears)
  if (crop.riskFactor === "low" || level === "experienced") {
    score += 10
  } else if (level === "intermediate" && crop.riskFactor === "medium") {
    score += 7
  } else if (level === "beginner" && crop.riskFactor === "high") {
    warnings.push("Demanding crop — start on a small plot if this is new to you")
  } else {
    score += 4
  }

  // Risk assessment, reported separately from the score.
  const factors: string[] = []
  let riskScore = 0
  if (crop.riskFactor === "high") {
    riskScore += 25
    factors.push("Crop is inherently high risk (pest pressure or price volatility)")
  } else if (crop.riskFactor === "medium") {
    riskScore += 12
  }
  if (assured === false) {
    if (thirsty) {
      riskScore += 25
      factors.push("High water demand without assured irrigation")
    } else if (need === "medium") {
      riskScore += 12
      factors.push("Moderate water demand without assured irrigation")
    }
  }
  if (crop.economics.costLevel === "high" || crop.economics.costLevel === "very-high") {
    riskScore += 15
    factors.push("High input cost per acre")
  }
  if (level === "beginner" && crop.riskFactor === "high") {
    riskScore += 15
    factors.push("Steep learning curve for a new grower")
  }
  if (crop.season === "perennial") {
    riskScore += 10
    factors.push("Orchard crop — several years before the first real harvest")
  }
  if (profile.landSizeAcres !== null && profile.landSizeAcres < 2 && crop.season === "perennial") {
    riskScore += 10
    factors.push("Small holding tied up for years by a perennial planting")
  }

  const riskLevel = riskScore > 40 ? "high" : riskScore > 20 ? "medium" : "low"

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    warnings,
    risk: { level: riskLevel, score: riskScore, factors },
  }
}

/** Advice that depends on the farmer rather than the crop. */
export function personalAdvice(crop: Crop, profile: FarmerProfile): string[] {
  const advice: string[] = []
  const level = experienceLevel(profile.experienceYears)

  if (profile.province) {
    const windows = windowsForProvince(crop, profile.province)
    const w = windows[0]
    if (w) advice.push(`In ${w.region}, sow ${w.sowing.from} – ${w.sowing.to} and harvest ${w.harvest.from} – ${w.harvest.to}.`)
  }
  if (profile.soilType && !crop.soils.includes(profile.soilType)) {
    advice.push(`Your ${profile.soilType} soil is not ideal — ${crop.soilNote.charAt(0).toLowerCase()}${crop.soilNote.slice(1)}`)
  }
  if (profile.irrigationType === "rainfed" && (crop.water.requirement === "high" || crop.water.requirement === "very-high")) {
    advice.push("Arrange assured water before committing acreage, or pick a low-water crop instead.")
  }
  if (profile.landSizeAcres !== null && profile.landSizeAcres <= 2.5) {
    advice.push("On a small holding, high-value crops and intensive management give a better return than extra area.")
  }
  if (level === "beginner") {
    advice.push("Trial this on part of your land first, and register with your district Agriculture Extension office for free guidance.")
  }
  advice.push(ADVISORY_NOTE)
  return advice
}

/* ---------------------------------------------------------------- shaping */

/** Light-weight crop object for list endpoints. */
export function toSummary(crop: Crop) {
  return {
    id: crop.id,
    name: crop.name,
    nameUr: crop.nameUr,
    otherNames: crop.otherNames,
    category: crop.category,
    season: crop.season,
    summary: crop.summary,
    summaryUr: crop.summaryUr,
    durationDays: crop.durationDays,
    provinces: crop.provinces,
    zones: crop.zones,
    soils: crop.soils,
    waterRequirement: crop.water.requirement,
    expectedYield: crop.expectedYield,
    marketDemand: crop.marketDemand,
    profitability: crop.profitability,
    riskFactor: crop.riskFactor,
    sowing: crop.windows[0]?.sowing ?? null,
    harvest: crop.windows[0]?.harvest ?? null,
  }
}

export function toDetail(crop: Crop) {
  return {
    ...crop,
    waterRequirement: crop.water.requirement,
    zoneDetails: crop.zones.map((id) => findZone(id)).filter(Boolean),
    advisory: ADVISORY_NOTE,
  }
}

/* --------------------------------------------------------------- filtering */

export interface CropFilters {
  season?: CropSeason | null
  category?: CropCategory | null
  province?: Province | null
  zone?: string | null
  search?: string | null
  soil?: SoilType | null
}

export function readFilters(params: URLSearchParams): CropFilters {
  const season = params.get("season")?.trim().toLowerCase()
  const category = params.get("category")?.trim().toLowerCase()
  return {
    season: season && season !== "all" ? (season as CropSeason) : null,
    category: category && category !== "all" ? (category as CropCategory) : null,
    province: normalizeProvince(params.get("province") ?? params.get("state")),
    zone: params.get("zone")?.trim() || null,
    search: params.get("search")?.trim() || params.get("q")?.trim() || null,
    soil: asSoil(params.get("soil") ?? params.get("soilType")),
  }
}

export function applyFilters(crops: Crop[], filters: CropFilters): Crop[] {
  let list = crops

  if (filters.season) list = list.filter((c) => c.season === filters.season)
  if (filters.category) list = list.filter((c) => c.category === filters.category)
  if (filters.province) list = list.filter((c) => c.provinces.includes(filters.province!))
  if (filters.zone) list = list.filter((c) => c.zones.includes(filters.zone!))
  if (filters.soil) list = list.filter((c) => c.soils.includes(filters.soil!))

  if (filters.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.nameUr.includes(filters.search!) ||
        c.id.includes(q) ||
        c.otherNames.some((alias) => alias.toLowerCase().includes(q)) ||
        c.summary.toLowerCase().includes(q),
    )
  }

  return list
}

export function paginate<T>(items: T[], params: URLSearchParams, defaultLimit = 20) {
  const page = Math.max(1, Math.trunc(Number(params.get("page")) || 1))
  const rawLimit = Math.trunc(Number(params.get("limit")) || defaultLimit)
  const limit = Math.min(Math.max(rawLimit, 1), 100)
  const start = (page - 1) * limit
  return {
    slice: items.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / limit)),
    },
  }
}

/** Filter options the UI can render without hardcoding any values. */
export function filterOptions() {
  return {
    seasons: [
      { id: "rabi", name: "Rabi", nameUr: "ربیع", window: "November – April" },
      { id: "kharif", name: "Kharif", nameUr: "خریف", window: "May – October" },
      { id: "perennial", name: "Perennial / Orchard", nameUr: "سدا بہار", window: "Year-round" },
    ],
    categories: Array.from(new Set(PAKISTAN_CROPS.map((c) => c.category))),
    provinces: Array.from(new Set(PAKISTAN_CROPS.flatMap((c) => c.provinces))),
    zones: PAKISTAN_AGRO_ZONES.map((z) => ({ id: z.id, name: z.name, nameUr: z.nameUr, provinces: z.provinces })),
    currentSeason: currentSeason(),
  }
}
