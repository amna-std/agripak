/**
 * GET /api/weather/locations
 *
 * The Pakistani cities / district headquarters this service ships coordinates
 * for — all four provinces plus Islamabad, AJK and Gilgit-Baltistan. Static
 * geographic reference data, not a live measurement.
 *
 * Query params (all optional):
 *   province — filter by province name (e.g. `Sindh`, `Khyber Pakhtunkhwa`).
 *   q        — substring search over English and Urdu names.
 *
 * The `?city=` parameter on the other weather endpoints accepts any `slug`
 * or `name` returned here.
 */

import { ok, handler, searchParams } from "@/lib/api-helpers"
import {
  DEFAULT_LOCATION,
  PAKISTAN_LOCATIONS,
  PROVINCES,
  type PakistanLocation,
} from "@/lib/data/pakistan-locations"

export const dynamic = "force-dynamic"

export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const province = params.get("province")?.trim().toLowerCase()
  const q = params.get("q")?.trim().toLowerCase()

  let locations: PakistanLocation[] = PAKISTAN_LOCATIONS

  if (province) {
    locations = locations.filter(
      (l) => l.province.toLowerCase() === province || l.province.toLowerCase().includes(province),
    )
  }

  if (q) {
    locations = locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.slug.includes(q) ||
        l.nameUr.includes(params.get("q")!.trim()),
    )
  }

  const byProvince = PROVINCES.map((p) => ({
    province: p,
    count: PAKISTAN_LOCATIONS.filter((l) => l.province === p).length,
  }))

  return ok({
    count: locations.length,
    total: PAKISTAN_LOCATIONS.length,
    provinces: byProvince,
    // Documented fallback used when a request supplies no location at all.
    defaultLocation: { slug: DEFAULT_LOCATION.slug, name: DEFAULT_LOCATION.name, province: DEFAULT_LOCATION.province },
    data: locations,
  })
})
