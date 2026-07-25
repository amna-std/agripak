"use client"

/**
 * Weather — live Open-Meteo conditions, 7-day forecast, agricultural alerts and
 * the farming advisory, for any of the 60+ Pakistani cities the API ships.
 *
 * Data comes from GET /api/weather/{current,forecast,alerts,locations}. Nothing
 * on this page is invented: if a call fails we show the API's own message and a
 * retry, never placeholder numbers.
 *
 * Chrome (header / nav / bottom bar) belongs to components/AppShell.tsx — this
 * page renders content only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  Cloud,
  CloudRain,
  Crosshair,
  Droplets,
  Gauge,
  MapPin,
  RefreshCw,
  Search,
  Sunrise,
  Sunset,
  Thermometer,
  Volume2,
  Wind,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useLanguage } from "@/lib/contexts"
import { weatherApi } from "@/lib/api"

/* ------------------------------------------------------------------ types */

interface PakLocation {
  slug: string
  name: string
  nameUr: string
  province: string
  provinceUr: string
  lat: number
  lon: number
  agroZone: string
}

interface ResolvedLocation {
  name: string
  nameUr: string
  province: string
  provinceUr: string
  lat: number
  lon: number
  isDefault: boolean
}

interface WeatherCondition {
  code: number
  description: string
  descriptionUr: string
  icon: string
  group: string
  severe: boolean
}

interface CurrentWeather {
  temperature: number
  feelsLike: number
  humidity: number
  precipitation: number
  windSpeed: number
  windDirectionLabel: string
  pressure: number
  cloudCover: number
  weather: WeatherCondition
  units: Record<string, string>
}

interface DailyForecast {
  date: string
  dayName: string
  tempMax: number
  tempMin: number
  precipitation: number
  precipitationProbability: number | null
  windSpeedMax: number
  uvIndexMax: number | null
  sunrise: string | null
  sunset: string | null
  weather: WeatherCondition
}

interface ForecastSummary {
  days: number
  totalRainfallMm: number
  maxTempC: number | null
  minTempC: number | null
  maxWindKmh: number | null
  rainDays: number
}

interface Advisory {
  id: string
  category: string
  priority: "high" | "medium" | "low"
  title: string
  titleUr: string
  message: string
  basis: string
}

interface AgriAlert {
  id: string
  type: string
  severity: "advisory" | "moderate" | "severe" | "extreme"
  title: string
  titleUr: string
  message: string
  startDate: string
  endDate: string
  recommendations: string[]
}

/** Either a saved city slug or raw device coordinates. */
type Place = { kind: "city"; slug: string } | { kind: "coords"; lat: number; lon: number }

const PLACE_STORAGE_KEY = "agripak.weather.place"

/* -------------------------------------------------------------- utilities */

function readStoredPlace(): Place | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(PLACE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.kind === "city" && typeof parsed.slug === "string") return parsed
    if (parsed?.kind === "coords" && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) return parsed
    return null
  } catch {
    return null
  }
}

function storePlace(place: Place | null) {
  try {
    if (place) window.localStorage.setItem(PLACE_STORAGE_KEY, JSON.stringify(place))
    else window.localStorage.removeItem(PLACE_STORAGE_KEY)
  } catch {
    /* private mode — the choice just will not survive a reload */
  }
}

/** "2026-07-25T05:28" -> "05:28". Open-Meteo already returns Asia/Karachi local time. */
function clockTime(iso: string | null): string {
  if (!iso) return "—"
  const match = iso.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : "—"
}

/* ------------------------------------------------------------- page shell */

export default function WeatherPage() {
  const { t, currentLanguage, speak, formatNumber } = useLanguage()

  const [place, setPlace] = useState<Place | null>(null)
  const [placeReady, setPlaceReady] = useState(false)

  const [location, setLocation] = useState<ResolvedLocation | null>(null)
  const [current, setCurrent] = useState<CurrentWeather | null>(null)
  const [forecast, setForecast] = useState<DailyForecast[]>([])
  const [summary, setSummary] = useState<ForecastSummary | null>(null)
  const [advice, setAdvice] = useState<Advisory[]>([])
  const [alerts, setAlerts] = useState<AgriAlert[]>([])
  const [season, setSeason] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [locations, setLocations] = useState<PakLocation[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [locating, setLocating] = useState(false)

  /* -- script helpers ---------------------------------------------------- */

  const isEnglish = currentLanguage === "en"
  const scriptClass =
    currentLanguage === "ur" || currentLanguage === "pa"
      ? "font-nastaliq"
      : currentLanguage === "sd" || currentLanguage === "ps"
        ? "font-naskh"
        : ""

  /** The API ships an English and an Urdu string; pick the readable one. */
  const localise = useCallback(
    (en: string, ur: string) => (isEnglish ? en : ur || en),
    [isEnglish],
  )

  /* -- restore the farmer's saved district ------------------------------- */

  useEffect(() => {
    setPlace(readStoredPlace())
    setPlaceReady(true)
  }, [])

  /* -- the nationwide city list ------------------------------------------ */

  useEffect(() => {
    let cancelled = false
    weatherApi
      .getLocations()
      .then((res) => {
        if (cancelled || !res.success) return
        setLocations((res.data as unknown as PakLocation[]) ?? [])
      })
      .catch(() => {
        /* the picker degrades to "use my location"; the forecast itself is unaffected */
      })
    return () => {
      cancelled = true
    }
  }, [])

  /* -- the forecast itself ----------------------------------------------- */

  const requestId = useRef(0)

  // `t` changes identity whenever the language context updates. Reading it
  // through a ref keeps `load` out of that dependency chain, so switching
  // language re-renders the page instead of refetching the whole forecast.
  const tRef = useRef(t)
  tRef.current = t

  const load = useCallback(
    async (target: Place | null, mode: "initial" | "refresh") => {
      const id = ++requestId.current
      if (mode === "refresh") setRefreshing(true)
      else setLoading(true)
      setError(null)

      const params =
        target?.kind === "coords"
          ? { lat: target.lat, lon: target.lon }
          : target?.kind === "city"
            ? { city: target.slug }
            : {}

      try {
        const [cur, fc, al] = await Promise.all([
          weatherApi.getCurrent(params),
          weatherApi.getForecast({ ...params, days: 7 }),
          weatherApi.getAlerts(params),
        ])
        if (id !== requestId.current) return

        const failed = [cur, fc, al].find((r) => !r.success)
        if (failed) {
          setError(failed.message || tRef.current("weather.loadError"))
          return
        }

        const currentData = (cur.data ?? {}) as Record<string, any>
        const forecastData = (fc.data ?? {}) as Record<string, any>
        const alertData = (al.data ?? {}) as Record<string, any>

        setLocation((forecastData.location ?? currentData.location) as ResolvedLocation)
        setCurrent(currentData.current as CurrentWeather)
        setForecast((forecastData.forecast ?? []) as DailyForecast[])
        setSummary((forecastData.summary ?? null) as ForecastSummary | null)
        setAdvice((forecastData.farmingAdvice ?? []) as Advisory[])
        setAlerts((alertData.alerts ?? []) as AgriAlert[])
        setSeason((forecastData.season ?? currentData.season ?? null) as string | null)
        setFetchedAt((forecastData.fetchedAt ?? null) as string | null)
      } catch {
        if (id !== requestId.current) return
        setError(tRef.current("validation.networkError"))
      } finally {
        if (id === requestId.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    if (!placeReady) return
    load(place, "initial")
  }, [place, placeReady, load])

  /* -- picking a place --------------------------------------------------- */

  const choosePlace = useCallback((next: Place) => {
    storePlace(next)
    setPlace(next)
    setPickerOpen(false)
  }, [])

  const useMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(t("weather.locationDenied"))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        choosePlace({
          kind: "coords",
          lat: Math.round(pos.coords.latitude * 10000) / 10000,
          lon: Math.round(pos.coords.longitude * 10000) / 10000,
        })
      },
      () => {
        setLocating(false)
        setError(t("weather.locationDenied"))
      },
      { timeout: 10000, maximumAge: 300000 },
    )
  }, [choosePlace, t])

  /* -- derived ----------------------------------------------------------- */

  const tempScale = useMemo(() => {
    if (forecast.length === 0) return { min: 0, max: 1 }
    const min = Math.min(...forecast.map((d) => d.tempMin))
    const max = Math.max(...forecast.map((d) => d.tempMax))
    return { min, max: max === min ? min + 1 : max }
  }, [forecast])

  const locationLabel = location ? localise(location.name, location.nameUr) : ""
  const provinceLabel = location ? localise(location.province, location.provinceUr) : ""

  /* -- render ------------------------------------------------------------ */

  const picker = (
    <LocationPicker
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      locations={locations}
      onSelect={(loc) => choosePlace({ kind: "city", slug: loc.slug })}
      onUseMyLocation={useMyLocation}
      locating={locating}
      isEnglish={isEnglish}
      scriptClass={scriptClass}
      activeSlug={place?.kind === "city" ? place.slug : undefined}
    />
  )

  return (
    <div className="container-app space-y-5 py-4 md:max-w-5xl md:py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("weather.title")}</h1>
        <p className="text-body-sm leading-[1.7] text-muted-foreground">{t("weather.liveSource")}</p>
      </header>

      {/* Location bar — the only way to change district, present in every state. */}
      <div className="flex flex-wrap items-center gap-2">
        <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="h-auto min-h-tap flex-1 justify-between gap-2 px-3 py-2 text-start"
            >
              <span className="flex min-w-0 items-center gap-2">
                <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className={`block truncate text-base font-semibold leading-[1.8] ${scriptClass}`}>
                    {locationLabel || t("weather.selectCity")}
                  </span>
                  {provinceLabel ? (
                    <span className={`block truncate text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
                      {provinceLabel}
                    </span>
                  ) : null}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          {picker}
        </Sheet>

        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          onClick={() => load(place, "refresh")}
          disabled={loading || refreshing}
          aria-label={t("common.refresh")}
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
        </Button>
      </div>

      {loading ? (
        <WeatherSkeleton />
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <p className="font-semibold leading-[1.7]">{t("weather.loadError")}</p>
                <p className="text-body-sm leading-[1.7] text-muted-foreground">{error}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-tap" onClick={() => load(place, "refresh")}>
                <RefreshCw className="me-2 size-4" aria-hidden="true" />
                {t("common.retry")}
              </Button>
              <Button variant="outline" className="min-h-tap" onClick={() => setPickerOpen(true)}>
                <MapPin className="me-2 size-4" aria-hidden="true" />
                {t("weather.changeLocation")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {location?.isDefault ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-start gap-3 rounded-lg border border-gold/50 bg-gold-surface p-3 text-start"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
              <span className={`text-body-sm leading-[1.7] text-foreground ${scriptClass}`}>
                {t("weather.defaultLocationNotice")}
              </span>
            </button>
          ) : null}

          {current ? (
            <CurrentCard
              current={current}
              today={forecast[0] ?? null}
              season={season}
              fetchedAt={fetchedAt}
              localise={localise}
              scriptClass={scriptClass}
              t={t}
              formatNumber={formatNumber}
            />
          ) : null}

          <AlertsSection alerts={alerts} localise={localise} scriptClass={scriptClass} t={t} />

          {forecast.length > 0 ? (
            <ForecastSection
              forecast={forecast}
              summary={summary}
              scale={tempScale}
              localise={localise}
              scriptClass={scriptClass}
              t={t}
            />
          ) : null}

          <AdvisorySection
            advice={advice}
            localise={localise}
            scriptClass={scriptClass}
            speak={speak}
            t={t}
          />
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------- current weather */

function CurrentCard({
  current,
  today,
  season,
  fetchedAt,
  localise,
  scriptClass,
  t,
  formatNumber,
}: {
  current: CurrentWeather
  today: DailyForecast | null
  season: string | null
  fetchedAt: string | null
  localise: (en: string, ur: string) => string
  scriptClass: string
  t: (key: string, vars?: Record<string, string | number>) => string
  formatNumber: (value: number | string) => string
}) {
  const stats: Array<{ icon: typeof Droplets; label: string; value: string }> = [
    { icon: Droplets, label: t("weather.humidity"), value: `${formatNumber(current.humidity)}%` },
    {
      icon: Wind,
      label: t("weather.wind"),
      value: `${formatNumber(current.windSpeed)} ${current.units?.windSpeed ?? "km/h"} ${current.windDirectionLabel}`,
    },
    {
      icon: CloudRain,
      label: t("weather.rainfall"),
      value: `${formatNumber(current.precipitation)} ${current.units?.precipitation ?? "mm"}`,
    },
    { icon: Gauge, label: t("weather.pressure"), value: `${formatNumber(current.pressure)} hPa` },
    { icon: Cloud, label: t("weather.cloudCover"), value: `${formatNumber(current.cloudCover)}%` },
    {
      icon: Thermometer,
      label: t("weather.uvIndex"),
      value: today?.uvIndexMax != null ? formatNumber(Math.round(today.uvIndexMax)) : "—",
    },
  ]

  return (
    <section aria-label={t("weather.temperature")} className="overflow-hidden rounded-lg shadow-card">
      <div className="bg-sky-gradient p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="force-ltr text-6xl font-bold leading-none tracking-tight">
                {Math.round(current.temperature)}
              </span>
              <span className="text-2xl font-semibold">°C</span>
            </div>
            <p className={`mt-2 text-base font-medium leading-[1.8] ${scriptClass}`}>
              {localise(current.weather.description, current.weather.descriptionUr)}
            </p>
            <p className="text-body-sm leading-[1.7] opacity-90">
              {t("weather.feelsLike")} <span className="force-ltr">{Math.round(current.feelsLike)}°C</span>
            </p>
          </div>
          <span className="text-5xl leading-none sm:text-6xl" aria-hidden="true">
            {current.weather.icon}
          </span>
        </div>

        {today ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
            <span>
              {t("weather.high")} <span className="force-ltr font-semibold">{Math.round(today.tempMax)}°</span>
            </span>
            <span>
              {t("weather.low")} <span className="force-ltr font-semibold">{Math.round(today.tempMin)}°</span>
            </span>
            {today.precipitationProbability !== null ? (
              <span>
                {t("weather.chanceOfRain")}{" "}
                <span className="force-ltr font-semibold">{today.precipitationProbability}%</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="bg-card">
        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-card px-3 py-3">
              <dt className="flex items-center gap-1.5 text-xs leading-[1.8] text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </dt>
              <dd className="force-ltr mt-0.5 text-base font-semibold">{value}</dd>
            </div>
          ))}
        </dl>

        {today && (today.sunrise || today.sunset) ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-3 py-3 text-body-sm">
            <span className="flex items-center gap-1.5">
              <Sunrise className="size-4 shrink-0 text-gold" aria-hidden="true" />
              <span className="text-muted-foreground">{t("weather.sunrise")}</span>
              <span className="force-ltr font-semibold">{clockTime(today.sunrise)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Sunset className="size-4 shrink-0 text-gold" aria-hidden="true" />
              <span className="text-muted-foreground">{t("weather.sunset")}</span>
              <span className="force-ltr font-semibold">{clockTime(today.sunset)}</span>
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
          {season ? (
            <Badge variant="secondary" className="leading-[1.7]">
              {t("weather.season")}: {season === "Rabi" ? t("dashboard.rabi") : t("dashboard.kharif")}
            </Badge>
          ) : null}
          {fetchedAt ? (
            <span className="text-xs leading-[1.8] text-muted-foreground">
              {t("common.lastUpdated")}{" "}
              <span className="force-ltr">{new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </span>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- alerts */

const SEVERITY_STYLE: Record<AgriAlert["severity"], { wrap: string; badge: string; labelKey: string }> = {
  extreme: {
    wrap: "border-destructive bg-destructive/10",
    badge: "bg-destructive text-destructive-foreground",
    labelKey: "weather.severityExtreme",
  },
  severe: {
    wrap: "border-destructive/70 bg-destructive/5",
    badge: "bg-destructive text-destructive-foreground",
    labelKey: "weather.severitySevere",
  },
  moderate: {
    wrap: "border-warning/70 bg-warning/10",
    badge: "bg-warning text-warning-foreground",
    labelKey: "weather.severityModerate",
  },
  advisory: {
    wrap: "border-info/60 bg-info/10",
    badge: "bg-info text-info-foreground",
    labelKey: "weather.severityAdvisory",
  },
}

function AlertsSection({
  alerts,
  localise,
  scriptClass,
  t,
}: {
  alerts: AgriAlert[]
  localise: (en: string, ur: string) => string
  scriptClass: string
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  return (
    <section aria-labelledby="weather-alerts-heading" className="space-y-3">
      <h2 id="weather-alerts-heading" className="text-lg font-semibold leading-[1.7]">
        {t("weather.alerts")}
      </h2>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-body-sm leading-[1.7] text-muted-foreground">{t("weather.noAlerts")}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {alerts.map((alert) => {
            const style = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.advisory
            return (
              <li key={alert.id}>
                <details className={`rounded-lg border-2 ${style.wrap}`}>
                  <summary className="flex min-h-tap cursor-pointer list-none items-start gap-3 p-3 [&::-webkit-details-marker]:hidden">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`${style.badge} leading-[1.7]`}>{t(style.labelKey)}</Badge>
                        <span className="force-ltr text-xs text-muted-foreground">
                          {alert.startDate === alert.endDate ? alert.startDate : `${alert.startDate} → ${alert.endDate}`}
                        </span>
                      </div>
                      <p className={`text-base font-semibold leading-[1.8] ${scriptClass}`}>
                        {localise(alert.title, alert.titleUr)}
                      </p>
                    </div>
                    <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </summary>

                  <div className="space-y-3 border-t border-current/15 p-3">
                    <p dir="ltr" className="text-body-sm leading-[1.7] text-start">
                      {alert.message}
                    </p>
                    {alert.recommendations.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className={`text-body-sm font-semibold leading-[1.8] ${scriptClass}`}>
                          {t("weather.whatToDo")}
                        </p>
                        <ul dir="ltr" className="space-y-1.5 text-start">
                          {alert.recommendations.map((rec, i) => (
                            <li key={i} className="flex gap-2 text-body-sm leading-[1.7]">
                              <span aria-hidden="true" className="text-primary">
                                •
                              </span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* --------------------------------------------------------------- forecast */

function ForecastSection({
  forecast,
  summary,
  scale,
  localise,
  scriptClass,
  t,
}: {
  forecast: DailyForecast[]
  summary: ForecastSummary | null
  scale: { min: number; max: number }
  localise: (en: string, ur: string) => string
  scriptClass: string
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const span = scale.max - scale.min

  return (
    <section aria-labelledby="weather-forecast-heading" className="space-y-3">
      <h2 id="weather-forecast-heading" className="text-lg font-semibold leading-[1.7]">
        {t("weather.sevenDayForecast")}
      </h2>

      {summary ? (
        <div className="scroll-x no-scrollbar -mx-4 flex gap-2 px-4 pb-1">
          {[
            { label: t("weather.rainThisWeek"), value: `${summary.totalRainfallMm} mm` },
            { label: t("weather.rainyDays"), value: String(summary.rainDays) },
            { label: t("weather.hottest"), value: summary.maxTempC !== null ? `${summary.maxTempC}°C` : "—" },
            { label: t("weather.coldest"), value: summary.minTempC !== null ? `${summary.minTempC}°C` : "—" },
            {
              label: t("weather.strongestWind"),
              value: summary.maxWindKmh !== null ? `${summary.maxWindKmh} km/h` : "—",
            },
          ].map((stat) => (
            <div key={stat.label} className="min-w-[7.5rem] shrink-0 rounded-lg border border-border bg-card p-3">
              <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>{stat.label}</p>
              <p className="force-ltr mt-0.5 text-lg font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <ul className="divide-y divide-border">
          {forecast.map((day, index) => {
            const left = ((day.tempMin - scale.min) / span) * 100
            const width = Math.max(((day.tempMax - day.tempMin) / span) * 100, 6)
            return (
              <li key={day.date} className="flex items-center gap-2 px-3 py-2.5 xs:gap-3">
                <div className="w-16 shrink-0 xs:w-[4.5rem]">
                  <p className="truncate text-body-sm font-semibold leading-[1.8]">
                    {index === 0 ? t("common.today") : day.dayName.slice(0, 3)}
                  </p>
                  <p className="force-ltr truncate text-xs leading-[1.8] text-muted-foreground">
                    {day.date.slice(5)}
                  </p>
                </div>

                <span
                  className="w-7 shrink-0 text-center text-xl leading-none"
                  role="img"
                  aria-label={localise(day.weather.description, day.weather.descriptionUr)}
                >
                  {day.weather.icon}
                </span>

                <div className="w-11 shrink-0">
                  {day.precipitationProbability !== null && day.precipitationProbability > 0 ? (
                    <span className="force-ltr text-xs font-medium text-info">{day.precipitationProbability}%</span>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="force-ltr w-8 shrink-0 text-end text-body-sm text-muted-foreground">
                    {Math.round(day.tempMin)}°
                  </span>
                  <div className="h-2 min-w-[2rem] flex-1 rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-info to-gold"
                      style={{ marginInlineStart: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                  <span className="force-ltr w-8 shrink-0 text-body-sm font-semibold">{Math.round(day.tempMax)}°</span>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}

/* --------------------------------------------------------------- advisory */

const PRIORITY_STYLE: Record<Advisory["priority"], { dot: string; labelKey: string }> = {
  high: { dot: "bg-destructive", labelKey: "weather.priorityHigh" },
  medium: { dot: "bg-warning", labelKey: "weather.priorityMedium" },
  low: { dot: "bg-primary", labelKey: "weather.priorityLow" },
}

function AdvisorySection({
  advice,
  localise,
  scriptClass,
  speak,
  t,
}: {
  advice: Advisory[]
  localise: (en: string, ur: string) => string
  scriptClass: string
  speak: (text: string) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  if (advice.length === 0) return null

  return (
    <section aria-labelledby="weather-advisory-heading" className="space-y-3">
      <h2 id="weather-advisory-heading" className="text-lg font-semibold leading-[1.7]">
        {t("weather.advisory")}
      </h2>

      <ul className="space-y-3">
        {advice.map((item) => {
          const style = PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.low
          return (
            <li key={item.id}>
              <Card className="border-s-accent">
                <CardHeader className="space-y-2 p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
                    <span className="text-xs font-medium uppercase leading-[1.8] tracking-wide text-muted-foreground">
                      {t(style.labelKey)}
                    </span>
                  </div>
                  <CardTitle className={`text-base leading-[1.8] ${scriptClass}`}>
                    {localise(item.title, item.titleUr)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-3 pt-0">
                  <p dir="ltr" className="text-body-sm leading-[1.7] text-start">
                    {item.message}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p dir="ltr" className="text-xs leading-[1.7] text-start text-muted-foreground">
                      {t("weather.basedOn")}: {item.basis}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-tap gap-1.5 px-2"
                      onClick={() => speak(`${localise(item.title, item.titleUr)}. ${item.message}`)}
                    >
                      <Volume2 className="size-4" aria-hidden="true" />
                      <span className={scriptClass}>{t("weather.listen")}</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* -------------------------------------------------------- location picker */

function LocationPicker({
  open,
  onOpenChange,
  locations,
  onSelect,
  onUseMyLocation,
  locating,
  isEnglish,
  scriptClass,
  activeSlug,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: PakLocation[]
  onSelect: (loc: PakLocation) => void
  onUseMyLocation: () => void
  locating: boolean
  isEnglish: boolean
  scriptClass: string
  activeSlug?: string
}) {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const [province, setProvince] = useState<string>("")

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const provinces = useMemo(() => {
    const seen: string[] = []
    for (const loc of locations) if (!seen.includes(loc.province)) seen.push(loc.province)
    return seen
  }, [locations])

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = locations.filter((loc) => {
      if (province && loc.province !== province) return false
      if (!needle) return true
      return (
        loc.name.toLowerCase().includes(needle) ||
        loc.slug.includes(needle) ||
        loc.nameUr.includes(query.trim())
      )
    })

    const groups: Array<{ province: string; provinceUr: string; items: PakLocation[] }> = []
    for (const loc of matched) {
      let group = groups.find((g) => g.province === loc.province)
      if (!group) {
        group = { province: loc.province, provinceUr: loc.provinceUr, items: [] }
        groups.push(group)
      }
      group.items.push(loc)
    }
    return groups
  }, [locations, province, query])

  return (
    <SheetContent side="bottom" className="flex h-[85vh] flex-col gap-0 p-0">
      <SheetHeader className="space-y-3 border-b border-border p-4 text-start">
        <SheetTitle className="text-start text-lg leading-[1.7]">{t("weather.selectCity")}</SheetTitle>

        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("weather.searchCity")}
            className="h-11 ps-9 pe-9 text-base"
            aria-label={t("weather.searchCity")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("common.reset")}
              className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="min-h-tap w-full justify-start gap-2"
          onClick={onUseMyLocation}
          disabled={locating}
        >
          <Crosshair className={`size-4 ${locating ? "animate-pulse" : ""}`} aria-hidden="true" />
          <span className={scriptClass}>{locating ? t("weather.locating") : t("weather.useMyLocation")}</span>
        </Button>

        <div className="scroll-x no-scrollbar -mx-4 flex gap-2 px-4 pb-1">
          <ProvinceChip label={t("weather.allProvinces")} active={province === ""} onClick={() => setProvince("")} />
          {provinces.map((p) => (
            <ProvinceChip key={p} label={p} active={province === p} onClick={() => setProvince(p)} />
          ))}
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {grouped.length === 0 ? (
          <p className="p-6 text-center text-body-sm leading-[1.7] text-muted-foreground">{t("weather.noCityFound")}</p>
        ) : (
          grouped.map((group) => (
            <div key={group.province}>
              <h3 className="sticky top-0 z-10 bg-muted px-4 py-1.5 text-xs font-semibold uppercase leading-[1.8] tracking-wide text-muted-foreground">
                {isEnglish ? group.province : group.provinceUr}
              </h3>
              <ul>
                {group.items.map((loc) => (
                  <li key={loc.slug}>
                    <button
                      type="button"
                      onClick={() => onSelect(loc)}
                      className={`flex min-h-tap w-full items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-start ${
                        activeSlug === loc.slug ? "bg-primary/10" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className={`block truncate text-base leading-[1.8] ${isEnglish ? "" : scriptClass}`}>
                          {isEnglish ? loc.name : loc.nameUr}
                        </span>
                        <span className="block truncate text-xs leading-[1.8] text-muted-foreground">
                          {isEnglish ? loc.agroZone.replace(/-/g, " ") : loc.name}
                        </span>
                      </span>
                      {activeSlug === loc.slug ? (
                        <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </SheetContent>
  )
}

function ProvinceChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-body-sm leading-[1.7] ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
      }`}
    >
      {label}
    </button>
  )
}

/* --------------------------------------------------------------- skeleton */

function WeatherSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  )
}
