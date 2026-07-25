/**
 * GET /api/weather/alerts
 *
 * Agricultural alerts (heatwave, heavy rain, frost, high wind, thunderstorm/hail,
 * dry spell) derived from the live Open-Meteo forecast for a Pakistani location.
 *
 * Every alert carries a `metric` object with the actual forecast numbers that
 * triggered it. If nothing crosses a threshold the list is empty — alerts are
 * never invented to fill the screen.
 *
 * Query params (all optional):
 *   lat, lon  — exact coordinates inside Pakistan. Both required together.
 *   city      — slug or name from /api/weather/locations.
 *   district  — alias for `city`.
 *   days      — forecast window to scan, 1–16, defaults to 7.
 *   crop      — tailors the accompanying farming advice.
 *   severity  — minimum severity to return: advisory | moderate | severe | extreme.
 *
 * Resolution order: lat/lon -> city -> the signed-in farmer's saved location ->
 * DEFAULT: Lahore (flagged as `location.isDefault: true`).
 */

import { ok, fail, handler } from "@/lib/api-helpers"
import { deriveAgriAlerts, getFarmingAdvisory, type AgriAlert } from "@/lib/services/weatherService"
import { loadWeather, weatherFailure } from "../_shared"

export const dynamic = "force-dynamic"

const SEVERITY_RANK: Record<AgriAlert["severity"], number> = {
  extreme: 0,
  severe: 1,
  moderate: 2,
  advisory: 3,
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

  const { bundle, params, crop } = loaded
  let alerts = deriveAgriAlerts(bundle)

  const minSeverity = params.get("severity")?.trim().toLowerCase()
  if (minSeverity) {
    // hasOwnProperty, not `in`: `in` also matches inherited keys such as
    // "constructor", which would pass validation and then silently filter
    // every alert out (200 with an empty list instead of a 400).
    if (!Object.prototype.hasOwnProperty.call(SEVERITY_RANK, minSeverity)) {
      return fail("severity must be one of: advisory, moderate, severe, extreme", 400)
    }
    const threshold = SEVERITY_RANK[minSeverity as AgriAlert["severity"]]
    alerts = alerts.filter((a) => SEVERITY_RANK[a.severity] <= threshold)
  }

  const highest = alerts[0]?.severity ?? null

  return ok({
    data: {
      location: bundle.location,
      season: bundle.season,
      count: alerts.length,
      highestSeverity: highest,
      alerts,
      // Non-alert-level guidance for the same forecast window.
      farmingAdvice: getFarmingAdvisory(bundle, crop),
      forecastWindow: {
        from: bundle.daily[0]?.date ?? null,
        to: bundle.daily[bundle.daily.length - 1]?.date ?? null,
        days: bundle.daily.length,
      },
      source: bundle.source,
      fetchedAt: bundle.fetchedAt,
    },
  })
})
