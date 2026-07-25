"use client"

/**
 * Government schemes — real Pakistani programmes only.
 *
 * Everything on this page comes from `GET /api/schemes` (CM Punjab Kissan Card,
 * Green Tractor, Apna Khet Apna Rozgar, Benazir Hari Card, ZTBL, SBP Zarkhez-e,
 * solar tubewell subsidies, crop-loan insurance). Nothing is hardcoded here.
 *
 * The eligibility checker posts the farmer's province, land size and tenure to
 * `POST /api/schemes/check-eligibility` and shows exactly what the matcher
 * returned: what matched, what blocks them and what could not be checked. It
 * never claims an approval.
 *
 * Chrome (header, nav, back links) belongs to `components/AppShell.tsx` — this
 * page renders content only.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  Info,
  Landmark,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { schemesApi } from "@/lib/api"
import { useAuth, useLanguage } from "@/lib/contexts"

/* ------------------------------------------------------------------ types */

interface FilterOption {
  id: string
  name: string
  nameUr?: string
}

interface SchemeSummary {
  id: string
  name: string
  nameUr: string
  province: string
  provincesCovered: string[]
  category: string
  description: string
  descriptionUr: string
  benefitAmount: number | null
  benefitAmountLabel: string
  status: "active" | "closed" | "upcoming"
  featured: boolean
  officialUrl: string
  implementingAgency: string
  applicationWindow: string | null
  tags: string[]
  lastVerified: string
}

interface SchemesPayload {
  schemes: SchemeSummary[]
  filters: { provinces: FilterOption[]; categories: FilterOption[]; statuses: FilterOption[] }
  counts: { total: number; active: number; matchingFilters: number }
  coverageNote: string
}

interface SchemeMatch {
  schemeId: string
  name: string
  nameUr: string
  province: string
  category: string
  status: "active" | "closed" | "upcoming"
  benefitAmount: number | null
  benefitAmountLabel: string
  officialUrl: string
  howToApply: string
  eligible: boolean
  score: number
  matched: string[]
  blockers: string[]
  unknowns: string[]
  notes: string[]
}

interface EligibilityPayload {
  applicant: {
    province: string | null
    landSizeAcres: number | null
    tenure: string | null
    hasLandRecord: boolean | null
    source: "body" | "profile" | "mixed" | "none"
  }
  summary: { checked: number; eligible: number; openForApplicationNow: number; notEligible: number }
  eligibleSchemes: SchemeMatch[]
  otherSchemes: SchemeMatch[]
  disclaimer: string
  coverageNote: string
}

/* -------------------------------------------------------------- constants */

const ALL = "all"

/** Same factors the API's `toAcres()` uses, so the client and server agree. */
const UNIT_TO_ACRES: Record<string, number> = {
  acre: 1,
  hectare: 2.471,
  kanal: 1 / 8,
  marla: 1 / 160,
}

/** Taxonomy ids the API returns -> translation keys, so all five languages work.
 *  (The API only ships English + Urdu names for these.) */
const PROVINCE_LABEL_KEYS: Record<string, string> = {
  Federal: "schemes.provFederal",
  Punjab: "schemes.provPunjab",
  Sindh: "schemes.provSindh",
  KPK: "schemes.provKpk",
  Balochistan: "schemes.provBalochistan",
}

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  credit: "schemes.catCredit",
  subsidy: "schemes.catSubsidy",
  insurance: "schemes.catInsurance",
  mechanisation: "schemes.catMechanisation",
  energy: "schemes.catEnergy",
  land: "schemes.catLand",
  "financial-assistance": "schemes.catFinancialAssistance",
}

const TENURES = [
  { id: "owner", labelKey: "schemes.tenureOwner" },
  { id: "owner-cum-tenant", labelKey: "schemes.tenureOwnerTenant" },
  { id: "tenant", labelKey: "schemes.tenureTenant" },
  { id: "sharecropper", labelKey: "schemes.tenureSharecropper" },
  { id: "landless", labelKey: "schemes.tenureLandless" },
] as const

/** User.state (canonical) -> the short id the scheme filters use. */
function provinceFilterId(state?: string | null): string {
  if (!state) return ALL
  const value = state.trim().toLowerCase()
  if (value.startsWith("punjab")) return "Punjab"
  if (value.startsWith("sindh")) return "Sindh"
  if (value.startsWith("khyber") || value === "kpk" || value.startsWith("kp")) return "KPK"
  if (value.startsWith("baloch")) return "Balochistan"
  return ALL
}

/* -------------------------------------------------------------- fragments */

function SchemeCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}

function ReasonList({
  items,
  tone,
  title,
  icon: Icon,
}: {
  items: string[]
  tone: "good" | "bad" | "unknown" | "note"
  title: string
  icon: typeof CheckCircle2
}) {
  if (!items.length) return null
  const colour =
    tone === "good"
      ? "text-success"
      : tone === "bad"
        ? "text-destructive"
        : tone === "unknown"
          ? "text-warning"
          : "text-muted-foreground"

  return (
    <div className="space-y-1.5">
      <p className={`flex items-center gap-1.5 text-sm font-semibold leading-[1.7] ${colour}`}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {title}
      </p>
      <ul className="space-y-1 ps-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-[1.8] text-muted-foreground">
            <span aria-hidden className={`mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-current ${colour}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------- page */

export default function SchemesPage() {
  const { t, currentLanguage, formatCurrency } = useLanguage()
  const { user, loading: authLoading } = useAuth()
  const isEnglish = currentLanguage === "en"

  /** Prefer the API's Urdu string on every non-English locale — it is the only
   *  translated copy the backend ships, and Urdu script beats English here. */
  const localised = useCallback(
    (english: string, urdu?: string | null) => (!isEnglish && urdu ? urdu : english),
    [isEnglish],
  )

  /* ----------------------------------------------------------- list state */

  const [data, setData] = useState<SchemesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [province, setProvince] = useState<string>(ALL)
  const [category, setCategory] = useState<string>(ALL)
  const [status, setStatus] = useState<string>(ALL)
  const [provinceTouched, setProvinceTouched] = useState(false)

  // Default the filter to the signed-in farmer's own province, once.
  useEffect(() => {
    if (authLoading || provinceTouched) return
    const fromProfile = provinceFilterId((user as any)?.state)
    if (fromProfile !== ALL) setProvince(fromProfile)
  }, [authLoading, user, provinceTouched])

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => window.clearTimeout(id)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await schemesApi.list({
        // Always send a province so a signed-in farmer's saved province does not
        // silently narrow the list when they picked "All Pakistan".
        province,
        category,
        status,
        search: search || undefined,
        limit: 50,
      })
      if (res.success && res.data) {
        setData(res.data as unknown as SchemesPayload)
      } else {
        setData(null)
        setError(res.message || t("schemes.loadError"))
      }
    } catch {
      setData(null)
      setError(t("schemes.loadError"))
    } finally {
      setLoading(false)
    }
  }, [province, category, status, search, t])

  useEffect(() => {
    void load()
  }, [load])

  const statusLabel = useCallback(
    (value: string) =>
      value === "active"
        ? t("schemes.openNow")
        : value === "closed"
          ? t("schemes.applicationsClosed")
          : t("schemes.announced"),
    [t],
  )

  const provinceOptions = data?.filters.provinces ?? []
  const categoryOptions = data?.filters.categories ?? []
  const categoryLabel = useCallback(
    (id: string) => {
      const key = CATEGORY_LABEL_KEYS[id]
      if (key) return t(key)
      const option = categoryOptions.find((c) => c.id === id)
      return option ? localised(option.name, option.nameUr) : id
    },
    [categoryOptions, localised, t],
  )
  const provinceLabel = useCallback(
    (id: string) => {
      const key = PROVINCE_LABEL_KEYS[id]
      if (key) return t(key)
      const option = provinceOptions.find((p) => p.id === id)
      return option ? localised(option.name, option.nameUr) : id
    },
    [provinceOptions, localised, t],
  )

  const filtersDirty = province !== ALL || category !== ALL || status !== ALL || search !== ""

  /* ------------------------------------------------------- checker state */

  const [checkProvince, setCheckProvince] = useState<string>("")
  const [landSize, setLandSize] = useState("")
  const [landUnit, setLandUnit] = useState("acre")
  const [tenure, setTenure] = useState<string>("")
  const [hasLandRecord, setHasLandRecord] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [result, setResult] = useState<EligibilityPayload | null>(null)
  const [showOthers, setShowOthers] = useState(false)

  useEffect(() => {
    if (authLoading) return
    const fromProfile = (user as any)?.state
    if (fromProfile && !checkProvince) {
      const canonical = provinceOptions.find((p) => p.id !== "Federal" && p.name === fromProfile)
      if (canonical) setCheckProvince(canonical.id)
    }
  }, [authLoading, user, provinceOptions, checkProvince])

  const acres = useMemo(() => {
    const n = Number(landSize)
    if (!landSize.trim() || !Number.isFinite(n) || n < 0) return null
    return Number((n * (UNIT_TO_ACRES[landUnit] ?? 1)).toFixed(3))
  }, [landSize, landUnit])

  const canCheck = Boolean(checkProvince) || acres !== null || Boolean(tenure) || Boolean(user)

  const runCheck = useCallback(async () => {
    if (!canCheck) {
      setCheckError(t("schemes.selectAtLeastOne"))
      return
    }
    setChecking(true)
    setCheckError(null)
    try {
      const res = await schemesApi.checkEligibility({
        province: checkProvince || undefined,
        landSizeAcres: acres ?? undefined,
        tenure: tenure || undefined,
        hasLandRecord: hasLandRecord ?? undefined,
      })
      if (res.success && res.data) {
        setResult(res.data as unknown as EligibilityPayload)
        setShowOthers(false)
      } else {
        setResult(null)
        setCheckError(res.message || t("common.error"))
      }
    } catch {
      setResult(null)
      setCheckError(t("validation.networkError"))
    } finally {
      setChecking(false)
    }
  }, [canCheck, checkProvince, acres, tenure, hasLandRecord, t])

  /* ------------------------------------------------------------- render */

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
      {/* ---------------------------------------------------------- header */}
      <header className="mb-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Landmark className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-[1.6] text-foreground sm:text-2xl">{t("schemes.title")}</h1>
            <p className="text-sm leading-[1.8] text-muted-foreground">{t("schemes.subtitle")}</p>
          </div>
        </div>

        {data ? (
          <div className="mt-4 grid grid-cols-2 gap-2 xs:gap-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-medium leading-[1.8] text-muted-foreground">{t("common.all")}</p>
              <p className="text-lg font-bold text-foreground" data-numeric>
                {data.counts.total}
              </p>
            </div>
            <div className="rounded-xl border border-success/30 bg-success/10 p-3">
              <p className="text-xs font-medium leading-[1.8] text-success">{t("schemes.openNow")}</p>
              <p className="text-lg font-bold text-success" data-numeric>
                {data.counts.active}
              </p>
            </div>
          </div>
        ) : null}
      </header>

      {/* ----------------------------------------------- eligibility checker */}
      <Card id="eligibility" className="mb-6 border-primary/25 shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base leading-[1.7] sm:text-lg">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            {t("schemes.checkerTitle")}
          </CardTitle>
          <p className="text-sm leading-[1.8] text-muted-foreground">{t("schemes.checkerIntro")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="checker-province" className="text-sm leading-[1.8]">
                {t("schemes.province")}
              </Label>
              <Select value={checkProvince} onValueChange={setCheckProvince}>
                <SelectTrigger id="checker-province" className="min-h-tap text-start">
                  <SelectValue placeholder={t("common.selectOption")} />
                </SelectTrigger>
                <SelectContent>
                  {provinceOptions
                    .filter((option) => option.id !== "Federal")
                    .map((option) => (
                      <SelectItem key={option.id} value={option.id} className="min-h-tap leading-[1.8]">
                        {provinceLabel(option.id)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="checker-tenure" className="text-sm leading-[1.8]">
                {t("schemes.tenure")}
              </Label>
              <Select value={tenure} onValueChange={setTenure}>
                <SelectTrigger id="checker-tenure" className="min-h-tap text-start">
                  <SelectValue placeholder={t("common.selectOption")} />
                </SelectTrigger>
                <SelectContent>
                  {TENURES.map((option) => (
                    <SelectItem key={option.id} value={option.id} className="min-h-tap leading-[1.8]">
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="checker-land" className="text-sm leading-[1.8]">
                {t("schemes.landSize")}
              </Label>
              <Input
                id="checker-land"
                inputMode="decimal"
                value={landSize}
                onChange={(event) => setLandSize(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0"
                className="min-h-tap force-ltr text-start"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="checker-unit" className="text-sm leading-[1.8]">
                {t("schemes.landSizeUnit")}
              </Label>
              <Select value={landUnit} onValueChange={setLandUnit}>
                <SelectTrigger id="checker-unit" className="min-h-tap text-start">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="acre" className="min-h-tap leading-[1.8]">
                    {t("units.acre")}
                  </SelectItem>
                  <SelectItem value="hectare" className="min-h-tap leading-[1.8]">
                    {t("units.hectare")}
                  </SelectItem>
                  <SelectItem value="kanal" className="min-h-tap leading-[1.8]">
                    {t("units.kanal")}
                  </SelectItem>
                  <SelectItem value="marla" className="min-h-tap leading-[1.8]">
                    {t("units.marla")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex min-h-tap cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <Checkbox
              checked={hasLandRecord === true}
              onCheckedChange={(checked) => setHasLandRecord(checked === true ? true : null)}
              aria-label={t("schemes.hasLandRecord")}
            />
            <span className="text-sm leading-[1.8] text-foreground">{t("schemes.hasLandRecord")}</span>
          </label>

          {checkError ? (
            <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-[1.8] text-destructive">
              <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              {checkError}
            </p>
          ) : null}

          <Button onClick={() => void runCheck()} disabled={checking} className="min-h-tap w-full sm:w-auto">
            {checking ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                {t("schemes.checking")}
              </>
            ) : (
              <>
                <BadgeCheck className="me-2 h-4 w-4" aria-hidden />
                {result ? t("schemes.checkAgain") : t("schemes.checkEligibility")}
              </>
            )}
          </Button>

          {/* -------------------------------------------------- check result */}
          {result ? (
            <div className="space-y-4 border-t border-border pt-4">
              {result.applicant.source !== "body" ? (
                <p className="flex items-start gap-2 text-xs leading-[1.8] text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t("schemes.profileUsed")}
                </p>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border bg-card p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground" data-numeric>
                    {result.summary.checked}
                  </p>
                  <p className="text-[0.7rem] font-medium leading-[1.7] text-muted-foreground">
                    {t("schemes.checked")}
                  </p>
                </div>
                <div className="rounded-lg border border-success/30 bg-success/10 p-2.5 text-center">
                  <p className="text-lg font-bold text-success" data-numeric>
                    {result.summary.eligible}
                  </p>
                  <p className="text-[0.7rem] font-medium leading-[1.7] text-success">{t("schemes.youMayQualify")}</p>
                </div>
                <div className="rounded-lg border border-gold/40 bg-gold-surface p-2.5 text-center">
                  <p className="text-lg font-bold text-gold-foreground" data-numeric>
                    {result.summary.openForApplicationNow}
                  </p>
                  <p className="text-[0.7rem] font-medium leading-[1.7] text-gold-foreground">
                    {t("schemes.openForApplication")}
                  </p>
                </div>
              </div>

              {result.eligibleSchemes.length === 0 ? (
                <p className="rounded-lg bg-muted px-3 py-3 text-sm leading-[1.8] text-muted-foreground">
                  {t("schemes.notMatching")}
                </p>
              ) : (
                <ul className="space-y-3">
                  {result.eligibleSchemes.map((match) => (
                    <li
                      key={match.schemeId}
                      className="space-y-3 rounded-xl border border-success/30 bg-success/5 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/schemes/${match.schemeId}`}
                            className="text-sm font-semibold leading-[1.8] text-foreground underline-offset-4 hover:underline"
                          >
                            {localised(match.name, match.nameUr)}
                          </Link>
                          <p className="text-xs leading-[1.8] text-muted-foreground">
                            {match.benefitAmount !== null
                              ? formatCurrency(match.benefitAmount, { compact: true })
                              : match.benefitAmountLabel}
                          </p>
                        </div>
                        <Badge
                          variant={match.status === "active" ? "default" : "secondary"}
                          className="shrink-0 leading-[1.7]"
                        >
                          {statusLabel(match.status)}
                        </Badge>
                      </div>

                      <ReasonList items={match.matched} tone="good" title={t("schemes.whyYouMatch")} icon={CheckCircle2} />
                      <ReasonList
                        items={match.unknowns}
                        tone="unknown"
                        title={t("schemes.couldNotCheck")}
                        icon={CircleHelp}
                      />
                      <ReasonList items={match.notes} tone="note" title={t("schemes.notes")} icon={Info} />

                      <Button asChild size="sm" variant="outline" className="min-h-tap w-full sm:w-auto">
                        <Link href={`/schemes/${match.schemeId}`}>
                          {t("schemes.viewDetails")}
                          <ArrowRight className="ms-2 h-4 w-4 flip-rtl" aria-hidden />
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {result.otherSchemes.length ? (
                <div className="space-y-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-tap w-full justify-start text-muted-foreground"
                    onClick={() => setShowOthers((value) => !value)}
                    aria-expanded={showOthers}
                  >
                    <XCircle className="me-2 h-4 w-4" aria-hidden />
                    {t("schemes.notMatching")} ({result.otherSchemes.length})
                  </Button>
                  {showOthers ? (
                    <ul className="space-y-3">
                      {result.otherSchemes.map((match) => (
                        <li key={match.schemeId} className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
                          <Link
                            href={`/schemes/${match.schemeId}`}
                            className="text-sm font-semibold leading-[1.8] text-foreground underline-offset-4 hover:underline"
                          >
                            {localised(match.name, match.nameUr)}
                          </Link>
                          <ReasonList
                            items={match.blockers}
                            tone="bad"
                            title={t("schemes.whatBlocksYou")}
                            icon={XCircle}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-[1.8] text-foreground">
                <span className="font-semibold">{t("schemes.disclaimer")}: </span>
                {result.disclaimer}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- filters */}
      <section aria-label={t("common.filter")} className="mb-5 space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("schemes.searchPlaceholder")}
            aria-label={t("schemes.searchPlaceholder")}
            className="min-h-tap ps-9 text-start"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Select
            value={province}
            onValueChange={(value) => {
              setProvinceTouched(true)
              setProvince(value)
            }}
          >
            <SelectTrigger className="min-h-tap text-start" aria-label={t("schemes.province")}>
              <SelectValue placeholder={t("schemes.province")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="min-h-tap leading-[1.8]">
                {t("schemes.allProvinces")}
              </SelectItem>
              {provinceOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} className="min-h-tap leading-[1.8]">
                  {provinceLabel(option.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="min-h-tap text-start" aria-label={t("schemes.category")}>
              <SelectValue placeholder={t("schemes.category")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="min-h-tap leading-[1.8]">
                {t("schemes.allCategories")}
              </SelectItem>
              {categoryOptions.map((option) => (
                <SelectItem key={option.id} value={option.id} className="min-h-tap leading-[1.8]">
                  {categoryLabel(option.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="col-span-2 min-h-tap text-start sm:col-span-1" aria-label={t("schemes.status")}>
              <SelectValue placeholder={t("schemes.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="min-h-tap leading-[1.8]">
                {t("schemes.allStatuses")}
              </SelectItem>
              {(data?.filters.statuses ?? []).map((option) => (
                <SelectItem key={option.id} value={option.id} className="min-h-tap leading-[1.8]">
                  {statusLabel(option.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm leading-[1.8] text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
            {t("schemes.schemesCount", { count: data?.counts.matchingFilters ?? 0 })}
          </p>
          {filtersDirty ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-tap"
              onClick={() => {
                setProvinceTouched(true)
                setProvince(ALL)
                setCategory(ALL)
                setStatus(ALL)
                setSearchInput("")
              }}
            >
              <RotateCcw className="me-2 h-4 w-4" aria-hidden />
              {t("schemes.clearFilters")}
            </Button>
          ) : null}
        </div>
      </section>

      {/* ----------------------------------------------------------- results */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <SchemeCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
            <p className="text-sm leading-[1.8] text-foreground">{error}</p>
            <Button onClick={() => void load()} variant="outline" className="min-h-tap">
              <RotateCcw className="me-2 h-4 w-4" aria-hidden />
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : !data || data.schemes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Landmark className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="text-sm leading-[1.8] text-muted-foreground">{t("schemes.noSchemes")}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.schemes.map((scheme) => (
            // min-w-0: grid items default to min-width:auto, so long unbroken
            // Urdu strings would stretch the card past the 360px viewport.
            <li key={scheme.id} className="min-w-0">
              <Card className="flex h-full flex-col overflow-hidden shadow-card transition-shadow hover:shadow-card-lg">
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant={scheme.status === "active" ? "default" : "secondary"}
                      className="leading-[1.7]"
                    >
                      {statusLabel(scheme.status)}
                    </Badge>
                    <Badge variant="outline" className="leading-[1.7]">
                      {provinceLabel(scheme.province)}
                    </Badge>
                    <Badge variant="outline" className="leading-[1.7]">
                      {categoryLabel(scheme.category)}
                    </Badge>
                    {scheme.featured ? (
                      <span className="badge-sample">
                        <Sparkles className="h-3 w-3" aria-hidden />
                        {t("schemes.featured")}
                      </span>
                    ) : null}
                  </div>

                  <h2 className="text-base font-bold leading-[1.7] text-foreground">
                    {localised(scheme.name, scheme.nameUr)}
                  </h2>

                  {scheme.benefitAmount !== null ? (
                    <p className="text-lg font-bold leading-[1.6] text-primary" data-numeric>
                      {formatCurrency(scheme.benefitAmount, { compact: true })}
                    </p>
                  ) : null}
                  <p className="text-xs leading-[1.8] text-muted-foreground">{scheme.benefitAmountLabel}</p>

                  <p className="line-clamp-4 text-sm leading-[1.8] text-muted-foreground">
                    {localised(scheme.description, scheme.descriptionUr)}
                  </p>

                  <dl className="mt-auto space-y-1.5 border-t border-border pt-3 text-xs leading-[1.8]">
                    <div className="flex gap-2">
                      <dt className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" aria-hidden />
                        {t("schemes.implementingAgency")}
                      </dt>
                      <dd className="min-w-0 text-foreground">{scheme.implementingAgency}</dd>
                    </div>
                    {scheme.applicationWindow ? (
                      <div className="flex gap-2">
                        <dt className="flex shrink-0 items-center gap-1 text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                          {t("schemes.applicationWindow")}
                        </dt>
                        <dd className="min-w-0 text-foreground">{scheme.applicationWindow}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="flex flex-col gap-2 xs:flex-row">
                    <Button asChild className="min-h-tap flex-1">
                      <Link href={`/schemes/${scheme.id}`}>
                        {t("schemes.viewDetails")}
                        <ArrowRight className="ms-2 h-4 w-4 flip-rtl" aria-hidden />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="min-h-tap flex-1">
                      <a href={scheme.officialUrl} target="_blank" rel="noopener noreferrer">
                        {t("schemes.officialPage")}
                        <ExternalLink className="ms-2 h-4 w-4" aria-hidden />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {data?.coverageNote ? (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-xs leading-[1.9] text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold text-foreground">{t("schemes.coverage")}: </span>
            {data.coverageNote}
          </span>
        </p>
      ) : null}
    </div>
  )
}
