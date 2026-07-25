/**
 * GET /api/weather/current
 *
 * Live conditions for anywhere in Pakistan, from Open-Meteo (no API key).
 *
 * Query params (all optional):
 *   lat, lon  — exact coordinates, must be inside Pakistan. Both required together.
 *   city      — slug or name from /api/weather/locations (e.g. `multan`, `Gwadar`, `مردان`).
 *   district  — alias for `city`.
 *   crop      — tailors the farming advice (wheat, rice, cotton, sugarcane, potato, maize, mango, citrus).
 *
 * Resolution order: lat/lon -> city -> the signed-in farmer's saved location ->
 * DEFAULT: Lahore (flagged as `location.isDefault: true` in the response so the
 * UI can prompt the farmer to choose their own district).
 */

import { ok, handler } from "@/lib/api-helpers"
import { deriveAgriAlerts, getFarmingAdvisory } from "@/lib/services/weatherService"
import { loadWeather, weatherFailure } from "../_shared"

export const dynamic = "force-dynamic"

export const GET = handler(async (req: Request) => {
  let loaded
  try {
    // Same 7-day window as /api/weather/alerts so `alertCount` agrees with it.
    loaded = await loadWeather(req, 7)
  } catch (error) {
    const failure = weatherFailure(error)
    if (failure) return failure
    throw error
  }

  const { bundle, crop } = loaded
  const farmingAdvice = getFarmingAdvisory(bundle, crop)
  const alerts = deriveAgriAlerts(bundle)

  return ok({
    data: {
      location: bundle.location,
      current: bundle.current,
      today: bundle.daily[0] ?? null,
      tomorrow: bundle.daily[1] ?? null,
      season: bundle.season,
      farmingAdvice,
      alertCount: alerts.length,
      source: bundle.source,
      fetchedAt: bundle.fetchedAt,
    },
  })
})
