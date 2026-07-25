/**
 * Pakistani cities / district headquarters with accurate coordinates.
 *
 * Used by the weather API to resolve `?city=` into coordinates and to power the
 * location picker. Coverage is nationwide: Punjab, Sindh, Khyber Pakhtunkhwa,
 * Balochistan, Islamabad Capital Territory, Azad Jammu & Kashmir and
 * Gilgit-Baltistan.
 *
 * These are static geographic facts (names + lat/lon), NOT live data — nothing
 * here is ever presented as a measurement.
 */

export type Province =
  | "Punjab"
  | "Sindh"
  | "Khyber Pakhtunkhwa"
  | "Balochistan"
  | "Islamabad Capital Territory"
  | "Azad Jammu & Kashmir"
  | "Gilgit-Baltistan"

export interface PakistanLocation {
  /** Lowercase, hyphenated, unique. Used as the `?city=` lookup key. */
  slug: string
  name: string
  nameUr: string
  province: Province
  provinceUr: string
  lat: number
  lon: number
  /** Broad agro-ecological zone — used to tailor farming advisories. */
  agroZone: AgroZone
}

export type AgroZone =
  | "rice-wheat"
  | "mixed-cropping"
  | "cotton-wheat"
  | "low-intensity-arid"
  | "barani-rainfed"
  | "northern-irrigated-hills"
  | "coastal-arid"
  | "highland-dry"

export const PROVINCE_URDU: Record<Province, string> = {
  Punjab: "پنجاب",
  Sindh: "سندھ",
  "Khyber Pakhtunkhwa": "خیبر پختونخوا",
  Balochistan: "بلوچستان",
  "Islamabad Capital Territory": "اسلام آباد",
  "Azad Jammu & Kashmir": "آزاد جموں و کشمیر",
  "Gilgit-Baltistan": "گلگت بلتستان",
}

interface RawLocation {
  name: string
  nameUr: string
  province: Province
  lat: number
  lon: number
  agroZone: AgroZone
  slug?: string
}

const RAW: RawLocation[] = [
  // ---------- Punjab ----------
  { name: "Lahore", nameUr: "لاہور", province: "Punjab", lat: 31.5497, lon: 74.3436, agroZone: "rice-wheat" },
  { name: "Faisalabad", nameUr: "فیصل آباد", province: "Punjab", lat: 31.4187, lon: 73.0791, agroZone: "mixed-cropping" },
  { name: "Multan", nameUr: "ملتان", province: "Punjab", lat: 30.1575, lon: 71.5249, agroZone: "cotton-wheat" },
  { name: "Rawalpindi", nameUr: "راولپنڈی", province: "Punjab", lat: 33.5651, lon: 73.0169, agroZone: "barani-rainfed" },
  { name: "Gujranwala", nameUr: "گوجرانوالہ", province: "Punjab", lat: 32.1877, lon: 74.1945, agroZone: "rice-wheat" },
  { name: "Sialkot", nameUr: "سیالکوٹ", province: "Punjab", lat: 32.4945, lon: 74.5229, agroZone: "rice-wheat" },
  { name: "Bahawalpur", nameUr: "بہاولپور", province: "Punjab", lat: 29.3956, lon: 71.6836, agroZone: "cotton-wheat" },
  { name: "Sargodha", nameUr: "سرگودھا", province: "Punjab", lat: 32.0836, lon: 72.6711, agroZone: "mixed-cropping" },
  { name: "Sahiwal", nameUr: "ساہیوال", province: "Punjab", lat: 30.6682, lon: 73.1114, agroZone: "cotton-wheat" },
  { name: "Okara", nameUr: "اوکاڑہ", province: "Punjab", lat: 30.8081, lon: 73.4534, agroZone: "mixed-cropping" },
  { name: "Rahim Yar Khan", nameUr: "رحیم یار خان", province: "Punjab", lat: 28.4202, lon: 70.2952, agroZone: "cotton-wheat" },
  { name: "Dera Ghazi Khan", nameUr: "ڈیرہ غازی خان", province: "Punjab", lat: 30.0489, lon: 70.6455, agroZone: "cotton-wheat" },
  { name: "Sheikhupura", nameUr: "شیخوپورہ", province: "Punjab", lat: 31.7131, lon: 73.9783, agroZone: "rice-wheat" },
  { name: "Kasur", nameUr: "قصور", province: "Punjab", lat: 31.1187, lon: 74.4506, agroZone: "rice-wheat" },
  { name: "Jhang", nameUr: "جھنگ", province: "Punjab", lat: 31.2781, lon: 72.3317, agroZone: "mixed-cropping" },
  { name: "Khanewal", nameUr: "خانیوال", province: "Punjab", lat: 30.3017, lon: 71.9321, agroZone: "cotton-wheat" },
  { name: "Vehari", nameUr: "وہاڑی", province: "Punjab", lat: 30.0453, lon: 72.3489, agroZone: "cotton-wheat" },
  { name: "Muzaffargarh", nameUr: "مظفرگڑھ", province: "Punjab", lat: 30.0736, lon: 71.1805, agroZone: "cotton-wheat" },
  { name: "Mianwali", nameUr: "میانوالی", province: "Punjab", lat: 32.5839, lon: 71.537, agroZone: "barani-rainfed" },
  { name: "Attock", nameUr: "اٹک", province: "Punjab", lat: 33.766, lon: 72.3609, agroZone: "barani-rainfed" },
  { name: "Chiniot", nameUr: "چنیوٹ", province: "Punjab", lat: 31.7167, lon: 72.9781, agroZone: "mixed-cropping" },
  { name: "Bahawalnagar", nameUr: "بہاولنگر", province: "Punjab", lat: 29.9989, lon: 73.2536, agroZone: "cotton-wheat" },

  // ---------- Sindh ----------
  { name: "Karachi", nameUr: "کراچی", province: "Sindh", lat: 24.8607, lon: 67.0011, agroZone: "coastal-arid" },
  { name: "Hyderabad", nameUr: "حیدرآباد", province: "Sindh", lat: 25.396, lon: 68.3578, agroZone: "cotton-wheat" },
  { name: "Sukkur", nameUr: "سکھر", province: "Sindh", lat: 27.7052, lon: 68.8574, agroZone: "rice-wheat" },
  { name: "Larkana", nameUr: "لاڑکانہ", province: "Sindh", lat: 27.559, lon: 68.212, agroZone: "rice-wheat" },
  { name: "Nawabshah", nameUr: "نواب شاہ", province: "Sindh", lat: 26.2442, lon: 68.41, agroZone: "cotton-wheat" },
  { name: "Mirpurkhas", nameUr: "میرپور خاص", province: "Sindh", lat: 25.5276, lon: 69.0126, agroZone: "cotton-wheat" },
  { name: "Sanghar", nameUr: "سانگھڑ", province: "Sindh", lat: 26.0464, lon: 68.9481, agroZone: "cotton-wheat" },
  { name: "Thatta", nameUr: "ٹھٹھہ", province: "Sindh", lat: 24.7461, lon: 67.9236, agroZone: "coastal-arid" },
  { name: "Badin", nameUr: "بدین", province: "Sindh", lat: 24.6558, lon: 68.837, agroZone: "coastal-arid" },
  { name: "Dadu", nameUr: "دادو", province: "Sindh", lat: 26.7319, lon: 67.777, agroZone: "rice-wheat" },
  { name: "Jacobabad", nameUr: "جیکب آباد", province: "Sindh", lat: 28.2769, lon: 68.4514, agroZone: "rice-wheat" },
  { name: "Ghotki", nameUr: "گھوٹکی", province: "Sindh", lat: 28.0043, lon: 69.3157, agroZone: "cotton-wheat" },
  { name: "Mithi", nameUr: "مٹھی", province: "Sindh", lat: 24.7398, lon: 69.7965, agroZone: "low-intensity-arid" },

  // ---------- Khyber Pakhtunkhwa ----------
  { name: "Peshawar", nameUr: "پشاور", province: "Khyber Pakhtunkhwa", lat: 34.0151, lon: 71.5249, agroZone: "northern-irrigated-hills" },
  { name: "Mardan", nameUr: "مردان", province: "Khyber Pakhtunkhwa", lat: 34.1989, lon: 72.0231, agroZone: "northern-irrigated-hills" },
  { name: "Abbottabad", nameUr: "ایبٹ آباد", province: "Khyber Pakhtunkhwa", lat: 34.1688, lon: 73.2215, agroZone: "northern-irrigated-hills" },
  { name: "Mingora", nameUr: "مینگورہ", province: "Khyber Pakhtunkhwa", lat: 34.7795, lon: 72.3614, agroZone: "northern-irrigated-hills", slug: "mingora-swat" },
  { name: "Dera Ismail Khan", nameUr: "ڈیرہ اسماعیل خان", province: "Khyber Pakhtunkhwa", lat: 31.8313, lon: 70.9017, agroZone: "low-intensity-arid" },
  { name: "Kohat", nameUr: "کوہاٹ", province: "Khyber Pakhtunkhwa", lat: 33.5869, lon: 71.4414, agroZone: "barani-rainfed" },
  { name: "Bannu", nameUr: "بنوں", province: "Khyber Pakhtunkhwa", lat: 32.9889, lon: 70.6056, agroZone: "low-intensity-arid" },
  { name: "Swabi", nameUr: "صوابی", province: "Khyber Pakhtunkhwa", lat: 34.1203, lon: 72.4696, agroZone: "northern-irrigated-hills" },
  { name: "Charsadda", nameUr: "چارسدہ", province: "Khyber Pakhtunkhwa", lat: 34.1453, lon: 71.7308, agroZone: "northern-irrigated-hills" },
  { name: "Nowshera", nameUr: "نوشہرہ", province: "Khyber Pakhtunkhwa", lat: 34.0153, lon: 71.9747, agroZone: "northern-irrigated-hills" },
  { name: "Chitral", nameUr: "چترال", province: "Khyber Pakhtunkhwa", lat: 35.8518, lon: 71.7864, agroZone: "highland-dry" },

  // ---------- Balochistan ----------
  { name: "Quetta", nameUr: "کوئٹہ", province: "Balochistan", lat: 30.1798, lon: 66.975, agroZone: "highland-dry" },
  { name: "Gwadar", nameUr: "گوادر", province: "Balochistan", lat: 25.1264, lon: 62.3225, agroZone: "coastal-arid" },
  { name: "Turbat", nameUr: "تربت", province: "Balochistan", lat: 26.0031, lon: 63.0544, agroZone: "low-intensity-arid" },
  { name: "Khuzdar", nameUr: "خضدار", province: "Balochistan", lat: 27.812, lon: 66.61, agroZone: "highland-dry" },
  { name: "Sibi", nameUr: "سبی", province: "Balochistan", lat: 29.543, lon: 67.8773, agroZone: "low-intensity-arid" },
  { name: "Zhob", nameUr: "ژوب", province: "Balochistan", lat: 31.3411, lon: 69.4488, agroZone: "highland-dry" },
  { name: "Loralai", nameUr: "لورالائی", province: "Balochistan", lat: 30.3705, lon: 68.5972, agroZone: "highland-dry" },
  { name: "Chaman", nameUr: "چمن", province: "Balochistan", lat: 30.9209, lon: 66.4597, agroZone: "highland-dry" },
  { name: "Uthal", nameUr: "اوتھل", province: "Balochistan", lat: 25.8072, lon: 66.622, agroZone: "coastal-arid" },

  // ---------- Islamabad Capital Territory ----------
  { name: "Islamabad", nameUr: "اسلام آباد", province: "Islamabad Capital Territory", lat: 33.6844, lon: 73.0479, agroZone: "barani-rainfed" },

  // ---------- Azad Jammu & Kashmir ----------
  { name: "Muzaffarabad", nameUr: "مظفرآباد", province: "Azad Jammu & Kashmir", lat: 34.37, lon: 73.4711, agroZone: "northern-irrigated-hills" },
  { name: "Mirpur", nameUr: "میرپور", province: "Azad Jammu & Kashmir", lat: 33.1478, lon: 73.7519, agroZone: "barani-rainfed", slug: "mirpur-ajk" },
  { name: "Rawalakot", nameUr: "راولاکوٹ", province: "Azad Jammu & Kashmir", lat: 33.8578, lon: 73.7601, agroZone: "northern-irrigated-hills" },

  // ---------- Gilgit-Baltistan ----------
  { name: "Gilgit", nameUr: "گلگت", province: "Gilgit-Baltistan", lat: 35.9208, lon: 74.3144, agroZone: "highland-dry" },
  { name: "Skardu", nameUr: "سکردو", province: "Gilgit-Baltistan", lat: 35.2971, lon: 75.6333, agroZone: "highland-dry" },
  { name: "Hunza", nameUr: "ہنزہ", province: "Gilgit-Baltistan", lat: 36.3167, lon: 74.65, agroZone: "highland-dry" },
  { name: "Chilas", nameUr: "چلاس", province: "Gilgit-Baltistan", lat: 35.4167, lon: 74.0956, agroZone: "highland-dry" },
]

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export const PAKISTAN_LOCATIONS: PakistanLocation[] = RAW.map((loc) => ({
  slug: loc.slug ?? slugify(loc.name),
  name: loc.name,
  nameUr: loc.nameUr,
  province: loc.province,
  provinceUr: PROVINCE_URDU[loc.province],
  lat: loc.lat,
  lon: loc.lon,
  agroZone: loc.agroZone,
}))

export const PROVINCES: Province[] = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Azad Jammu & Kashmir",
  "Gilgit-Baltistan",
]

/**
 * Documented default. When a request supplies neither coordinates nor a city
 * and the caller has no saved location, the weather API falls back to Lahore.
 * Responses always echo back which location was used and whether it was the
 * default (`isDefault: true`), so the UI can prompt the farmer to pick their own.
 */
export const DEFAULT_LOCATION_SLUG = "lahore"

export const DEFAULT_LOCATION: PakistanLocation =
  PAKISTAN_LOCATIONS.find((l) => l.slug === DEFAULT_LOCATION_SLUG) ?? PAKISTAN_LOCATIONS[0]

/**
 * Outer bounding box of Pakistan — a cheap first rejection test only.
 * A plain box is far too generous (it swallows Delhi and most of Rajasthan),
 * so anything inside the box is then checked against PAKISTAN_OUTLINE.
 */
export const PAKISTAN_BOUNDS = {
  minLat: 23.5,
  maxLat: 37.2,
  minLon: 60.8,
  maxLon: 77.9,
}

/**
 * Simplified outline of Pakistan's national boundary as [lat, lon] pairs,
 * traced clockwise from the northern tip of the Gilgit-Baltistan panhandle.
 * Coastal points are nudged ~10 km seaward so shoreline towns like Karachi
 * and Gwadar are comfortably inside.
 *
 * Deliberately coarse: its job is to reject obviously-foreign coordinates
 * (the old code defaulted to the geographic centre of India), not to
 * adjudicate disputed borders.
 */
export const PAKISTAN_OUTLINE: [number, number][] = [
  // Northern tip and the China border eastwards
  [37.06, 74.56],
  [36.85, 75.45],
  [36.3, 76.1],
  [35.7, 76.9],
  [35.3, 77.1],
  // Down the eastern side (Kashmir, then Punjab)
  [34.7, 76.0],
  [34.3, 74.1],
  [33.7, 74.2],
  [33.0, 74.3],
  [32.5, 74.7],
  [32.2, 75.2],
  [31.7, 74.65],
  [31.1, 74.65],
  [30.3, 74.3],
  [29.9, 74.0],
  [29.1, 73.1],
  // Cholistan and Thar deserts
  [28.0, 70.7],
  [27.3, 70.3],
  [26.2, 70.1],
  [25.5, 70.6],
  [24.7, 71.05],
  [24.2, 71.1],
  [24.1, 70.0],
  // Coast, west from Sir Creek to the Iranian border
  [23.8, 68.8],
  [23.6, 68.2],
  [23.95, 67.3],
  [24.65, 66.95],
  [24.75, 66.55],
  [25.1, 65.6],
  [25.2, 64.6],
  [25.05, 63.5],
  [25.0, 62.3],
  [24.9, 61.6],
  // Iran border northwards to the western tri-junction
  [26.0, 61.8],
  [27.0, 62.8],
  [28.0, 62.4],
  [29.0, 61.1],
  [29.86, 60.87],
  // Afghan border, north-east back to the panhandle
  [30.5, 61.8],
  [31.0, 63.5],
  [31.3, 65.8],
  [30.9, 66.4],
  [31.3, 67.0],
  [31.8, 68.6],
  [32.6, 69.4],
  [33.3, 69.3],
  [34.0, 69.9],
  [34.6, 71.0],
  [35.2, 71.1],
  [35.8, 71.2],
  [36.3, 71.6],
  [36.7, 73.0],
]

/** Tolerance for coordinates just outside the simplified outline. */
const BORDER_TOLERANCE_KM = 25

function pointInPolygon(lat: number, lon: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i]
    const [latJ, lonJ] = polygon[j]
    const intersects =
      latI > lat !== latJ > lat && lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI
    if (intersects) inside = !inside
  }
  return inside
}

/**
 * True when a coordinate is inside Pakistan (or within ~25 km of a listed
 * city, which forgives the coarseness of the outline near borders and coast).
 */
export function isWithinPakistan(lat: number, lon: number): boolean {
  if (
    lat < PAKISTAN_BOUNDS.minLat ||
    lat > PAKISTAN_BOUNDS.maxLat ||
    lon < PAKISTAN_BOUNDS.minLon ||
    lon > PAKISTAN_BOUNDS.maxLon
  ) {
    return false
  }
  if (pointInPolygon(lat, lon, PAKISTAN_OUTLINE)) return true
  return nearestLocation(lat, lon).distanceKm <= BORDER_TOLERANCE_KM
}

/** Resolves a slug, English name or Urdu name to a known location. */
export function findLocation(query: string | null | undefined): PakistanLocation | null {
  if (!query) return null
  const needle = query.trim().toLowerCase()
  if (!needle) return null

  const bySlug = PAKISTAN_LOCATIONS.find((l) => l.slug === needle)
  if (bySlug) return bySlug

  const exact = PAKISTAN_LOCATIONS.find(
    (l) => l.name.toLowerCase() === needle || l.nameUr === query.trim(),
  )
  if (exact) return exact

  const slugged = slugify(needle)
  const bySlugified = PAKISTAN_LOCATIONS.find((l) => l.slug === slugged)
  if (bySlugified) return bySlugified

  return PAKISTAN_LOCATIONS.find((l) => l.name.toLowerCase().startsWith(needle)) ?? null
}

export function locationsByProvince(province: string): PakistanLocation[] {
  const needle = province.trim().toLowerCase()
  return PAKISTAN_LOCATIONS.filter(
    (l) => l.province.toLowerCase() === needle || l.slug === needle,
  )
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance in kilometres. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Nearest known city to an arbitrary coordinate. Used only to label a
 * coordinate-based lookup and to pick an agro-zone — the weather itself is
 * always fetched for the exact coordinates supplied.
 */
export function nearestLocation(lat: number, lon: number): { location: PakistanLocation; distanceKm: number } {
  let best = PAKISTAN_LOCATIONS[0]
  let bestDist = Number.POSITIVE_INFINITY

  for (const loc of PAKISTAN_LOCATIONS) {
    const d = distanceKm(lat, lon, loc.lat, loc.lon)
    if (d < bestDist) {
      bestDist = d
      best = loc
    }
  }

  return { location: best, distanceKm: Math.round(bestDist * 10) / 10 }
}
