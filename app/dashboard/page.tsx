"use client"

/**
 * AgriPak dashboard — the farmer's home screen.
 *
 * Every figure on this page comes from a live API call:
 *   GET /api/user/dashboard   profile, farm, season, activity
 *   GET /api/weather/current  today's conditions + farming advisory (server
 *                             resolves the signed-in farmer's own district)
 *   GET /api/market/prices    AMIS mandi rates, PKR per 100 kg
 *   GET /api/schemes          real Pakistani government schemes
 *   GET /api/community/feed   recent posts
 *
 * Nothing is invented. Each block loads independently, shows a skeleton while
 * it waits, and states plainly when it has nothing or when it failed — an
 * empty section is honest, a made-up number is not.
 *
 * Navigation lives in components/AppShell.tsx; this page renders content only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CloudSun,
  Droplets,
  Landmark,
  MapPin,
  MessageSquare,
  RefreshCw,
  ScanLine,
  ShoppingCart,
  Sprout,
  TrendingDown,
  TrendingUp,
  Users,
  Volume2,
  Wind,
} from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { communityApi, marketApi, schemesApi, userApi, weatherApi } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"

/* ------------------------------------------------------------------ types */

type Status = "loading" | "ready" | "error"

interface Block<T> {
  status: Status
  data: T | null
  message?: string
}

const pending = <T,>(): Block<T> => ({ status: "loading", data: null })

interface DashboardPayload {
  profile: {
    name?: string
    district?: string
    village?: string
    province?: string
    landSize?: { value?: number; unit?: string } | null
    profileCompleteness?: number
    points?: number
    level?: number
  }
  farming: {
    season?: string
    currentCrops?: Array<{ cropName?: string; area?: number; stage?: string }>
    totalSeasons?: number
  }
  activity: { memberSince?: string | null }
}

interface WeatherPayload {
  location: { name?: string; nameUr?: string; province?: string; isDefault?: boolean }
  current: {
    temperature?: number
    feelsLike?: number
    humidity?: number
    windSpeed?: number
    weather?: { description?: string; descriptionUr?: string; icon?: string }
  }
  today?: { tempMax?: number; tempMin?: number; precipitation?: number; precipitationProbability?: number } | null
  season?: string
  farmingAdvice?: Array<{
    id: string
    category: string
    priority: string
    title: string
    titleUr?: string
    message: string
  }>
}

interface PriceRow {
  cropName?: string
  variety?: string
  market?: { name?: string; district?: string }
  prices?: { modal?: number; minimum?: number; maximum?: number; average?: number }
  trend?: { direction?: string; percentage?: number }
}

interface SchemeRow {
  id: string
  name: string
  nameUr?: string
  category?: string
  benefitAmount?: number
  status?: string
}

interface PostRow {
  _id: string
  title?: string
  content?: string
  author?: { name?: string; district?: string }
  commentCount?: number
  createdAt?: string
}

/* -------------------------------------------------------------- utilities */

/** AMIS reports crop names in English; translate the ones we have keys for. */
const CROP_KEYS: Record<string, string> = {
  wheat: "crops.wheat",
  rice: "crops.rice",
  basmati: "crops.basmati",
  irri: "crops.irri",
  cotton: "crops.cotton",
  sugarcane: "crops.sugarcane",
  maize: "crops.maize",
  potato: "crops.potato",
  onion: "crops.onion",
  tomato: "crops.tomato",
  chickpea: "crops.chickpea",
  gram: "crops.chickpea",
  mustard: "crops.mustard",
  mango: "crops.mango",
  citrus: "crops.citrus",
  kinnow: "crops.citrus",
  dates: "crops.dates",
}

function greetingKey(hour: number): "dashboard.goodMorning" | "dashboard.goodAfternoon" | "dashboard.goodEvening" {
  if (hour < 12) return "dashboard.goodMorning"
  if (hour < 17) return "dashboard.goodAfternoon"
  return "dashboard.goodEvening"
}

/* ------------------------------------------------------------- page shell */

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { t, currentLanguage, formatCurrency, formatNumber, speak, stopSpeaking, voiceEnabled, toggleVoice } =
    useLanguage()

  const [summary, setSummary] = useState<Block<DashboardPayload>>(pending)
  const [weather, setWeather] = useState<Block<WeatherPayload>>(pending)
  const [prices, setPrices] = useState<Block<{ rows: PriceRow[]; source?: string }>>(pending)
  const [schemes, setSchemes] = useState<Block<SchemeRow[]>>(pending)
  const [posts, setPosts] = useState<Block<PostRow[]>>(pending)
  const [speaking, setSpeaking] = useState(false)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stopSpeaking()
    }
  }, [stopSpeaking])

  /* ---- auth guard ---- */
  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth/login")
  }, [authLoading, user, router])

  /* ---- data ---- */
  const loadAll = useCallback(async () => {
    setSummary(pending)
    setWeather(pending)
    setPrices(pending)
    setSchemes(pending)
    setPosts(pending)

    const fail = (message?: string) => ({ status: "error" as const, data: null, message })

    // Every call is independent: a dead mandi scrape must not blank the weather.
    void userApi
      .getDashboard()
      .then((res) => {
        if (!mounted.current) return
        if (res.success && res.data) setSummary({ status: "ready", data: res.data as unknown as DashboardPayload })
        else setSummary(fail(res.message))
      })
      .catch(() => mounted.current && setSummary(fail()))

    void weatherApi
      .getCurrent()
      .then((res) => {
        if (!mounted.current) return
        if (res.success && res.data) setWeather({ status: "ready", data: res.data as unknown as WeatherPayload })
        else setWeather(fail(res.message))
      })
      .catch(() => mounted.current && setWeather(fail()))

    void marketApi
      .getPrices({ limit: 5 })
      .then((res) => {
        if (!mounted.current) return
        if (res.success) setPrices({ status: "ready", data: { rows: res.prices ?? [], source: res.source } })
        else setPrices(fail(res.message))
      })
      .catch(() => mounted.current && setPrices(fail()))

    void schemesApi
      .list({ limit: 3, status: "active" })
      .then((res) => {
        if (!mounted.current) return
        if (res.success) setSchemes({ status: "ready", data: (res.data?.schemes as SchemeRow[]) ?? [] })
        else setSchemes(fail(res.message))
      })
      .catch(() => mounted.current && setSchemes(fail()))

    void communityApi
      .getFeed({ limit: 3 })
      .then((res) => {
        if (!mounted.current) return
        if (res.success) setPosts({ status: "ready", data: (res.data as PostRow[]) ?? [] })
        else setPosts(fail(res.message))
      })
      .catch(() => mounted.current && setPosts(fail()))
  }, [])

  useEffect(() => {
    if (!user) return
    void loadAll()
  }, [user, loadAll])

  /* ---- speech ---- */
  const cropLabel = useCallback(
    (raw?: string) => {
      if (!raw) return ""
      const key = CROP_KEYS[raw.trim().toLowerCase().split(" ")[0]] ?? CROP_KEYS[raw.trim().toLowerCase()]
      return key ? t(key) : raw
    },
    [t],
  )

  const spokenSummary = useMemo(() => {
    const profile = summary.data?.profile
    const w = weather.data
    if (!profile || !w?.current) return ""
    const condition =
      (currentLanguage === "en" ? w.current.weather?.description : w.current.weather?.descriptionUr) ??
      w.current.weather?.description ??
      ""
    const line = t("dashboard.spokenSummary", {
      greeting: t(greetingKey(new Date().getHours())),
      name: profile.name ?? "",
      district: (currentLanguage === "en" ? w.location?.name : w.location?.nameUr) ?? profile.district ?? "",
      temp: Math.round(w.current.temperature ?? 0),
      condition,
    })
    const advice = w.farmingAdvice?.[0]
    const adviceLine = advice ? (currentLanguage === "en" ? advice.title : (advice.titleUr ?? advice.title)) : ""
    return adviceLine ? `${line} ${adviceLine}.` : line
  }, [summary.data, weather.data, currentLanguage, t])

  // speechSynthesis has no reliable "done" event across Android browsers, so we
  // poll while speaking to put the button back to its idle state.
  useEffect(() => {
    if (!speaking) return
    const id = window.setInterval(() => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return
      if (!window.speechSynthesis.speaking) setSpeaking(false)
    }, 700)
    return () => window.clearInterval(id)
  }, [speaking])

  const onListen = useCallback(async () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    if (!spokenSummary) return
    if (!voiceEnabled) await toggleVoice()
    speak(spokenSummary)
    setSpeaking(true)
  }, [speaking, spokenSummary, voiceEnabled, toggleVoice, speak, stopSpeaking])

  /* ---- derived ---- */
  const profile = summary.data?.profile
  const displayName = profile?.name ?? user?.name ?? ""
  const district = profile?.district ?? user?.district ?? ""
  const province = profile?.province ?? user?.state ?? ""
  const season = summary.data?.farming?.season ?? weather.data?.season ?? ""
  const seasonLabel = season ? t(season.toLowerCase() === "rabi" ? "dashboard.rabi" : "dashboard.kharif") : ""
  const completeness = profile?.profileCompleteness ?? 0

  if (authLoading || !user) {
    return (
      <div className="container-app space-y-4 py-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="container-app space-y-5 py-4 sm:py-6 lg:max-w-6xl">
      {/* ------------------------------------------------------- greeting */}
      <section className="overflow-hidden rounded-2xl bg-brand-gradient p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-[1.9] text-primary-foreground/80">
              {t(greetingKey(new Date().getHours()))}
            </p>
            {summary.status === "loading" ? (
              <Skeleton className="mt-1 h-8 w-48 bg-white/20" />
            ) : (
              // dir="auto" so a Latin name reads left-to-right inside an RTL
              // page; break-normal so it never splits mid-word.
              <h1
                dir="auto"
                className="mt-0.5 break-normal text-2xl font-bold leading-[1.6] text-primary-foreground sm:text-3xl"
              >
                {displayName}
              </h1>
            )}
            {(district || province) && (
              <p className="mt-1 flex items-center gap-1.5 text-sm leading-[1.9] text-primary-foreground/90">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                <span dir="auto" className="leading-[1.9]">{[district, province].filter(Boolean).join(", ")}</span>
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {seasonLabel && (
              <Badge className="border-white/25 bg-white/15 text-primary-foreground hover:bg-white/25">
                <span className="leading-[1.8]">{seasonLabel}</span>
              </Badge>
            )}
            <Button
              type="button"
              onClick={onListen}
              disabled={!spokenSummary}
              aria-label={t("dashboard.readSummary")}
              aria-pressed={speaking}
              className="tap-target rounded-full border border-white/25 bg-white/15 text-primary-foreground hover:bg-white/25 disabled:opacity-40"
              size="icon"
              variant="ghost"
            >
              <Volume2 className={`h-5 w-5 ${speaking ? "animate-pulse" : ""}`} aria-hidden />
            </Button>
            <Button
              type="button"
              onClick={() => void loadAll()}
              aria-label={t("common.refresh")}
              className="tap-target rounded-full border border-white/25 bg-white/15 text-primary-foreground hover:bg-white/25"
              size="icon"
              variant="ghost"
            >
              <RefreshCw className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </div>

        {summary.status === "error" && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-white/15 p-2 text-sm leading-[1.9] text-primary-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {summary.message || t("dashboard.loadFailed")}
          </p>
        )}
      </section>

      {/* -------------------------------------------------- quick actions */}
      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="sr-only">
          {t("dashboard.quickActions")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction href="/crop-scan" icon={ScanLine} label={t("dashboard.scanCrop")} />
          <QuickAction href="/ai-assistant" icon={Bot} label={t("dashboard.askAi")} />
          <QuickAction href="/weather" icon={CloudSun} label={t("nav.weather")} />
          <QuickAction href="/marketplace" icon={ShoppingCart} label={t("nav.marketplace")} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/* ----------------------------------------------------- weather */}
          <Card>
            <SectionHeader
              icon={CloudSun}
              title={t("dashboard.todaysWeather")}
              href="/weather"
              linkLabel={t("common.viewAll")}
              t={t}
            />
            <CardContent className="pt-0">
              {weather.status === "loading" && <Skeleton className="h-40 w-full rounded-xl" />}

              {weather.status === "error" && (
                <ErrorNote message={weather.message || t("dashboard.sectionFailed")} onRetry={() => void loadAll()} t={t} />
              )}

              {weather.status === "ready" && weather.data && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-4xl leading-none" aria-hidden>
                      {weather.data.current?.weather?.icon ?? "🌤️"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-3xl font-bold leading-[1.4] text-foreground force-ltr">
                        {formatNumber(Math.round(weather.data.current?.temperature ?? 0))}
                        {t("units.celsius")}
                      </p>
                      <p className="text-sm leading-[1.9] text-muted-foreground">
                        {(currentLanguage === "en"
                          ? weather.data.current?.weather?.description
                          : weather.data.current?.weather?.descriptionUr) ??
                          weather.data.current?.weather?.description}
                      </p>
                    </div>
                    <div className="ms-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5 leading-[1.9]">
                        <Droplets className="h-4 w-4 shrink-0" aria-hidden />
                        {formatNumber(weather.data.current?.humidity ?? 0)}
                        {t("units.percent")}
                      </span>
                      <span className="flex items-center gap-1.5 leading-[1.9]">
                        <Wind className="h-4 w-4 shrink-0" aria-hidden />
                        {formatNumber(Math.round(weather.data.current?.windSpeed ?? 0))} {t("units.kmh")}
                      </span>
                    </div>
                  </div>

                  {weather.data.location?.isDefault && (
                    <p className="rounded-lg bg-accent p-2 text-sm leading-[1.9] text-accent-foreground">
                      {t("weather.defaultLocationNotice")}
                    </p>
                  )}

                  {(weather.data.farmingAdvice?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold leading-[1.8] text-foreground">
                        {t("dashboard.whatToDoToday")}
                      </h3>
                      <ul className="space-y-2">
                        {weather.data.farmingAdvice!.slice(0, 2).map((advice) => (
                          <li key={advice.id} className="border-s-accent rounded-lg bg-muted/60 p-3">
                            <p className="text-sm font-semibold leading-[1.9] text-foreground">
                              {currentLanguage === "en" ? advice.title : (advice.titleUr ?? advice.title)}
                            </p>
                            <p className="mt-1 text-sm leading-[1.9] text-muted-foreground">{advice.message}</p>
                          </li>
                        ))}
                      </ul>
                      <Link
                        href="/weather"
                        className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold leading-[1.9] text-primary hover:underline"
                      >
                        {t("dashboard.moreAdvice")}
                        <ArrowRight className="flip-rtl h-4 w-4" aria-hidden />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------------------ market */}
          <Card>
            <SectionHeader
              icon={TrendingUp}
              title={district ? t("dashboard.pricesNear", { district }) : t("dashboard.pricesNationwide")}
              href="/market"
              linkLabel={t("common.viewAll")}
              t={t}
            />
            <CardContent className="pt-0">
              {prices.status === "loading" && (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              )}

              {prices.status === "error" && (
                <ErrorNote message={prices.message || t("dashboard.sectionFailed")} onRetry={() => void loadAll()} t={t} />
              )}

              {prices.status === "ready" && (prices.data?.rows.length ?? 0) === 0 && (
                <EmptyNote message={t("market.noPrices")} />
              )}

              {prices.status === "ready" && (prices.data?.rows.length ?? 0) > 0 && (
                <>
                  {prices.data?.source === "sample" && <span className="badge-sample mb-2">{t("common.sampleData")}</span>}
                  {prices.data?.source === "cache" && (
                    <p className="mb-2 text-xs leading-[1.9] text-muted-foreground">{t("market.cachedNotice")}</p>
                  )}
                  <ul className="divide-y divide-border">
                    {prices.data!.rows.map((row, index) => {
                      const up = row.trend?.direction === "rising"
                      const down = row.trend?.direction === "falling"
                      return (
                        <li
                          key={`${row.cropName}-${row.market?.name}-${index}`}
                          className="flex items-center justify-between gap-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold leading-[1.9] text-foreground">
                              {cropLabel(row.cropName)}
                            </p>
                            <p className="truncate text-xs leading-[1.9] text-muted-foreground">
                              {row.market?.name} · {t("market.per100kg")}
                            </p>
                          </div>
                          <div className="shrink-0 text-end">
                            <p className="text-sm font-bold leading-[1.9] text-foreground force-ltr">
                              {formatCurrency(row.prices?.modal ?? row.prices?.average ?? null)}
                            </p>
                            {(up || down) && (
                              <p
                                className={`flex items-center justify-end gap-1 text-xs leading-[1.9] ${
                                  up ? "text-price-up" : "text-price-down"
                                }`}
                              >
                                {up ? (
                                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                                ) : (
                                  <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                                )}
                                <span className="force-ltr">{formatNumber(row.trend?.percentage ?? 0)}%</span>
                              </p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          {/* --------------------------------------------------- community */}
          <Card>
            <SectionHeader
              icon={Users}
              title={t("dashboard.fromCommunity")}
              href="/community"
              linkLabel={t("common.viewAll")}
              t={t}
            />
            <CardContent className="pt-0">
              {posts.status === "loading" && (
                <div className="space-y-2">
                  {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              )}
              {posts.status === "error" && (
                <ErrorNote message={posts.message || t("dashboard.sectionFailed")} onRetry={() => void loadAll()} t={t} />
              )}
              {posts.status === "ready" && (posts.data?.length ?? 0) === 0 && <EmptyNote message={t("community.noPosts")} />}
              {posts.status === "ready" && (posts.data?.length ?? 0) > 0 && (
                <ul className="divide-y divide-border">
                  {posts.data!.map((post) => (
                    <li key={post._id} className="py-3">
                      <Link href="/community" className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <p className="text-sm font-semibold leading-[1.9] text-foreground">{post.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs leading-[1.9] text-muted-foreground">
                          <span>{post.author?.name}</span>
                          {post.author?.district && <span>· {post.author.district}</span>}
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                            {formatNumber(post.commentCount ?? 0)}
                          </span>
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------------------------------------------------- side column */}
        <div className="min-w-0 space-y-5">
          {/* ------------------------------------------------ farm snapshot */}
          <Card>
            <SectionHeader icon={Sprout} title={t("dashboard.farmSnapshot")} t={t} />
            <CardContent className="space-y-4 pt-0">
              {summary.status === "loading" && <Skeleton className="h-36 w-full rounded-xl" />}
              {summary.status === "error" && (
                <ErrorNote message={summary.message || t("dashboard.loadFailed")} onRetry={() => void loadAll()} t={t} />
              )}
              {summary.status === "ready" && profile && (
                <>
                  <dl className="grid grid-cols-2 gap-3">
                    <Stat
                      label={t("dashboard.landRegistered")}
                      value={
                        profile.landSize?.value
                          ? `${formatNumber(profile.landSize.value)} ${t(
                              profile.landSize.unit === "hectares" ? "units.hectare" : "units.acre",
                            )}`
                          : t("profile.notSet")
                      }
                    />
                    <Stat label={t("dashboard.currentSeason")} value={seasonLabel || t("common.noData")} />
                  </dl>

                  <div>
                    <h3 className="text-sm font-semibold leading-[1.8] text-foreground">
                      {t("dashboard.cropsInGround")}
                    </h3>
                    {(summary.data?.farming?.currentCrops?.length ?? 0) > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {summary.data!.farming.currentCrops!.map((crop, index) => (
                          <li key={`${crop.cropName}-${index}`}>
                            <Badge variant="secondary" className="leading-[1.8]">
                              {cropLabel(crop.cropName)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm leading-[1.9] text-muted-foreground">
                        {t("dashboard.noCurrentCrops")} {t("dashboard.addCropsHint")}
                      </p>
                    )}
                  </div>

                  {completeness < 100 && (
                    <div className="rounded-xl border border-border bg-muted/50 p-3">
                      <p className="text-sm font-semibold leading-[1.9] text-foreground">
                        {t("dashboard.completeProfile")}
                      </p>
                      <Progress value={completeness} className="mt-2 h-2" />
                      <p className="mt-2 text-xs leading-[1.9] text-muted-foreground">
                        {t("dashboard.completeProfileHint", { percent: formatNumber(completeness) })}
                      </p>
                      <Button asChild size="sm" className="mt-3 min-h-[44px] w-full">
                        <Link href="/profile">{t("profile.title")}</Link>
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* ----------------------------------------------------- schemes */}
          <Card>
            <SectionHeader
              icon={Landmark}
              title={t("dashboard.schemesForYou")}
              href="/schemes"
              linkLabel={t("common.viewAll")}
              t={t}
            />
            <CardContent className="pt-0">
              {schemes.status === "loading" && (
                <div className="space-y-2">
                  {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              )}
              {schemes.status === "error" && (
                <ErrorNote message={schemes.message || t("dashboard.sectionFailed")} onRetry={() => void loadAll()} t={t} />
              )}
              {schemes.status === "ready" && (schemes.data?.length ?? 0) === 0 && (
                <EmptyNote message={t("schemes.noSchemes")} />
              )}
              {schemes.status === "ready" && (schemes.data?.length ?? 0) > 0 && (
                <ul className="space-y-3">
                  {schemes.data!.map((scheme) => (
                    <li key={scheme.id}>
                      <Link
                        href={`/schemes/${scheme.id}`}
                        className="block rounded-xl border border-border p-3 transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <p className="text-sm font-semibold leading-[1.9] text-foreground">
                          {currentLanguage === "en" ? scheme.name : (scheme.nameUr ?? scheme.name)}
                        </p>
                        {typeof scheme.benefitAmount === "number" && scheme.benefitAmount > 0 && (
                          <p className="mt-1 text-sm font-bold leading-[1.9] text-primary force-ltr">
                            {formatCurrency(scheme.benefitAmount, { compact: true })}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ subcomponents */

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof ScanLine
  label: string
}) {
  return (
    <Link
      href={href}
      className="card-hover flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-xs font-semibold leading-[1.8] text-foreground">{label}</span>
    </Link>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  href,
  linkLabel,
  t,
}: {
  icon: typeof ScanLine
  title: string
  href?: string
  linkLabel?: string
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
      <CardTitle className="flex min-w-0 items-center gap-2 text-base leading-[1.8]">
        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span className="truncate leading-[1.8]">{title}</span>
      </CardTitle>
      {href && (
        <Link
          href={href}
          className="tap-target shrink-0 gap-1 whitespace-nowrap px-1 text-sm font-semibold leading-[1.9] text-primary hover:underline"
        >
          {linkLabel ?? t("common.viewAll")}
          <ArrowRight className="flip-rtl h-4 w-4" aria-hidden />
        </Link>
      )}
    </CardHeader>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <dt className="text-xs leading-[1.9] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold leading-[1.9] text-foreground">{value}</dd>
    </div>
  )
}

function EmptyNote({ message }: { message: string }) {
  return <p className="py-4 text-sm leading-[1.9] text-muted-foreground">{message}</p>
}

function ErrorNote({
  message,
  onRetry,
  t,
}: {
  message: string
  onRetry: () => void
  t: (key: string) => string
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <p className="flex items-start gap-2 text-sm leading-[1.9] text-foreground">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        {message}
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-2 min-h-[44px]" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  )
}
