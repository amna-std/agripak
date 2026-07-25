/**
 * Weather service — Open-Meteo (https://open-meteo.com), no API key required.
 *
 * Replaces the old OpenWeatherMap integration. Everything returned here is
 * derived from a real Open-Meteo response; nothing is fabricated. If the
 * upstream call fails the callers surface an error rather than inventing
 * numbers.
 *
 * Works for ANY Pakistani coordinate pair — nothing is hardcoded to one city.
 */

import {
  DEFAULT_LOCATION,
  findLocation,
  isWithinPakistan,
  nearestLocation,
  type AgroZone,
  type PakistanLocation,
} from "@/lib/data/pakistan-locations"

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
const TIMEZONE = "Asia/Karachi"
const REQUEST_TIMEOUT_MS = 10_000
/** Open-Meteo updates roughly every 15 minutes; cache to stay well inside rate limits. */
const CACHE_SECONDS = 900

/* ------------------------------------------------------------------ types */

export interface ResolvedLocation {
  name: string
  nameUr: string
  province: string
  provinceUr: string
  lat: number
  lon: number
  agroZone: AgroZone
  /** How the coordinates were determined. */
  resolvedFrom: "coordinates" | "city" | "profile" | "default"
  /** True when the documented Lahore fallback was used. */
  isDefault: boolean
  /** Set when coordinates were supplied and matched to the nearest known city. */
  nearestCityKm?: number
  /**
   * The grid point Open-Meteo actually served. Slightly offset from `lat`/`lon`
   * because the model runs on a fixed grid; exposed for transparency while
   * `lat`/`lon` stay exactly what the caller asked for.
   */
  gridPoint?: { lat: number; lon: number }
}

export interface WeatherCondition {
  code: number
  condition: string
  description: string
  descriptionUr: string
  icon: string
  /** Coarse group, handy for picking UI backgrounds. */
  group: "clear" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "thunderstorm"
  severe: boolean
}

export interface CurrentWeather {
  time: string
  temperature: number
  feelsLike: number
  humidity: number
  precipitation: number
  windSpeed: number
  windDirection: number
  windDirectionLabel: string
  pressure: number
  cloudCover: number
  isDay: boolean
  weather: WeatherCondition
  units: Record<string, string>
}

export interface DailyForecast {
  date: string
  dayName: string
  tempMax: number
  tempMin: number
  humidityMax: number | null
  humidityMin: number | null
  precipitation: number
  precipitationProbability: number | null
  windSpeedMax: number
  uvIndexMax: number | null
  sunrise: string | null
  sunset: string | null
  weather: WeatherCondition
}

export interface WeatherBundle {
  location: ResolvedLocation
  current: CurrentWeather
  daily: DailyForecast[]
  season: Season
  source: "open-meteo"
  fetchedAt: string
}

export interface Advisory {
  /** Stable id so the UI can dedupe / persist dismissals. */
  id: string
  category: "irrigation" | "spraying" | "harvest" | "disease" | "protection" | "fieldwork" | "general"
  priority: "high" | "medium" | "low"
  title: string
  titleUr: string
  message: string
  /** Which observed/forecast values triggered this advisory. */
  basis: string
}

export interface AgriAlert {
  id: string
  type: "heatwave" | "heavy_rain" | "frost" | "high_wind" | "thunderstorm" | "dry_spell"
  severity: "advisory" | "moderate" | "severe" | "extreme"
  title: string
  titleUr: string
  message: string
  startDate: string
  endDate: string
  /** The real forecast numbers the alert was derived from. */
  metric: Record<string, number | string>
  recommendations: string[]
}

export type Season = "Rabi" | "Kharif"

/* ------------------------------------------------------- WMO code mapping */

interface CodeEntry {
  condition: string
  description: string
  descriptionUr: string
  day: string
  night?: string
  group: WeatherCondition["group"]
  severe?: boolean
}

const WMO_CODES: Record<number, CodeEntry> = {
  0: { condition: "Clear", description: "Clear sky", descriptionUr: "صاف آسمان", day: "☀️", night: "🌙", group: "clear" },
  1: { condition: "Clear", description: "Mainly clear", descriptionUr: "زیادہ تر صاف", day: "🌤️", night: "🌙", group: "clear" },
  2: { condition: "Clouds", description: "Partly cloudy", descriptionUr: "جزوی ابر آلود", day: "⛅", night: "☁️", group: "cloud" },
  3: { condition: "Clouds", description: "Overcast", descriptionUr: "مکمل ابر آلود", day: "☁️", group: "cloud" },
  45: { condition: "Fog", description: "Fog", descriptionUr: "دھند", day: "🌫️", group: "fog" },
  48: { condition: "Fog", description: "Freezing fog", descriptionUr: "منجمد دھند", day: "🌫️", group: "fog" },
  51: { condition: "Drizzle", description: "Light drizzle", descriptionUr: "ہلکی پھوار", day: "🌦️", group: "drizzle" },
  53: { condition: "Drizzle", description: "Moderate drizzle", descriptionUr: "درمیانی پھوار", day: "🌦️", group: "drizzle" },
  55: { condition: "Drizzle", description: "Dense drizzle", descriptionUr: "گھنی پھوار", day: "🌧️", group: "drizzle" },
  56: { condition: "Drizzle", description: "Light freezing drizzle", descriptionUr: "ہلکی منجمد پھوار", day: "🌧️", group: "drizzle" },
  57: { condition: "Drizzle", description: "Dense freezing drizzle", descriptionUr: "گھنی منجمد پھوار", day: "🌧️", group: "drizzle" },
  61: { condition: "Rain", description: "Light rain", descriptionUr: "ہلکی بارش", day: "🌦️", group: "rain" },
  63: { condition: "Rain", description: "Moderate rain", descriptionUr: "درمیانی بارش", day: "🌧️", group: "rain" },
  65: { condition: "Rain", description: "Heavy rain", descriptionUr: "تیز بارش", day: "🌧️", group: "rain", severe: true },
  66: { condition: "Rain", description: "Light freezing rain", descriptionUr: "ہلکی منجمد بارش", day: "🌧️", group: "rain" },
  67: { condition: "Rain", description: "Heavy freezing rain", descriptionUr: "تیز منجمد بارش", day: "🌧️", group: "rain", severe: true },
  71: { condition: "Snow", description: "Light snowfall", descriptionUr: "ہلکی برف باری", day: "🌨️", group: "snow" },
  73: { condition: "Snow", description: "Moderate snowfall", descriptionUr: "درمیانی برف باری", day: "🌨️", group: "snow" },
  75: { condition: "Snow", description: "Heavy snowfall", descriptionUr: "شدید برف باری", day: "❄️", group: "snow", severe: true },
  77: { condition: "Snow", description: "Snow grains", descriptionUr: "برفانی دانے", day: "🌨️", group: "snow" },
  80: { condition: "Rain", description: "Light rain showers", descriptionUr: "ہلکی بوچھاڑ", day: "🌦️", group: "rain" },
  81: { condition: "Rain", description: "Moderate rain showers", descriptionUr: "درمیانی بوچھاڑ", day: "🌧️", group: "rain" },
  82: { condition: "Rain", description: "Violent rain showers", descriptionUr: "شدید بوچھاڑ", day: "⛈️", group: "rain", severe: true },
  85: { condition: "Snow", description: "Light snow showers", descriptionUr: "ہلکی برفانی بوچھاڑ", day: "🌨️", group: "snow" },
  86: { condition: "Snow", description: "Heavy snow showers", descriptionUr: "شدید برفانی بوچھاڑ", day: "❄️", group: "snow", severe: true },
  95: { condition: "Thunderstorm", description: "Thunderstorm", descriptionUr: "گرج چمک کے ساتھ طوفان", day: "⛈️", group: "thunderstorm", severe: true },
  96: { condition: "Thunderstorm", description: "Thunderstorm with light hail", descriptionUr: "گرج چمک اور ہلکے ژالے", day: "⛈️", group: "thunderstorm", severe: true },
  99: { condition: "Thunderstorm", description: "Thunderstorm with heavy hail", descriptionUr: "گرج چمک اور شدید ژالہ باری", day: "⛈️", group: "thunderstorm", severe: true },
}

const UNKNOWN_CODE: CodeEntry = {
  condition: "Unknown",
  description: "Unknown conditions",
  descriptionUr: "نامعلوم موسم",
  day: "🌡️",
  group: "cloud",
}

/** Maps a WMO weather code to a human description + icon. */
export function describeWeatherCode(code: number, isDay = true): WeatherCondition {
  const entry = WMO_CODES[code] ?? UNKNOWN_CODE
  return {
    code,
    condition: entry.condition,
    description: entry.description,
    descriptionUr: entry.descriptionUr,
    icon: isDay ? entry.day : entry.night ?? entry.day,
    group: entry.group,
    severe: Boolean(entry.severe),
  }
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]

export function windDirectionLabel(degrees: number): string {
  if (!Number.isFinite(degrees)) return "—"
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16]
}

/* ------------------------------------------------------------- seasonality */

/** Rabi runs Nov–Apr, Kharif runs May–Oct (Pakistan). */
export function currentSeason(date = new Date()): Season {
  const month = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, month: "numeric" }).format(date),
  )
  return month >= 5 && month <= 10 ? "Kharif" : "Rabi"
}

/* ------------------------------------------------- location normalisation */

export interface LocationQuery {
  lat?: string | number | null
  lon?: string | number | null
  city?: string | null
  /** Fallback coordinates from the authenticated user's profile. */
  profile?: { latitude?: number; longitude?: number; district?: string; province?: string } | null
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * True when the caller actually sent something for this parameter.
 *
 * Distinguishes "no coordinates supplied" (fall through to city/profile/default)
 * from "coordinates supplied but unparseable" — the latter must be an error, not
 * a silent fallback to the default city. A frontend that interpolates a missing
 * value sends the literal strings `undefined`/`null`, which would otherwise be
 * answered with Lahore's weather as if it were the farmer's own.
 */
function isSupplied(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false
  return String(value).trim() !== ""
}

export class WeatherRequestError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function fromKnownCity(loc: PakistanLocation, resolvedFrom: ResolvedLocation["resolvedFrom"]): ResolvedLocation {
  return {
    name: loc.name,
    nameUr: loc.nameUr,
    province: loc.province,
    provinceUr: loc.provinceUr,
    lat: loc.lat,
    lon: loc.lon,
    agroZone: loc.agroZone,
    resolvedFrom,
    isDefault: resolvedFrom === "default",
  }
}

function fromCoordinates(lat: number, lon: number, resolvedFrom: ResolvedLocation["resolvedFrom"]): ResolvedLocation {
  const { location, distanceKm } = nearestLocation(lat, lon)
  return {
    // Coordinates far from any listed city are labelled relative to the nearest one.
    name: distanceKm <= 25 ? location.name : `Near ${location.name}`,
    nameUr: location.nameUr,
    province: location.province,
    provinceUr: location.provinceUr,
    lat,
    lon,
    agroZone: location.agroZone,
    resolvedFrom,
    isDefault: false,
    nearestCityKm: distanceKm,
  }
}

/**
 * Resolves a request into coordinates.
 *
 * Precedence: explicit lat/lon -> `city` -> authenticated user's saved
 * coordinates -> saved district name -> DEFAULT (Lahore, flagged `isDefault`).
 */
export function resolveLocation(query: LocationQuery): ResolvedLocation {
  const latSupplied = isSupplied(query.lat)
  const lonSupplied = isSupplied(query.lon)

  if (latSupplied || lonSupplied) {
    const lat = toNumber(query.lat)
    const lon = toNumber(query.lon)

    if (lat === null || lon === null) {
      throw new WeatherRequestError(
        "Both lat and lon are required when supplying coordinates, and both must be numbers.",
        400,
      )
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new WeatherRequestError("Coordinates out of range.", 400)
    }
    if (!isWithinPakistan(lat, lon)) {
      throw new WeatherRequestError(
        "Coordinates are outside Pakistan. This service covers Pakistan only.",
        400,
      )
    }
    return fromCoordinates(lat, lon, "coordinates")
  }

  if (query.city) {
    const match = findLocation(query.city)
    if (!match) {
      throw new WeatherRequestError(
        `Unknown location "${query.city}". Call /api/weather/locations for the supported list.`,
        404,
      )
    }
    return fromKnownCity(match, "city")
  }

  const profileLat = toNumber(query.profile?.latitude)
  const profileLon = toNumber(query.profile?.longitude)
  if (profileLat !== null && profileLon !== null && isWithinPakistan(profileLat, profileLon)) {
    return fromCoordinates(profileLat, profileLon, "profile")
  }

  const profileCity = findLocation(query.profile?.district)
  if (profileCity) return fromKnownCity(profileCity, "profile")

  return fromKnownCity(DEFAULT_LOCATION, "default")
}

/* ------------------------------------------------------------ open-meteo */

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "weather_code",
  "surface_pressure",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "is_day",
].join(",")

const DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "relative_humidity_2m_max",
  "relative_humidity_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "uv_index_max",
  "sunrise",
  "sunset",
].join(",")

async function callOpenMeteo(lat: number, lon: number, days: number): Promise<any> {
  const url =
    `${OPEN_METEO_URL}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=${CURRENT_FIELDS}&daily=${DAILY_FIELDS}` +
    `&forecast_days=${days}&timezone=${encodeURIComponent(TIMEZONE)}`

  let res: Response
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: CACHE_SECONDS },
      headers: { Accept: "application/json" },
    })
  } catch (error: any) {
    throw new WeatherRequestError(
      error?.name === "TimeoutError"
        ? "Weather service timed out. Please try again."
        : "Could not reach the weather service. Please try again.",
      503,
    )
  }

  if (!res.ok) {
    throw new WeatherRequestError(`Weather service returned ${res.status}.`, 502)
  }

  const json = await res.json()
  if (!json?.current || !json?.daily) {
    throw new WeatherRequestError("Weather service returned an unexpected response.", 502)
  }
  return json
}

function dayName(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  return Number.isNaN(d.getTime())
    ? isoDate
    : new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: TIMEZONE }).format(d)
}

function round(value: unknown, digits = 1): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function nullableNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function mapCurrent(raw: any): CurrentWeather {
  const c = raw.current
  const isDay = c.is_day === 1 || c.is_day === true
  const direction = Number(c.wind_direction_10m) || 0

  // A missing temperature would be rounded to 0 and shown as a live reading.
  // Better to report the upstream response as unusable than to invent 0 °C.
  if (!Number.isFinite(Number(c.temperature_2m))) {
    throw new WeatherRequestError("Weather service returned no temperature reading.", 502)
  }

  return {
    time: c.time,
    temperature: round(c.temperature_2m),
    feelsLike: round(c.apparent_temperature),
    humidity: Math.round(Number(c.relative_humidity_2m) || 0),
    precipitation: round(c.precipitation),
    windSpeed: round(c.wind_speed_10m),
    windDirection: direction,
    windDirectionLabel: windDirectionLabel(direction),
    pressure: round(c.surface_pressure),
    cloudCover: Math.round(Number(c.cloud_cover) || 0),
    isDay,
    weather: describeWeatherCode(Number(c.weather_code), isDay),
    units: {
      temperature: raw.current_units?.temperature_2m ?? "°C",
      windSpeed: raw.current_units?.wind_speed_10m ?? "km/h",
      precipitation: raw.current_units?.precipitation ?? "mm",
      pressure: raw.current_units?.surface_pressure ?? "hPa",
      humidity: "%",
    },
  }
}

function mapDaily(raw: any): DailyForecast[] {
  const d = raw.daily
  const times: string[] = d.time ?? []

  /**
   * `round()` turns a missing value into 0, and a 0 here is not harmless: a null
   * temperature_2m_min would read as 0 °C and manufacture a frost alert, and a
   * null precipitation_sum would manufacture a dry spell. Drop any day whose
   * alert-driving fields are not real numbers rather than report invented ones.
   */
  const usable = (i: number) =>
    [
      d.temperature_2m_max?.[i],
      d.temperature_2m_min?.[i],
      d.precipitation_sum?.[i],
      d.wind_speed_10m_max?.[i],
    ].every((v) => Number.isFinite(Number(v)))

  return times.flatMap((date, i) => (usable(i) ? [mapDay(d, date, i)] : []))
}

function mapDay(d: any, date: string, i: number): DailyForecast {
  return {
    date,
    dayName: dayName(date),
    tempMax: round(d.temperature_2m_max?.[i]),
    tempMin: round(d.temperature_2m_min?.[i]),
    humidityMax: nullableNumber(d.relative_humidity_2m_max?.[i]),
    humidityMin: nullableNumber(d.relative_humidity_2m_min?.[i]),
    precipitation: round(d.precipitation_sum?.[i]),
    precipitationProbability: nullableNumber(d.precipitation_probability_max?.[i]),
    windSpeedMax: round(d.wind_speed_10m_max?.[i]),
    uvIndexMax: nullableNumber(d.uv_index_max?.[i]),
    sunrise: d.sunrise?.[i] ?? null,
    sunset: d.sunset?.[i] ?? null,
    weather: describeWeatherCode(Number(d.weather_code?.[i]), true),
  }
}

/** Fetches current conditions + daily forecast for any Pakistani coordinate. */
export async function getWeather(location: ResolvedLocation, days = 7): Promise<WeatherBundle> {
  const clampedDays = Math.min(Math.max(Math.trunc(days) || 7, 1), 16)
  const raw = await callOpenMeteo(location.lat, location.lon, clampedDays)

  return {
    location: {
      ...location,
      // Open-Meteo snaps to its own grid; keep the caller's coordinates as the
      // location identity and report the served grid point alongside it.
      gridPoint: { lat: round(raw.latitude, 4), lon: round(raw.longitude, 4) },
    },
    current: mapCurrent(raw),
    daily: mapDaily(raw),
    season: currentSeason(),
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
  }
}

/* ------------------------------------------------- agricultural advisories */

const SEASON_CROPS: Record<Season, string> = {
  Kharif: "rice, cotton, maize, sugarcane",
  Rabi: "wheat, chickpea (chana), mustard, potato",
}

/**
 * Turns real observed/forecast conditions into farming advice for Pakistani
 * Rabi/Kharif cropping. Every item records the numbers it was derived from.
 */
export function getFarmingAdvisory(bundle: WeatherBundle, crop?: string | null): Advisory[] {
  const { current, daily, season, location } = bundle
  const advisories: Advisory[] = []
  const next3 = daily.slice(0, 3)
  const rain3 = round(next3.reduce((sum, d) => sum + d.precipitation, 0))
  const rain7 = round(daily.reduce((sum, d) => sum + d.precipitation, 0))
  const rainNext24h = daily[0]?.precipitation ?? 0
  const probNext24h = daily[0]?.precipitationProbability ?? 0
  const maxToday = daily[0]?.tempMax ?? current.temperature
  const minTonight = daily[0]?.tempMin ?? current.temperature
  const cropName = crop?.trim().toLowerCase() || null

  const push = (a: Advisory) => advisories.push(a)

  /* --- irrigation --- */
  if (rain3 >= 15 || probNext24h >= 70) {
    push({
      id: "irrigation-hold",
      category: "irrigation",
      priority: "high",
      title: "Hold irrigation — rain is coming",
      titleUr: "آبپاشی روک دیں — بارش متوقع ہے",
      message: `About ${rain3} mm of rain is forecast over the next 3 days. Skip the next watering to save diesel/electricity and avoid waterlogging. Clear field drains and check that watercourses (khaals) are open.`,
      basis: `3-day forecast rainfall ${rain3} mm, tomorrow's rain probability ${probNext24h}%`,
    })
  } else if (rain3 < 3 && maxToday >= 34) {
    push({
      id: "irrigation-needed",
      category: "irrigation",
      priority: "high",
      title: "Irrigate soon — hot and dry",
      titleUr: "جلد آبپاشی کریں — گرمی اور خشکی",
      message: `Only ${rain3} mm of rain is expected in 3 days with highs near ${maxToday}°C. Irrigate in the early morning or after sunset to cut evaporation losses. ${season === "Kharif" ? "Keep 5–7 cm standing water in transplanted rice; give cotton a light, frequent watering." : "Do not let wheat go dry at crown-root or grain-filling stage."}`,
      basis: `3-day forecast rainfall ${rain3} mm, today's max ${maxToday}°C`,
    })
  } else if (rain7 < 2) {
    push({
      id: "irrigation-plan",
      category: "irrigation",
      priority: "medium",
      title: "Plan your canal turn (warabandi)",
      titleUr: "وارہ بندی کی منصوبہ بندی کریں",
      message: `Barely ${rain7} mm of rain is forecast over the whole week. Line up your warabandi turn or tubewell run now rather than waiting for rain.`,
      basis: `7-day forecast rainfall ${rain7} mm`,
    })
  }

  /* --- spraying --- */
  const sprayBlockers: string[] = []
  if (current.windSpeed >= 15) sprayBlockers.push(`wind ${current.windSpeed} km/h (spray drift)`)
  if (rainNext24h >= 2 || probNext24h >= 60)
    sprayBlockers.push(`rain expected in 24h (${rainNext24h} mm, ${probNext24h}% chance) — wash-off`)
  if (current.temperature >= 38) sprayBlockers.push(`temperature ${current.temperature}°C (evaporation and crop burn)`)

  if (sprayBlockers.length > 0) {
    push({
      id: "spraying-avoid",
      category: "spraying",
      priority: "high",
      title: "Do not spray now",
      titleUr: "ابھی سپرے نہ کریں",
      message: `Conditions are wrong for pesticide or foliar spray: ${sprayBlockers.join("; ")}. Wait for a calm, dry window — early morning (6–9 am) or evening (after 5 pm) is usually best.`,
      basis: sprayBlockers.join("; "),
    })
  } else {
    push({
      id: "spraying-ok",
      category: "spraying",
      priority: "low",
      title: "Good window for spraying",
      titleUr: "سپرے کے لیے موزوں وقت",
      message: `Wind is ${current.windSpeed} km/h and no significant rain is expected in the next 24 hours. This is a workable spray window. Still prefer early morning or evening and keep the nozzle low.`,
      basis: `wind ${current.windSpeed} km/h, 24h rain ${rainNext24h} mm`,
    })
  }

  /* --- disease pressure --- */
  if (current.humidity >= 80 && current.temperature >= 18 && current.temperature <= 32) {
    push({
      id: "disease-fungal",
      category: "disease",
      priority: "medium",
      title: "High fungal disease risk",
      titleUr: "پھپھوندی کی بیماری کا خطرہ",
      message: `Humidity is ${current.humidity}% at ${current.temperature}°C — ideal for fungal infection. ${season === "Rabi" ? "Scout wheat for yellow/stripe rust and potato for late blight." : "Scout rice for blast and bacterial leaf blight, and cotton for boll rot."} Treat early; a preventive spray costs far less than a lost crop.`,
      basis: `humidity ${current.humidity}%, temperature ${current.temperature}°C`,
    })
  }

  if (season === "Kharif" && current.humidity >= 70 && current.temperature >= 28) {
    push({
      id: "disease-pest-cotton",
      category: "disease",
      priority: "medium",
      title: "Check cotton for whitefly and bollworm",
      titleUr: "کپاس میں سفید مکھی اور سنڈی کی جانچ کریں",
      message: `Warm and humid weather (${current.temperature}°C, ${current.humidity}%) favours whitefly — the vector for cotton leaf curl virus — and pink bollworm. Scout 20 plants per acre twice a week and act on economic threshold, not on calendar.`,
      basis: `temperature ${current.temperature}°C, humidity ${current.humidity}%`,
    })
  }

  /* --- harvest / post-harvest --- */
  const wetHarvestDay = daily.slice(0, 5).find((d) => d.precipitation >= 10)
  if (wetHarvestDay) {
    push({
      id: "harvest-rain-risk",
      category: "harvest",
      priority: "high",
      title: "Rain threatens harvest and stored grain",
      titleUr: "بارش سے فصل اور ذخیرہ شدہ اناج کو خطرہ",
      message: `${wetHarvestDay.precipitation} mm of rain is forecast for ${wetHarvestDay.dayName} (${wetHarvestDay.date}). If your crop is ready, harvest before that day. Cover threshed grain on the floor, and do not spread produce at the mandi in the open.`,
      basis: `${wetHarvestDay.precipitation} mm forecast on ${wetHarvestDay.date}`,
    })
  } else if (rain7 < 5 && current.humidity < 60) {
    push({
      id: "harvest-good-window",
      category: "harvest",
      priority: "low",
      title: "Dry week — good for harvest and drying",
      titleUr: "خشک ہفتہ — کٹائی اور خشک کرنے کے لیے موزوں",
      message: `Only ${rain7} mm of rain is forecast this week. Good conditions for cutting, threshing and sun-drying grain down to safe moisture before storage.`,
      basis: `7-day forecast rainfall ${rain7} mm, humidity ${current.humidity}%`,
    })
  }

  /* --- protection: heat, frost, wind --- */
  if (maxToday >= 40) {
    push({
      id: "protect-heat",
      category: "protection",
      priority: "high",
      title: "Heat stress on crops and livestock",
      titleUr: "فصلوں اور مویشیوں پر گرمی کا دباؤ",
      message: `Today's high is ${maxToday}°C. ${season === "Rabi" ? "Heat at grain filling shrivels wheat — a light irrigation now protects yield." : "Cotton sheds squares and flowers above 40°C; keep soil moisture even."} Water livestock at least three times, provide shade, and avoid field labour between 12 pm and 4 pm.`,
      basis: `forecast maximum ${maxToday}°C`,
    })
  }

  if (minTonight <= 4) {
    push({
      id: "protect-frost",
      category: "protection",
      priority: "high",
      title: "Frost risk tonight",
      titleUr: "آج رات کوہرے/پالے کا خطرہ",
      message: `The overnight low is ${minTonight}°C. A light irrigation before sunset raises soil heat and reduces frost damage. Protect potato, tomato, banana, citrus nursery and young fodder. Smoke on the field edge in the early hours also helps in still air.`,
      basis: `forecast overnight minimum ${minTonight}°C`,
    })
  }

  if (current.windSpeed >= 30 || (daily[0]?.windSpeedMax ?? 0) >= 40) {
    push({
      id: "protect-wind",
      category: "protection",
      priority: "medium",
      title: "Strong winds — lodging risk",
      titleUr: "تیز ہوائیں — فصل گرنے کا خطرہ",
      message: `Winds up to ${daily[0]?.windSpeedMax ?? current.windSpeed} km/h are expected. Tall wheat, maize, sugarcane and banana can lodge. Secure tunnels, shade nets and sheds; delay top-dressing urea until the wind drops.`,
      basis: `current wind ${current.windSpeed} km/h, forecast max ${daily[0]?.windSpeedMax ?? 0} km/h`,
    })
  }

  /* --- fieldwork --- */
  if (current.weather.group === "fog") {
    push({
      id: "fieldwork-fog",
      category: "fieldwork",
      priority: "medium",
      title: "Fog — poor conditions for field operations",
      titleUr: "دھند — کھیت کے کاموں کے لیے موزوں نہیں",
      message: `Dense fog (${current.weather.description}) limits visibility and keeps leaves wet all morning, which spreads disease. Delay spraying and tractor work until the fog clears; drive with lights on the link roads.`,
      basis: `current condition: ${current.weather.description}`,
    })
  }

  /* --- crop-specific --- */
  if (cropName) {
    const cropAdvice = cropSpecificAdvisory(cropName, bundle)
    if (cropAdvice) push(cropAdvice)
  }

  /* --- always-on seasonal context --- */
  push({
    id: "season-context",
    category: "general",
    priority: "low",
    title: `${season} season — ${location.province}`,
    titleUr: season === "Rabi" ? "ربیع کا موسم" : "خریف کا موسم",
    message: `It is currently the ${season} season (${season === "Rabi" ? "Nov–Apr" : "May–Oct"}). Main crops in the ground now: ${SEASON_CROPS[season]}. Advice above is based on the live Open-Meteo forecast for ${location.name}, ${location.province}.`,
    basis: `season derived from current date (Asia/Karachi)`,
  })

  const order = { high: 0, medium: 1, low: 2 } as const
  return advisories.sort((a, b) => order[a.priority] - order[b.priority])
}

function cropSpecificAdvisory(crop: string, bundle: WeatherBundle): Advisory | null {
  const { current, daily } = bundle
  const maxToday = daily[0]?.tempMax ?? current.temperature
  const minTonight = daily[0]?.tempMin ?? current.temperature

  const mk = (title: string, titleUr: string, message: string, basis: string, priority: Advisory["priority"] = "medium"): Advisory => ({
    id: `crop-${crop.replace(/\s+/g, "-")}`,
    category: "general",
    priority,
    title,
    titleUr,
    message,
    basis,
  })

  if (/(wheat|gandum|گندم)/.test(crop)) {
    if (maxToday >= 32)
      return mk(
        "Wheat: heat during grain filling",
        "گندم: دانہ بھرنے کے دوران گرمی",
        `At ${maxToday}°C grain filling shortens and grains shrivel. Apply a light irrigation and avoid any moisture stress until harvest.`,
        `forecast maximum ${maxToday}°C`,
        "high",
      )
    if (current.humidity >= 75 && current.temperature >= 15 && current.temperature <= 22)
      return mk(
        "Wheat: yellow rust weather",
        "گندم: پیلی کنگی کا موسم",
        `Cool and humid (${current.temperature}°C, ${current.humidity}%) is classic yellow rust weather. Inspect the lower leaves; if you find yellow stripes, spray a recommended fungicide immediately.`,
        `temperature ${current.temperature}°C, humidity ${current.humidity}%`,
        "high",
      )
    return null
  }

  if (/(rice|paddy|basmati|irri|چاول|دھان)/.test(crop)) {
    if (maxToday >= 38)
      return mk(
        "Rice: heat at flowering",
        "چاول: پھول کے وقت گرمی",
        `Above 35°C at flowering, basmati spikelets go sterile. Maintain 5–7 cm standing water to cool the canopy and avoid draining the field this week.`,
        `forecast maximum ${maxToday}°C`,
        "high",
      )
    return null
  }

  if (/(cotton|kapas|کپاس)/.test(crop)) {
    if (current.humidity >= 75)
      return mk(
        "Cotton: whitefly and boll rot pressure",
        "کپاس: سفید مکھی اور گابھے کی سڑاند",
        `Humidity at ${current.humidity}% raises whitefly (CLCuV vector) and boll rot pressure. Scout twice weekly and avoid excess nitrogen, which makes the crop lush and more attractive to sucking pests.`,
        `humidity ${current.humidity}%`,
        "high",
      )
    return null
  }

  if (/(sugarcane|ganna|گنا)/.test(crop)) {
    if ((daily[0]?.windSpeedMax ?? 0) >= 35)
      return mk(
        "Sugarcane: lodging risk",
        "گنا: فصل گرنے کا خطرہ",
        `Winds up to ${daily[0]?.windSpeedMax} km/h can flatten tall cane. Tie the canes in bundles (propping) where the crop is over 2 m.`,
        `forecast maximum wind ${daily[0]?.windSpeedMax} km/h`,
      )
    return null
  }

  if (/(potato|aloo|آلو)/.test(crop)) {
    if (minTonight <= 4)
      return mk(
        "Potato: frost damage risk",
        "آلو: پالے سے نقصان کا خطرہ",
        `An overnight low of ${minTonight}°C will scorch potato haulm. Irrigate before sunset — wet soil holds heat and can lift the canopy temperature by 1–2°C.`,
        `forecast overnight minimum ${minTonight}°C`,
        "high",
      )
    if (current.humidity >= 85 && current.temperature <= 22)
      return mk(
        "Potato: late blight conditions",
        "آلو: پچھیتا جھلساؤ کا خطرہ",
        `Cool and very humid (${current.temperature}°C, ${current.humidity}%) is late blight weather. Apply a protective fungicide before symptoms appear.`,
        `temperature ${current.temperature}°C, humidity ${current.humidity}%`,
        "high",
      )
    return null
  }

  if (/(maize|makai|مکئی)/.test(crop)) {
    if (maxToday >= 38)
      return mk(
        "Maize: heat at silking",
        "مکئی: بالوں کے وقت گرمی",
        `Above 38°C at silking, pollen dies and cobs fill poorly. Irrigate every 5–7 days through the silking window.`,
        `forecast maximum ${maxToday}°C`,
        "high",
      )
    return null
  }

  if (/(mango|aam|آم)/.test(crop)) {
    if ((daily[0]?.windSpeedMax ?? 0) >= 40)
      return mk(
        "Mango: fruit drop from strong wind",
        "آم: تیز ہوا سے پھل گرنے کا خطرہ",
        `Winds up to ${daily[0]?.windSpeedMax} km/h will drop fruit. Harvest mature fruit early and prop heavily loaded branches.`,
        `forecast maximum wind ${daily[0]?.windSpeedMax} km/h`,
        "high",
      )
    return null
  }

  if (/(citrus|kinnow|کینو)/.test(crop)) {
    if (minTonight <= 2)
      return mk(
        "Citrus: frost protection",
        "کینو: پالے سے حفاظت",
        `At ${minTonight}°C young kinnow plants can be damaged. Wrap nursery plants, irrigate before sunset and bank soil around the trunk.`,
        `forecast overnight minimum ${minTonight}°C`,
        "high",
      )
    return null
  }

  return null
}

/* ------------------------------------------------------------- alerts */

/**
 * Derives agricultural alerts strictly from the real Open-Meteo forecast.
 * Returns an empty array when nothing crosses a threshold — it never invents
 * an alert to fill the UI.
 */
export function deriveAgriAlerts(bundle: WeatherBundle): AgriAlert[] {
  const { daily, season } = bundle
  const alerts: AgriAlert[] = []
  if (daily.length === 0) return alerts

  /* --- heatwave: consecutive days at or above 40°C --- */
  const hotRun = longestRun(daily, (d) => d.tempMax >= 40)
  if (hotRun) {
    const peak = Math.max(...hotRun.items.map((d) => d.tempMax))
    const severity: AgriAlert["severity"] =
      peak >= 48 ? "extreme" : peak >= 45 ? "severe" : hotRun.items.length >= 3 ? "severe" : "moderate"
    alerts.push({
      id: "heatwave",
      type: "heatwave",
      severity,
      title: `Heatwave — up to ${peak}°C`,
      titleUr: `شدید گرمی کی لہر — ${peak}°C تک`,
      message: `Daytime highs reach ${peak}°C across ${hotRun.items.length} day(s) starting ${hotRun.items[0].date}. Crops, livestock and field workers are all at risk.`,
      startDate: hotRun.items[0].date,
      endDate: hotRun.items[hotRun.items.length - 1].date,
      metric: { peakTempC: peak, days: hotRun.items.length },
      recommendations: [
        "Irrigate in the early morning or after sunset — never at midday.",
        season === "Rabi"
          ? "Give wheat a light irrigation to protect grain filling."
          : "Keep even soil moisture in cotton and maize to stop flower/square shedding.",
        "Water livestock three or more times a day and keep them under shade.",
        "Avoid field labour between 12 pm and 4 pm; carry drinking water.",
      ],
    })
  }

  /* --- heavy rain --- */
  const wettest = daily.reduce((a, b) => (b.precipitation > a.precipitation ? b : a), daily[0])
  if (wettest.precipitation >= 25) {
    const severity: AgriAlert["severity"] =
      wettest.precipitation >= 100 ? "extreme" : wettest.precipitation >= 50 ? "severe" : "moderate"
    const total = round(daily.reduce((s, d) => s + d.precipitation, 0))
    alerts.push({
      id: "heavy-rain",
      type: "heavy_rain",
      severity,
      title: `Heavy rain — ${wettest.precipitation} mm expected`,
      titleUr: `شدید بارش — ${wettest.precipitation} ملی میٹر متوقع`,
      message: `${wettest.precipitation} mm of rain is forecast for ${wettest.dayName} (${wettest.date}); ${total} mm total over the forecast period. Waterlogging and lodging are likely on flat fields.`,
      startDate: wettest.date,
      endDate: wettest.date,
      metric: { peakDailyMm: wettest.precipitation, periodTotalMm: total, date: wettest.date },
      recommendations: [
        "Clear field drains and watercourses (khaals) before the rain arrives.",
        "Stop irrigation now — do not stack rain on top of a fresh watering.",
        "Move harvested grain, fodder and fertiliser bags under cover.",
        "Delay urea top-dressing and all spraying until after the rain.",
      ],
    })
  }

  /* --- frost --- */
  const frostRun = longestRun(daily, (d) => d.tempMin <= 2)
  if (frostRun) {
    const coldest = Math.min(...frostRun.items.map((d) => d.tempMin))
    const severity: AgriAlert["severity"] = coldest <= -3 ? "severe" : coldest <= 0 ? "moderate" : "advisory"
    alerts.push({
      id: "frost",
      type: "frost",
      severity,
      title: `Frost risk — lows to ${coldest}°C`,
      titleUr: `پالے کا خطرہ — کم سے کم ${coldest}°C`,
      message: `Overnight temperatures fall to ${coldest}°C between ${frostRun.items[0].date} and ${frostRun.items[frostRun.items.length - 1].date}. Frost-sensitive crops can be damaged in a single night.`,
      startDate: frostRun.items[0].date,
      endDate: frostRun.items[frostRun.items.length - 1].date,
      metric: { minTempC: coldest, nights: frostRun.items.length },
      recommendations: [
        "Irrigate before sunset — moist soil releases heat overnight.",
        "Protect potato, tomato, banana and citrus nurseries with cover or straw mulch.",
        "Light smoke on the windward field edge in the early hours (calm nights only).",
        "Delay sowing of frost-sensitive vegetables until the cold spell passes.",
      ],
    })
  }

  /* --- high wind --- */
  const windiest = daily.reduce((a, b) => (b.windSpeedMax > a.windSpeedMax ? b : a), daily[0])
  if (windiest.windSpeedMax >= 40) {
    alerts.push({
      id: "high-wind",
      type: "high_wind",
      severity: windiest.windSpeedMax >= 60 ? "severe" : "moderate",
      title: `Strong winds — up to ${windiest.windSpeedMax} km/h`,
      titleUr: `تیز ہوائیں — ${windiest.windSpeedMax} کلومیٹر فی گھنٹہ تک`,
      message: `Winds gusting to ${windiest.windSpeedMax} km/h are forecast for ${windiest.dayName} (${windiest.date}). Standing tall crops can lodge and orchard fruit can drop.`,
      startDate: windiest.date,
      endDate: windiest.date,
      metric: { maxWindKmh: windiest.windSpeedMax, date: windiest.date },
      recommendations: [
        "Do not spray — drift will waste chemical and damage neighbouring fields.",
        "Prop or tie sugarcane, banana and heavily loaded fruit branches.",
        "Secure tunnel farming plastic, shade nets and shed roofs.",
        "Harvest mature orchard fruit ahead of the windy day.",
      ],
    })
  }

  /* --- thunderstorm / hail --- */
  const stormDay = daily.find((d) => [95, 96, 99].includes(d.weather.code))
  if (stormDay) {
    const hail = stormDay.weather.code !== 95
    alerts.push({
      id: "thunderstorm",
      type: "thunderstorm",
      severity: stormDay.weather.code === 99 ? "severe" : "moderate",
      title: hail ? "Thunderstorm with hail" : "Thunderstorm expected",
      titleUr: hail ? "گرج چمک اور ژالہ باری" : "گرج چمک کے ساتھ طوفان",
      message: `${stormDay.weather.description} is forecast for ${stormDay.dayName} (${stormDay.date})${hail ? ". Hail can shred leaves and knock fruit off the tree in minutes." : "."}`,
      startDate: stormDay.date,
      endDate: stormDay.date,
      metric: { weatherCode: stormDay.weather.code, date: stormDay.date, rainMm: stormDay.precipitation },
      recommendations: [
        "Bring livestock, workers and machinery in before the storm.",
        "Cover threshed grain and open fertiliser stock.",
        "Do not stand near tubewell electrics or irrigate during lightning.",
        hail
          ? "Where hail nets exist, deploy them over orchards and vegetable tunnels."
          : "Postpone spraying and top-dressing until the system passes.",
      ],
    })
  }

  /* --- dry spell --- */
  const total = round(daily.reduce((s, d) => s + d.precipitation, 0))
  const avgMax = round(daily.reduce((s, d) => s + d.tempMax, 0) / daily.length)
  if (daily.length >= 5 && total < 1 && avgMax >= 30) {
    alerts.push({
      id: "dry-spell",
      type: "dry_spell",
      severity: avgMax >= 38 ? "severe" : "moderate",
      title: "Dry spell — no rain forecast",
      titleUr: "خشک سالی — بارش کا امکان نہیں",
      message: `No meaningful rain (${total} mm total) is forecast over the next ${daily.length} days, with average highs of ${avgMax}°C. Plan on irrigation only.`,
      startDate: daily[0].date,
      endDate: daily[daily.length - 1].date,
      metric: { periodTotalMm: total, avgMaxTempC: avgMax, days: daily.length },
      recommendations: [
        "Book your warabandi turn and check tubewell/diesel supply now.",
        "Mulch orchards and vegetables to hold soil moisture.",
        "Prefer bed/furrow or drip irrigation over flood where possible.",
        "Avoid sowing water-hungry crops until the outlook improves.",
      ],
    })
  }

  const rank = { extreme: 0, severe: 1, moderate: 2, advisory: 3 } as const
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity])
}

function longestRun(
  days: DailyForecast[],
  predicate: (d: DailyForecast) => boolean,
): { items: DailyForecast[] } | null {
  let best: DailyForecast[] = []
  let run: DailyForecast[] = []

  for (const day of days) {
    if (predicate(day)) {
      run.push(day)
      if (run.length > best.length) best = [...run]
    } else {
      run = []
    }
  }

  return best.length > 0 ? { items: best } : null
}
