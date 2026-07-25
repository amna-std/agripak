"use client"

/**
 * Crop guidance — the Pakistani Rabi/Kharif calendar plus a browsable crop guide.
 *
 * Data comes from the crops API:
 *
 *   GET /api/crops/calendar?province=  → what to sow and harvest this month,
 *                                        field activities, seasonal tips
 *   GET /api/crops?season=&category=   → the crop guide
 *
 * Nothing here is invented: if a call fails the API's own message is shown with
 * a retry, never placeholder content.
 *
 * Chrome (header / nav / bottom bar) belongs to components/AppShell.tsx.
 */

import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Leaf,
  Lightbulb,
  ListChecks,
  RefreshCw,
  Scissors,
  Search,
  Sprout,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/lib/contexts"
import { cropsApi } from "@/lib/api"

/* ------------------------------------------------------------------ types */

interface CalendarCrop {
  cropId: string
  name: string
  nameUr?: string
  category?: string
  season?: string
  region?: string
  regionUr?: string
  note?: string
}

interface MonthEntry {
  month: number
  name: string
  nameUr?: string
  season?: string
  sow: CalendarCrop[]
  harvest: CalendarCrop[]
}

interface CalendarData {
  province?: string
  currentSeason?: string
  month?: { number: number; name: string; nameUr?: string }
  thisMonth?: {
    sow: CalendarCrop[]
    harvest: CalendarCrop[]
    activities: string[]
    tips: string[]
  }
  months?: MonthEntry[]
  advisory?: string
}

interface CropSummary {
  id: string
  name: string
  nameUr?: string
  category?: string
  season?: string
  summary?: string
  summaryUr?: string
  durationDays?: number
  provinces?: string[]
}

interface CropFilters {
  seasons?: { id: string; name: string; nameUr?: string; window?: string }[]
  categories?: string[]
  provinces?: string[]
  currentSeason?: string
}

/* --------------------------------------------------------------- fragments */

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Leaf
  title: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base leading-[1.5]">
          <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function CropChips({ crops, empty }: { crops: CalendarCrop[]; empty: string }) {
  const { isRTL } = useLanguage()
  if (!crops.length) {
    return <p className="text-sm leading-[1.8] text-muted-foreground">{empty}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {crops.map((c) => (
        <Link
          key={`${c.cropId}-${c.name}`}
          href={`/crop-advisor/${c.cropId}`}
          className="min-h-tap flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium leading-[1.7]">
              {isRTL && c.nameUr ? c.nameUr : c.name}
            </span>
            {c.region && (
              <span className="block truncate text-xs leading-[1.8] text-muted-foreground">
                {isRTL && c.regionUr ? c.regionUr : c.region}
              </span>
            )}
          </span>
          <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground ${isRTL ? "rotate-180" : ""}`} aria-hidden />
        </Link>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- page */

export default function CropGuidancePage() {
  const { t, isRTL } = useLanguage()

  const [calendar, setCalendar] = useState<CalendarData | null>(null)
  const [crops, setCrops] = useState<CropSummary[]>([])
  const [filters, setFilters] = useState<CropFilters>({})
  const [province, setProvince] = useState<string>("")
  const [season, setSeason] = useState<string>("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [calRes, cropRes] = await Promise.all([
        cropsApi.getCalendar(province ? { province } : undefined),
        cropsApi.list(season ? { season } : undefined),
      ])
      const cal: any = (calRes as any)?.data ?? calRes
      const cr: any = (cropRes as any)?.data ?? cropRes
      setCalendar(cal ?? null)
      setCrops(cr?.crops ?? [])
      setFilters(cr?.filters ?? {})
    } catch (err: any) {
      setError(err?.message || t("crops.loadError"))
    } finally {
      setLoading(false)
    }
  }, [province, season, t])

  useEffect(() => {
    load()
  }, [load])

  const visibleCrops = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return crops
    return crops.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.nameUr?.includes(search.trim()) ||
        c.category?.toLowerCase().includes(q),
    )
  }, [crops, search])

  const thisMonth = calendar?.thisMonth
  const monthLabel = isRTL && calendar?.month?.nameUr ? calendar.month.nameUr : calendar?.month?.name

  /* ------------------------------------------------------------- loading */

  if (loading && !calendar) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  /* --------------------------------------------------------------- error */

  if (error && !calendar) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="text-sm leading-[1.8] text-muted-foreground">{error}</p>
            <Button onClick={load} className="min-h-tap gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* -------------------------------------------------------------- content */

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold leading-[1.35]">
          <Sprout className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          {t("crops.guidance")}
        </h1>
        <div className="rule-gold mt-2 w-12" />
        <p className="mt-3 text-sm leading-[1.8] text-muted-foreground">{t("crops.guidanceSubtitle")}</p>
      </header>

      {/* season + province context */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Badge className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {t("crops.currentSeason")}:{" "}
            {calendar?.currentSeason === "rabi"
              ? t("crops.rabi")
              : calendar?.currentSeason === "kharif"
                ? t("crops.kharif")
                : calendar?.currentSeason}
          </Badge>
          {monthLabel && <Badge variant="outline">{monthLabel}</Badge>}

          <div className="flex-1" />

          <select
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            aria-label={t("crops.province")}
            className="min-h-tap rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("crops.allPakistan")}</option>
            {(filters.provinces ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            aria-label={t("crops.season")}
            className="min-h-tap rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("crops.allSeasons")}</option>
            {(filters.seasons ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {isRTL && s.nameUr ? s.nameUr : s.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Tabs defaultValue="month" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="month" className="min-h-tap">
            {t("crops.thisMonth")}
          </TabsTrigger>
          <TabsTrigger value="guide" className="min-h-tap">
            {t("crops.cropGuide")}
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------- this month */}
        <TabsContent value="month" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel icon={Sprout} title={t("crops.sowThisMonth")}>
              <CropChips crops={thisMonth?.sow ?? []} empty={t("crops.nothingThisMonth")} />
            </Panel>
            <Panel icon={Scissors} title={t("crops.harvestThisMonth")}>
              <CropChips crops={thisMonth?.harvest ?? []} empty={t("crops.nothingThisMonth")} />
            </Panel>
          </div>

          {thisMonth?.activities?.length ? (
            <Panel icon={ListChecks} title={t("crops.fieldActivities")}>
              <ul className="space-y-2.5">
                {thisMonth.activities.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-[1.8]">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {thisMonth?.tips?.length ? (
            <Panel icon={Lightbulb} title={t("crops.tips")}>
              <ul className="space-y-2.5">
                {thisMonth.tips.map((tip, i) => (
                  <li key={i} className="rounded-lg bg-muted/60 p-3 text-sm leading-[1.8]">
                    {tip}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {calendar?.months?.length ? (
            <Panel icon={CalendarDays} title={t("crops.monthByMonth")}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 text-start font-semibold">{t("crops.calendar")}</th>
                      <th className="py-2 text-start font-semibold">{t("crops.sowingTime")}</th>
                      <th className="py-2 text-start font-semibold">{t("crops.harvestTime")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendar.months.map((m) => (
                      <tr key={m.month} className="border-b border-border/60 align-top">
                        <td className="py-2.5 pe-3 font-medium">{isRTL && m.nameUr ? m.nameUr : m.name}</td>
                        <td className="py-2.5 pe-3 leading-[1.8] text-muted-foreground">
                          {m.sow.map((c) => (isRTL && c.nameUr ? c.nameUr : c.name)).join("، ") || "—"}
                        </td>
                        <td className="py-2.5 leading-[1.8] text-muted-foreground">
                          {m.harvest.map((c) => (isRTL && c.nameUr ? c.nameUr : c.name)).join("، ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}

          {calendar?.advisory && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-[1.9] text-muted-foreground">
              {calendar.advisory}
            </p>
          )}
        </TabsContent>

        {/* ---------------------------------------------------- crop guide */}
        <TabsContent value="guide" className="mt-4 space-y-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("crops.searchCrops")}
              aria-label={t("crops.searchCrops")}
              className="min-h-tap ps-10"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {visibleCrops.length} {t("crops.cropsCount")}
          </p>

          {visibleCrops.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <Leaf className="h-10 w-10 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">{t("crops.noCrops")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleCrops.map((c) => (
                <Link key={c.id} href={`/crop-advisor/${c.id}`} className="group">
                  <Card className="h-full transition-shadow group-hover:shadow-md">
                    <CardContent className="space-y-2 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold leading-[1.6]">{c.name}</p>
                          {c.nameUr && (
                            <p className="font-nastaliq truncate text-sm leading-[2] text-muted-foreground" lang="ur" dir="rtl">
                              {c.nameUr}
                            </p>
                          )}
                        </div>
                        {c.season && (
                          <Badge variant="outline" className="shrink-0 capitalize">
                            {c.season === "rabi" ? t("crops.rabi") : c.season === "kharif" ? t("crops.kharif") : c.season}
                          </Badge>
                        )}
                      </div>

                      {c.summary && (
                        <p className="line-clamp-2 text-sm leading-[1.8] text-muted-foreground">{c.summary}</p>
                      )}

                      {typeof c.durationDays === "number" && (
                        <p className="text-xs text-muted-foreground">
                          {t("crops.duration")}: {c.durationDays} {t("crops.days")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
