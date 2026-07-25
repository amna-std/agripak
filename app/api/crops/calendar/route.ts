import { ok, handler, searchParams } from "@/lib/api-helpers"
import { normalizeProvince, type Province } from "../../auth/_lib/pakistan"
import {
  ADVISORY_NOTE,
  PAKISTAN_CROPS,
  currentSeason,
  windowsForProvince,
  type Crop,
  type CropWindow,
} from "../_data/pakistan-crops"
import { optionalUser } from "../_lib/select"

export const dynamic = "force-dynamic"

const MONTHS = [
  { month: 1, name: "January", nameUr: "جنوری" },
  { month: 2, name: "February", nameUr: "فروری" },
  { month: 3, name: "March", nameUr: "مارچ" },
  { month: 4, name: "April", nameUr: "اپریل" },
  { month: 5, name: "May", nameUr: "مئی" },
  { month: 6, name: "June", nameUr: "جون" },
  { month: 7, name: "July", nameUr: "جولائی" },
  { month: 8, name: "August", nameUr: "اگست" },
  { month: 9, name: "September", nameUr: "ستمبر" },
  { month: 10, name: "October", nameUr: "اکتوبر" },
  { month: 11, name: "November", nameUr: "نومبر" },
  { month: 12, name: "December", nameUr: "دسمبر" },
]

/** Field operations that actually matter in a Pakistani season. */
const SEASON_ACTIVITIES: Record<"rabi" | "kharif", string[]> = {
  rabi: [
    "Clear the Kharif crop and prepare a fine, level seedbed — laser levelling pays for itself in water saved",
    "Sow wheat in the 1–20 November window; every week of delay after mid-December costs grain",
    "Apply all phosphorus (DAP) at sowing and split the urea across the first two irrigations",
    "Sow chickpea, lentil and mustard on barani and light soils where wheat struggles",
    "Plant the autumn potato crop in October and the spring crop from mid-January",
    "Scout wheat for yellow rust from January and report early foci to Extension staff",
    "Watch mustard and wheat for aphid build-up during the still, cool weather of January",
    "Prune and manure mango and citrus orchards in December–January; band mango trunks against mealybug",
    "Keep the first wheat irrigation on time at crown root initiation — it sets the tiller count",
    "Book cold storage and arrange labour before the potato and wheat harvest rush",
  ],
  kharif: [
    "Check and repair the tubewell, watercourse and irrigation channels before the sowing rush",
    "Sow cotton by mid-May in Punjab (from mid-March in Sindh) — late cotton meets peak pink bollworm",
    "Raise the rice nursery from late May and transplant 25–35 day old seedlings",
    "Sow autumn maize between mid-July and 20 August; keep it on ridges so it never waterlogs",
    "Sow mung bean in July as a short catch crop that also fixes nitrogen",
    "Scout cotton twice a week for whitefly, jassid and pink bollworm and spray on thresholds, not on a calendar",
    "Watch maize whorls for fall armyworm from emergence",
    "Keep field drains open — monsoon waterlogging kills cotton and maize faster than drought",
    "Earth up and tie sugarcane before the monsoon winds to prevent lodging",
    "Harvest and de-sap mango carefully; hang fruit fly traps well before picking",
  ],
}

const SEASON_TIPS: Record<"rabi" | "kharif", string[]> = {
  rabi: [
    "Cold, foggy spells are the trigger for potato late blight — spray protectively before symptoms, not after",
    "Do not over-irrigate chickpea and lentil; extra water gives leaf, not pods",
    "Frost protection in northern districts: a light evening irrigation keeps soil warm overnight",
    "Get a soil test done between crops — it usually shows you are buying the wrong fertiliser",
  ],
  kharif: [
    "Monsoon humidity drives fungal and bacterial disease; keep the canopy open and drainage working",
    "Do not burn rice stubble — sow wheat straight into it with a happy seeder",
    "Broad-spectrum insecticide in cotton kills the predators and causes a worse whitefly outbreak later",
    "Store harvested grain only when it is properly dry; warm damp maize develops aflatoxin",
  ],
}

interface CalendarEntry {
  cropId: string
  name: string
  nameUr: string
  category: Crop["category"]
  season: Crop["season"]
  region: string
  regionUr: string
  sowing: CropWindow["sowing"]
  harvest: CropWindow["harvest"]
  note?: string
}

function entriesFor(province: Province | null): CalendarEntry[] {
  const entries: CalendarEntry[] = []
  for (const crop of PAKISTAN_CROPS) {
    if (province && !crop.provinces.includes(province)) continue
    for (const w of windowsForProvince(crop, province)) {
      entries.push({
        cropId: crop.id,
        name: crop.name,
        nameUr: crop.nameUr,
        category: crop.category,
        season: crop.season,
        region: w.region,
        regionUr: w.regionUr,
        sowing: w.sowing,
        harvest: w.harvest,
        note: w.note,
      })
    }
  }
  return entries
}

/**
 * GET /api/crops/calendar — the Pakistani Rabi/Kharif sowing and harvest calendar.
 *
 * Public. ?province= narrows the windows to one province (falls back to the
 * signed-in farmer's province); ?season=rabi|kharif|perennial filters;
 * ?month=1-12 overrides "this month".
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const user = await optionalUser(req)

  const province = normalizeProvince(params.get("province") ?? params.get("state")) ?? normalizeProvince(user?.state)
  const seasonFilter = params.get("season")?.trim().toLowerCase() || null

  const now = new Date()
  const requestedMonth = Math.trunc(Number(params.get("month")))
  const month = requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : now.getMonth() + 1
  const season = currentSeason(new Date(now.getFullYear(), month - 1, 1))

  let entries = entriesFor(province)
  if (seasonFilter && seasonFilter !== "all") entries = entries.filter((e) => e.season === seasonFilter)

  const byMonth = MONTHS.map((m) => ({
    ...m,
    season: currentSeason(new Date(now.getFullYear(), m.month - 1, 1)),
    sow: entries.filter((e) => e.sowing.months.includes(m.month)),
    harvest: entries.filter((e) => e.harvest.months.includes(m.month)),
  }))

  const seasons = (["rabi", "kharif", "perennial"] as const)
    .filter((id) => !seasonFilter || seasonFilter === "all" || seasonFilter === id)
    .map((id) => ({
      id,
      name: id === "rabi" ? "Rabi" : id === "kharif" ? "Kharif" : "Perennial / Orchard",
      nameUr: id === "rabi" ? "ربیع" : id === "kharif" ? "خریف" : "سدا بہار / باغات",
      window: id === "rabi" ? "November – April" : id === "kharif" ? "May – October" : "Year-round",
      crops: entries.filter((e) => e.season === id),
    }))

  const thisMonth = byMonth.find((m) => m.month === month)!

  return ok({
    data: {
      province: province ?? "All Pakistan",
      currentSeason: currentSeason(),
      season,
      month: { number: month, name: thisMonth.name, nameUr: thisMonth.nameUr },
      thisMonth: {
        sow: thisMonth.sow,
        harvest: thisMonth.harvest,
        activities: SEASON_ACTIVITIES[season],
        tips: SEASON_TIPS[season],
      },
      seasons,
      months: byMonth,
      activities: SEASON_ACTIVITIES,
      tips: SEASON_TIPS,
      advisory: ADVISORY_NOTE,
    },
  })
})
