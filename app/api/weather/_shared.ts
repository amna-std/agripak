/**
 * Shared plumbing for the /api/weather routes.
 *
 * Not a route file — Next.js only routes `route.ts`, so this module is never
 * exposed as an endpoint.
 */

import { fail, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import {
  WeatherRequestError,
  getWeather,
  resolveLocation,
  type WeatherBundle,
} from "@/lib/services/weatherService"

/**
 * Weather is public — a farmer should see the forecast before signing in.
 * If a valid token happens to be present we fall back to the saved farm
 * location, but a missing or invalid token is never an error here.
 */
async function profileLocation(req: Request) {
  try {
    const auth = await authenticate(req)
    if (!auth.ok) return null
    return {
      latitude: auth.user?.coordinates?.latitude,
      longitude: auth.user?.coordinates?.longitude,
      district: auth.user?.district,
      province: auth.user?.state,
    }
  } catch {
    // No DB or no JWT secret configured — weather must still work.
    return null
  }
}

function parseDays(params: URLSearchParams, fallback: number, max = 16): number {
  const raw = Number(params.get("days"))
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return Math.min(Math.trunc(raw), max)
}

export interface WeatherRequest {
  bundle: WeatherBundle
  params: URLSearchParams
  crop: string | null
  days: number
}

/**
 * Resolves the requested location (lat/lon -> city -> saved profile -> the
 * documented Lahore default) and fetches live Open-Meteo data for it.
 */
export async function loadWeather(req: Request, defaultDays = 7): Promise<WeatherRequest> {
  const params = searchParams(req)
  const hasExplicitLocation = Boolean(params.get("lat") || params.get("city") || params.get("district"))
  const profile = hasExplicitLocation ? null : await profileLocation(req)

  const location = resolveLocation({
    lat: params.get("lat"),
    lon: params.get("lon"),
    city: params.get("city") ?? params.get("district"),
    profile,
  })

  const days = parseDays(params, defaultDays)
  const bundle = await getWeather(location, days)
  return { bundle, params, crop: params.get("crop"), days }
}

/**
 * Maps an expected weather error to the standard `{ success: false, message }`
 * shape. Returns null for anything unexpected so `handler` can log it as a 500.
 */
export function weatherFailure(error: unknown): Response | null {
  if (error instanceof WeatherRequestError) {
    return fail(error.message, error.status)
  }
  return null
}
