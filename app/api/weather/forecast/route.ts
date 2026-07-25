/**
 * GET /api/weather/forecast
 *
 * 7-day daily forecast for anywhere in Pakistan, from Open-Meteo (no API key).
 *
 * Query params (all optional):
 *   lat, lon  — exact coordinates inside Pakistan. Both required together.
 *   city      — slug or name from /api/weather/locations.
 *   district  — alias for `city`.
 *   days      — 1–16, defaults to 7.
 *   crop      — tailors the farming advice.
 *
 * Resolution order: lat/lon -> city -> the signed-in farmer's saved location ->
 * DEFAULT: Lahore (flagged as `location.isDefault: true`).
 */

import { ok, handler } from "@/lib/api-helpers"
import { deriveAgriAlerts, getFarmingAdvisory } from "@/lib/services/weatherService"
import { loadWeather, weatherFailure } from "../_shared"

export const dynamic = "force-dynamic"

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export const GET = handler(async (req: Request) => {
  let loaded
  try {
    loaded = await loadWeather(req, 7)
  } catch (error) {
    const failure = weatherFailure(error)
    if (failure) return failure
    throw error
  }

  const { bundle, crop } = loaded
  const daily = bundle.daily

  const summary = {
    days: daily.length,
    totalRainfallMm: round1(daily.reduce((sum, d) => sum + d.precipitation, 0)),
    maxTempC: daily.length ? Math.max(...daily.map((d) => d.tempMax)) : null,
    minTempC: daily.length ? Math.min(...daily.map((d) => d.tempMin)) : null,
    maxWindKmh: daily.length ? Math.max(...daily.map((d) => d.windSpeedMax)) : null,
    rainDays: daily.filter((d) => d.precipitation >= 1).length,
  }

  return ok({
    data: {
      location: bundle.location,
      current: bundle.current,
      season: bundle.season,
      forecast: daily,
      summary,
      farmingAdvice: getFarmingAdvisory(bundle, crop),
      alerts: deriveAgriAlerts(bundle),
      source: bundle.source,
      fetchedAt: bundle.fetchedAt,
    },
  })
})
