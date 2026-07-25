"use client"

/**
 * AgriPak profile — the farmer's own record, read and written live.
 *
 *   GET  /api/user/profile   the whole document (password stripped server-side)
 *   PUT  /api/user/profile   partial patch; nested groups are shallow-merged
 *
 * The form is always editable: a farmer on a cheap Android phone should not have
 * to find an "edit" button first. Only fields the user actually changed are sent,
 * because the API rejects an empty patch and re-validates whatever it receives.
 *
 * Notification switches and the language choice save immediately — they are
 * single-tap settings, not a form. Everything else is committed by the save bar
 * that appears once something is dirty.
 *
 * Navigation lives in components/AppShell.tsx; this page renders content only.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, BadgeCheck, LogOut, MapPin, Phone, Save, Sprout, User as UserIcon } from "lucide-react"
import { toast } from "sonner"

import { useAuth, useLanguage } from "@/lib/contexts"
import { userApi } from "@/lib/api"
import { PROVINCES } from "@/lib/data/pakistan-locations"
import type { LanguageCode } from "@/lib/i18n"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"

/* ------------------------------------------------------------------ types */

interface ProfileDoc {
  _id?: string
  name?: string
  role?: string
  mobile?: string
  email?: string
  village?: string
  district?: string
  state?: string
  pincode?: string
  education?: string
  landSize?: { value?: number; unit?: string }
  soilType?: string
  irrigationType?: string
  farmingType?: string
  experience?: number
  preferredCrops?: string[]
  preferredLanguage?: string
  voiceEnabled?: boolean
  notifications?: Record<string, boolean>
  isVerified?: boolean
  points?: number
  level?: number
  profileCompleteness?: number
  createdAt?: string
}

/** Local, flat mirror of the editable fields. Everything is a string so the
 *  inputs stay controlled; numbers are parsed on the way out. */
interface FormState {
  name: string
  mobile: string
  email: string
  village: string
  district: string
  state: string
  pincode: string
  education: string
  landValue: string
  landUnit: string
  soilType: string
  irrigationType: string
  farmingType: string
  experience: string
  preferredCrops: string
}

const EMPTY_FORM: FormState = {
  name: "",
  mobile: "",
  email: "",
  village: "",
  district: "",
  state: "",
  pincode: "",
  education: "",
  landValue: "",
  landUnit: "acres",
  soilType: "",
  irrigationType: "",
  farmingType: "",
  experience: "",
  preferredCrops: "",
}

function toForm(doc: ProfileDoc): FormState {
  return {
    name: doc.name ?? "",
    mobile: doc.mobile ?? "",
    email: doc.email ?? "",
    village: doc.village ?? "",
    district: doc.district ?? "",
    state: doc.state ?? "",
    pincode: doc.pincode ?? "",
    education: doc.education ?? "",
    landValue: doc.landSize?.value != null ? String(doc.landSize.value) : "",
    landUnit: doc.landSize?.unit ?? "acres",
    soilType: doc.soilType ?? "",
    irrigationType: doc.irrigationType ?? "",
    farmingType: doc.farmingType ?? "",
    experience: doc.experience != null ? String(doc.experience) : "",
    preferredCrops: (doc.preferredCrops ?? []).join(", "),
  }
}

/* Enum values mirror lib/models/User.js — keep them in step. */
const SOIL_TYPES = ["clay", "sandy", "loamy", "black", "red", "alluvial", "laterite", "saline", "acidic"] as const
const IRRIGATION_TYPES = ["rainfed", "canal", "borewell", "drip", "sprinkler", "flood", "furrow"] as const
const FARMING_TYPES = ["organic", "conventional", "mixed", "natural", "biodynamic"] as const
const EDUCATION_LEVELS = [
  "illiterate",
  "primary",
  "secondary",
  "higher_secondary",
  "graduate",
  "post_graduate",
  "phd",
] as const
const NOTIFICATION_KEYS = ["weather", "market", "schemes", "crops", "community", "email", "sms"] as const

const OPTION_KEY: Record<string, string> = {
  clay: "profile.soilClay",
  sandy: "profile.soilSandy",
  loamy: "profile.soilLoamy",
  black: "profile.soilBlack",
  red: "profile.soilRed",
  alluvial: "profile.soilAlluvial",
  laterite: "profile.soilLaterite",
  saline: "profile.soilSaline",
  acidic: "profile.soilAcidic",
  rainfed: "profile.irrigationRainfed",
  canal: "profile.irrigationCanal",
  borewell: "profile.irrigationBorewell",
  drip: "profile.irrigationDrip",
  sprinkler: "profile.irrigationSprinkler",
  flood: "profile.irrigationFlood",
  furrow: "profile.irrigationFurrow",
  organic: "profile.farmingOrganic",
  conventional: "profile.farmingConventional",
  mixed: "profile.farmingMixed",
  natural: "profile.farmingNatural",
  biodynamic: "profile.farmingBiodynamic",
  illiterate: "profile.educationIlliterate",
  primary: "profile.educationPrimary",
  secondary: "profile.educationSecondary",
  higher_secondary: "profile.educationHigherSecondary",
  graduate: "profile.educationGraduate",
  post_graduate: "profile.educationPostGraduate",
  phd: "profile.educationPhd",
}

const NOTIFICATION_LABEL: Record<string, string> = {
  weather: "profile.notifyWeather",
  market: "profile.notifyMarket",
  schemes: "profile.notifySchemes",
  crops: "profile.notifyCrops",
  community: "profile.notifyCommunity",
  email: "profile.notifyEmail",
  sms: "profile.notifySms",
}

/* -------------------------------------------------------------------- page */

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading: authLoading, logout, checkAuth } = useAuth()
  const { t, currentLanguage, locale, formatNumber, voiceEnabled, toggleVoice } = useLanguage()

  const [doc, setDoc] = useState<ProfileDoc | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [loadError, setLoadError] = useState<string>("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth/login")
  }, [authLoading, user, router])

  const load = useCallback(async () => {
    setStatus("loading")
    try {
      const res = await userApi.getProfile()
      if (res.success && res.user) {
        const fresh = res.user as ProfileDoc
        setDoc(fresh)
        setForm(toForm(fresh))
        setStatus("ready")
      } else {
        setLoadError(res.message ?? "")
        setStatus("error")
      }
    } catch {
      setLoadError("")
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    if (!user) return
    void load()
  }, [user, load])

  const baseline = useMemo(() => (doc ? toForm(doc) : EMPTY_FORM), [doc])
  const dirty = useMemo(
    () => (Object.keys(baseline) as Array<keyof FormState>).some((key) => baseline[key] !== form[key]),
    [baseline, form],
  )

  const set = (key: keyof FormState) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  /** Sends a patch and folds the fresh document back into local state. */
  const patch = useCallback(
    async (body: Record<string, unknown>, successMessage?: string) => {
      setSaving(true)
      try {
        const res = await userApi.updateProfile(body)
        if (!res.success) {
          toast.error(res.message ?? t("profile.saveFailed"))
          return false
        }
        if (res.user) {
          const fresh = res.user as ProfileDoc
          setDoc(fresh)
          setForm(toForm(fresh))
        }
        void checkAuth()
        toast.success(successMessage ?? t("profile.saved"))
        return true
      } catch {
        toast.error(t("profile.saveFailed"))
        return false
      } finally {
        setSaving(false)
      }
    },
    [checkAuth, t],
  )

  const onSave = useCallback(async () => {
    const body: Record<string, unknown> = {}
    const changed = (key: keyof FormState) => baseline[key] !== form[key]

    for (const key of ["name", "email", "mobile", "village", "district", "pincode", "education"] as const) {
      if (changed(key)) body[key] = form[key].trim()
    }
    if (changed("state")) body.state = form.state
    if (changed("soilType")) body.soilType = form.soilType
    if (changed("irrigationType")) body.irrigationType = form.irrigationType
    if (changed("farmingType")) body.farmingType = form.farmingType
    if (changed("experience")) body.experience = form.experience === "" ? 0 : Number(form.experience)
    if (changed("landValue") || changed("landUnit")) {
      body.landSize = {
        ...(form.landValue === "" ? {} : { value: Number(form.landValue) }),
        unit: form.landUnit,
      }
    }
    if (changed("preferredCrops")) {
      body.preferredCrops = form.preferredCrops
        .split(",")
        .map((crop) => crop.trim())
        .filter(Boolean)
    }

    if (Object.keys(body).length === 0) return
    await patch(body)
  }, [baseline, form, patch])

  const onToggleNotification = useCallback(
    async (key: string, value: boolean) => {
      setDoc((prev) => (prev ? { ...prev, notifications: { ...(prev.notifications ?? {}), [key]: value } } : prev))
      await patch({ notifications: { [key]: value } })
    },
    [patch],
  )

  const onToggleVoice = useCallback(async () => {
    const next = !voiceEnabled
    await toggleVoice()
    await patch({ voiceEnabled: next })
  }, [voiceEnabled, toggleVoice, patch])

  const onLanguageSelected = useCallback(
    (code: LanguageCode) => {
      void patch({ preferredLanguage: code })
    },
    [patch],
  )

  /* ---------------------------------------------------------- rendering */

  if (authLoading || !user || status === "loading") {
    return (
      <div className="container-app space-y-4 py-6">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="container-app py-8">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="flex items-start gap-2 text-sm leading-[1.9] text-foreground">
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            {loadError || t("profile.loadFailed")}
          </p>
          <Button type="button" variant="outline" className="mt-3 min-h-[44px]" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </div>
      </div>
    )
  }

  const isFarmer = (doc?.role ?? "farmer") === "farmer"
  const completeness = doc?.profileCompleteness ?? 0
  const memberSince = doc?.createdAt ? new Date(doc.createdAt).toLocaleDateString(locale) : ""
  const notifications = doc?.notifications ?? {}

  return (
    <div className="container-app space-y-5 py-4 sm:py-6 lg:max-w-4xl">
      <h1 className="sr-only">{t("profile.title")}</h1>

      {/* ---------------------------------------------------------- header */}
      <section className="rounded-2xl bg-brand-gradient p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/20 text-2xl font-bold text-primary-foreground"
            aria-hidden
          >
            {(doc?.name ?? "؟").trim().charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-xl font-bold leading-[1.6] text-primary-foreground sm:text-2xl">
              {doc?.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-primary-foreground/90">
              {(doc?.village || doc?.district) && (
                <span className="flex items-center gap-1.5 leading-[1.9]">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  {[doc?.village, doc?.district, doc?.state].filter(Boolean).join(", ")}
                </span>
              )}
              {doc?.mobile && (
                <span className="flex items-center gap-1.5 leading-[1.9]">
                  <Phone className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="force-ltr">{doc.mobile}</span>
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className="border-white/25 bg-white/15 text-primary-foreground hover:bg-white/25">
                <span className="leading-[1.8]">
                  {doc?.isVerified ? t("profile.verified") : t("profile.notVerified")}
                </span>
              </Badge>
              {doc?.isVerified && <BadgeCheck className="h-5 w-5 text-primary-foreground" aria-hidden />}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 text-sm leading-[1.9] text-primary-foreground">
            <span>{t("profile.completeness")}</span>
            <span className="force-ltr font-bold">{formatNumber(completeness)}%</span>
          </div>
          <Progress value={completeness} className="mt-1.5 h-2 bg-white/25" />
        </div>
      </section>

      {/* ------------------------------------------------ personal details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base leading-[1.8]">
            <UserIcon className="h-5 w-5 text-primary" aria-hidden />
            {t("profile.personalDetails")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label={t("profile.name")}>
            <Input id="name" value={form.name} onChange={(e) => set("name")(e.target.value)} className="min-h-[44px]" />
          </Field>

          <Field id="mobile" label={t("profile.mobile")}>
            <Input
              id="mobile"
              inputMode="tel"
              dir="ltr"
              value={form.mobile}
              onChange={(e) => set("mobile")(e.target.value)}
              placeholder={t("auth.mobilePlaceholder")}
              className="min-h-[44px] force-ltr"
            />
          </Field>

          <Field id="email" label={`${t("profile.email")} (${t("common.optional")})`}>
            <Input
              id="email"
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              className="min-h-[44px] force-ltr"
            />
          </Field>

          <Field id="village" label={t("profile.village")}>
            <Input
              id="village"
              value={form.village}
              onChange={(e) => set("village")(e.target.value)}
              className="min-h-[44px]"
            />
          </Field>

          <Field id="district" label={t("profile.district")}>
            <Input
              id="district"
              value={form.district}
              onChange={(e) => set("district")(e.target.value)}
              className="min-h-[44px]"
            />
          </Field>

          <Field id="province" label={t("profile.province")}>
            <Select value={form.state || undefined} onValueChange={set("state")}>
              <SelectTrigger id="province" className="min-h-[44px]">
                <SelectValue placeholder={t("common.selectOption")} />
              </SelectTrigger>
              <SelectContent>
                {PROVINCES.map((province) => (
                  <SelectItem key={province} value={province} className="min-h-[44px] leading-[1.9]">
                    {province}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field id="pincode" label={`${t("profile.postalCode")} (${t("common.optional")})`}>
            <Input
              id="pincode"
              inputMode="numeric"
              dir="ltr"
              value={form.pincode}
              onChange={(e) => set("pincode")(e.target.value)}
              className="min-h-[44px] force-ltr"
            />
          </Field>

          <Field id="education" label={`${t("profile.education")} (${t("common.optional")})`}>
            <Select value={form.education || undefined} onValueChange={set("education")}>
              <SelectTrigger id="education" className="min-h-[44px]">
                <SelectValue placeholder={t("common.selectOption")} />
              </SelectTrigger>
              <SelectContent>
                {EDUCATION_LEVELS.map((level) => (
                  <SelectItem key={level} value={level} className="min-h-[44px] leading-[1.9]">
                    {t(OPTION_KEY[level])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------- farm details */}
      {isFarmer && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base leading-[1.8]">
              <Sprout className="h-5 w-5 text-primary" aria-hidden />
              {t("profile.farmDetails")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="landValue" label={t("profile.landSize")}>
              <Input
                id="landValue"
                inputMode="decimal"
                dir="ltr"
                value={form.landValue}
                onChange={(e) => set("landValue")(e.target.value)}
                className="min-h-[44px] force-ltr"
              />
            </Field>

            <Field id="landUnit" label={t("profile.landUnit")}>
              <Select value={form.landUnit} onValueChange={set("landUnit")}>
                <SelectTrigger id="landUnit" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="acres" className="min-h-[44px] leading-[1.9]">
                    {t("units.acre")}
                  </SelectItem>
                  <SelectItem value="hectares" className="min-h-[44px] leading-[1.9]">
                    {t("units.hectare")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field id="soilType" label={t("profile.soilType")}>
              <Select value={form.soilType || undefined} onValueChange={set("soilType")}>
                <SelectTrigger id="soilType" className="min-h-[44px]">
                  <SelectValue placeholder={t("common.selectOption")} />
                </SelectTrigger>
                <SelectContent>
                  {SOIL_TYPES.map((soil) => (
                    <SelectItem key={soil} value={soil} className="min-h-[44px] leading-[1.9]">
                      {t(OPTION_KEY[soil])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="irrigationType" label={t("profile.irrigationType")}>
              <Select value={form.irrigationType || undefined} onValueChange={set("irrigationType")}>
                <SelectTrigger id="irrigationType" className="min-h-[44px]">
                  <SelectValue placeholder={t("common.selectOption")} />
                </SelectTrigger>
                <SelectContent>
                  {IRRIGATION_TYPES.map((irrigation) => (
                    <SelectItem key={irrigation} value={irrigation} className="min-h-[44px] leading-[1.9]">
                      {t(OPTION_KEY[irrigation])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="farmingType" label={t("profile.farmingType")}>
              <Select value={form.farmingType || undefined} onValueChange={set("farmingType")}>
                <SelectTrigger id="farmingType" className="min-h-[44px]">
                  <SelectValue placeholder={t("common.selectOption")} />
                </SelectTrigger>
                <SelectContent>
                  {FARMING_TYPES.map((farming) => (
                    <SelectItem key={farming} value={farming} className="min-h-[44px] leading-[1.9]">
                      {t(OPTION_KEY[farming])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="experience" label={t("profile.experience")}>
              <Input
                id="experience"
                inputMode="numeric"
                dir="ltr"
                value={form.experience}
                onChange={(e) => set("experience")(e.target.value)}
                className="min-h-[44px] force-ltr"
              />
            </Field>

            <div className="sm:col-span-2">
              <Field id="preferredCrops" label={t("profile.preferredCrops")} hint={t("profile.preferredCropsHint")}>
                <Input
                  id="preferredCrops"
                  value={form.preferredCrops}
                  onChange={(e) => set("preferredCrops")(e.target.value)}
                  className="min-h-[44px]"
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------- preferences */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base leading-[1.8]">{t("profile.preferences")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold leading-[1.9] text-foreground">{t("profile.language")}</p>
            <LanguageSwitcher variant="list" onSelected={onLanguageSelected} />
          </div>

          <ToggleRow
            id="voice"
            label={t("profile.voiceReadout")}
            hint={t("profile.voiceReadoutHint")}
            checked={voiceEnabled}
            disabled={saving}
            onChange={() => void onToggleVoice()}
          />
        </CardContent>
      </Card>

      {/* --------------------------------------------------- notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base leading-[1.8]">{t("profile.notificationSettings")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {NOTIFICATION_KEYS.map((key) => (
            <ToggleRow
              key={key}
              id={`notify-${key}`}
              label={t(NOTIFICATION_LABEL[key])}
              checked={Boolean(notifications[key])}
              disabled={saving}
              onChange={(value) => void onToggleNotification(key, value)}
            />
          ))}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- account */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base leading-[1.8]">{t("profile.account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SmallStat label={t("profile.points")} value={formatNumber(doc?.points ?? 0)} />
            <SmallStat label={t("profile.level")} value={formatNumber(doc?.level ?? 1)} />
            <SmallStat label={t("profile.memberSince")} value={memberSince || t("profile.notSet")} />
          </dl>

          <div>
            <Button type="button" variant="destructive" className="min-h-[44px] w-full sm:w-auto" onClick={logout}>
              <LogOut className="flip-rtl me-2 h-4 w-4" aria-hidden />
              {t("auth.logout")}
            </Button>
            <p className="mt-2 text-xs leading-[1.9] text-muted-foreground">{t("profile.logoutHint")}</p>
          </div>
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- save bar */}
      {dirty && (
        <div className="safe-b sticky bottom-[var(--bottom-nav-height)] z-20 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:bottom-0">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" className="min-h-[44px] flex-1" onClick={() => void onSave()} disabled={saving}>
              <Save className="me-2 h-4 w-4" aria-hidden />
              {saving ? t("profile.saving") : t("profile.saveChanges")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              disabled={saving}
              onClick={() => doc && setForm(toForm(doc))}
            >
              {t("profile.discard")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ subcomponents */

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm leading-[1.9]">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs leading-[1.9] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm leading-[1.9]">
          {label}
        </Label>
        {hint && <p className="text-xs leading-[1.9] text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="shrink-0" />
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <dt className="text-xs leading-[1.9] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold leading-[1.9] text-foreground">{value}</dd>
    </div>
  )
}
