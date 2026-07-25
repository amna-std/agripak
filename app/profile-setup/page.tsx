"use client"

/**
 * Farm onboarding — the four things the advisory engine actually needs:
 * land size, soil, water source and the crops you grow, plus a language choice.
 *
 * Saves through `PUT /api/user/profile` (see `userApi.updateProfile`), against
 * the signed-in user rather than any client-supplied id. Soil and tenure options
 * use the vocabulary Pakistani extension services actually use.
 *
 * Note on units: the User model stores `landSize.unit` as `acres | hectares`
 * only. Farmers in Punjab and KP think in kanal, so the form accepts kanal and
 * converts (8 kanal = 1 acre) before saving rather than inventing a unit the
 * backend would reject.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Droplets, Languages, Layers, Ruler, Sprout } from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { userApi } from "@/lib/api"
import { PAKISTAN_CROPS } from "@/lib/data/pakistan-crops"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Punjab/KP land is measured in kanal; the model only stores acres or hectares. */
const KANAL_PER_ACRE = 8

type LandUnit = "acres" | "kanal"

/** Values must match the `soilType` enum in lib/models/User.js. */
const SOILS = [
  { value: "loamy", labelKey: "profileSetup.soilLoamy" },
  { value: "clay", labelKey: "profileSetup.soilClay" },
  { value: "sandy", labelKey: "profileSetup.soilSandy" },
  { value: "alluvial", labelKey: "profileSetup.soilAlluvial" },
  { value: "saline", labelKey: "profileSetup.soilSaline" },
  { value: "black", labelKey: "profileSetup.soilBlack" },
  { value: "red", labelKey: "profileSetup.soilRed" },
] as const

/** Values must match the `irrigationType` enum. "borewell" is the model's tubewell. */
const WATER_SOURCES = [
  { value: "canal", labelKey: "profileSetup.waterCanal" },
  { value: "borewell", labelKey: "profileSetup.waterTubewell" },
  { value: "rainfed", labelKey: "profileSetup.waterRainfed" },
  { value: "flood", labelKey: "profileSetup.waterFlood" },
  { value: "furrow", labelKey: "profileSetup.waterFurrow" },
  { value: "drip", labelKey: "profileSetup.waterDrip" },
  { value: "sprinkler", labelKey: "profileSetup.waterSprinkler" },
] as const

const TOTAL_STEPS = 4

const STEP_META = [
  { icon: Ruler, titleKey: "profileSetup.landStep" },
  { icon: Layers, titleKey: "profileSetup.soilStep" },
  { icon: Sprout, titleKey: "profileSetup.cropsStep" },
  { icon: Languages, titleKey: "profileSetup.languageStep" },
] as const

export default function ProfileSetupPage() {
  const router = useRouter()
  const { t, currentLanguage } = useLanguage()
  const { user, loading, checkAuth } = useAuth()

  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)

  const [landValue, setLandValue] = useState("")
  const [landUnit, setLandUnit] = useState<LandUnit>("acres")
  const [soilType, setSoilType] = useState("")
  const [waterSource, setWaterSource] = useState("")
  const [crops, setCrops] = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login")
  }, [loading, user, router])

  // Prefill from whatever the account already has, so re-running onboarding
  // never silently wipes an existing answer.
  useEffect(() => {
    if (!user) return
    const size = user.landSize?.value
    if (typeof size === "number" && size > 0) setLandValue(String(size))
    if (user.soilType) setSoilType(String(user.soilType))
    if (user.irrigationType) setWaterSource(String(user.irrigationType))
    if (Array.isArray(user.preferredCrops) && user.preferredCrops.length > 0) {
      setCrops(user.preferredCrops.map(String))
    }
  }, [user])

  const acres = useMemo(() => {
    const parsed = Number.parseFloat(landValue)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    const converted = landUnit === "kanal" ? parsed / KANAL_PER_ACRE : parsed
    return Math.round(converted * 100) / 100
  }, [landValue, landUnit])

  const canContinue =
    step === 1 ? acres !== null && acres >= 0.1 : step === 2 ? Boolean(soilType && waterSource) : true

  const toggleCrop = (key: string) =>
    setCrops((current) => (current.includes(key) ? current.filter((c) => c !== key) : [...current, key]))

  const handleSave = async () => {
    setError(null)

    if (acres === null || acres < 0.1) {
      setStep(1)
      setError(t("validation.invalidNumber"))
      return
    }

    setSaving(true)
    try {
      const response = await userApi.updateProfile({
        landSize: { value: acres, unit: "acres" },
        soilType,
        irrigationType: waterSource,
        preferredCrops: crops,
        preferredLanguage: currentLanguage,
      })

      if (response.success) {
        await checkAuth()
        setDone(true)
      } else {
        setError(response.message ?? t("validation.somethingWentWrong"))
      }
    } catch {
      setError(t("validation.networkError"))
    } finally {
      setSaving(false)
    }
  }

  /* ------------------------------------------------------------- guards */

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="skeleton h-8 w-2/3" />
        <div className="skeleton mt-4 h-48 w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 text-center">
        <p className="text-base leading-relaxed">{t("profileSetup.loginRequired")}</p>
        <Button asChild className="mt-4 min-h-tap">
          <Link href="/auth/login">{t("auth.login")}</Link>
        </Button>
      </div>
    )
  }

  /* -------------------------------------------------------- done screen */

  if (done) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
            <Check className="h-8 w-8" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-bold leading-[1.35]">{t("profileSetup.doneTitle")}</h1>
          <p className="mt-3 text-sm leading-[1.8] text-muted-foreground">{t("profileSetup.doneBody")}</p>

          <dl className="mt-6 grid grid-cols-1 gap-3 text-start xs:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/50 p-3">
              <dt className="text-xs font-semibold uppercase leading-[1.9] text-muted-foreground">
                {t("profileSetup.landSize")}
              </dt>
              <dd className="mt-1 text-base font-semibold leading-[1.7]">
                <span className="force-ltr">{acres}</span> {t("units.acre")}
              </dd>
            </div>
            <div className="rounded-xl border border-border bg-muted/50 p-3">
              <dt className="text-xs font-semibold uppercase leading-[1.9] text-muted-foreground">
                {t("profileSetup.crops")}
              </dt>
              <dd className="mt-1 text-base font-semibold leading-[1.7]">
                {t("profileSetup.cropsSelected", { count: crops.length })}
              </dd>
            </div>
          </dl>

          <Button asChild size="lg" className="mt-6 min-h-tap w-full sm:w-auto">
            <Link href="/dashboard">
              {t("profileSetup.goToDashboard")}
              <ArrowRight className="flip-rtl h-5 w-5" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------ wizard */

  const progress = Math.round((step / TOTAL_STEPS) * 100)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold leading-[1.35]">{t("profileSetup.title")}</h1>
      <div className="rule-gold mt-2 w-12" />
      <p className="mt-3 text-sm leading-[1.8] text-muted-foreground">{t("profileSetup.subtitle")}</p>

      {/* ------------------------------------------------------- progress */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-3 text-sm font-semibold leading-[1.8]">
          <span>{t("profileSetup.stepLabel", { current: step, total: TOTAL_STEPS })}</span>
          <span className="force-ltr text-muted-foreground">{progress}%</span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol className="mt-4 flex flex-wrap gap-2">
          {STEP_META.map((meta, index) => {
            const number = index + 1
            const active = number === step
            const complete = number < step
            return (
              <li key={meta.titleKey}>
                <span
                  className={
                    active
                      ? "flex min-h-tap items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold leading-[1.8] text-primary-foreground"
                      : complete
                        ? "flex min-h-tap items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm font-medium leading-[1.8] text-secondary-foreground"
                        : "flex min-h-tap items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm font-medium leading-[1.8] text-muted-foreground"
                  }
                >
                  {complete ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : <meta.icon className="h-4 w-4 shrink-0" aria-hidden />}
                  {t(meta.titleKey)}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      {/* ----------------------------------------------------------- body */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
        {step === 1 ? (
          <div>
            <h2 className="text-lg font-semibold leading-[1.5]">{t("profileSetup.landStep")}</h2>
            <p className="mt-2 text-sm leading-[1.8] text-muted-foreground">{t("profileSetup.landSizeHint")}</p>

            <div className="mt-5">
              <Label htmlFor="landValue" className="text-sm font-semibold leading-[1.7]">
                {t("profileSetup.landSize")}
              </Label>
              <div className="mt-2 flex flex-col gap-3 xs:flex-row">
                <Input
                  id="landValue"
                  type="number"
                  inputMode="decimal"
                  min={0.1}
                  step={0.1}
                  dir="ltr"
                  placeholder="5"
                  value={landValue}
                  onChange={(event) => setLandValue(event.target.value)}
                  className="force-ltr min-h-tap flex-1 text-start"
                />

                <div className="flex gap-2" role="group" aria-label={t("profileSetup.landSize")}>
                  {(["acres", "kanal"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setLandUnit(unit)}
                      aria-pressed={landUnit === unit}
                      className={
                        landUnit === unit
                          ? "min-h-tap flex-1 rounded-lg border-2 border-primary bg-primary px-4 text-sm font-semibold leading-[1.8] text-primary-foreground"
                          : "min-h-tap flex-1 rounded-lg border-2 border-border bg-card px-4 text-sm font-medium leading-[1.8] hover:bg-muted"
                      }
                    >
                      {unit === "acres" ? t("profileSetup.unitAcres") : t("profileSetup.unitKanal")}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-2 text-xs leading-[1.9] text-muted-foreground">{t("profileSetup.kanalNote")}</p>

              {landUnit === "kanal" && acres !== null ? (
                <p className="mt-2 text-sm font-medium leading-[1.8] text-primary">
                  <span className="force-ltr">{acres}</span> {t("units.acre")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-7">
            <div>
              <h2 className="text-lg font-semibold leading-[1.5]">{t("profileSetup.soilType")}</h2>
              <p className="mt-2 text-sm leading-[1.8] text-muted-foreground">{t("profileSetup.soilHint")}</p>

              <div className="mt-4 grid grid-cols-1 gap-2 xs:grid-cols-2">
                {SOILS.map((soil) => (
                  <button
                    key={soil.value}
                    type="button"
                    onClick={() => setSoilType(soil.value)}
                    aria-pressed={soilType === soil.value}
                    className={
                      soilType === soil.value
                        ? "flex min-h-tap items-center justify-between gap-2 rounded-lg border-2 border-primary bg-primary px-4 py-2 text-start text-sm font-semibold leading-[1.8] text-primary-foreground"
                        : "flex min-h-tap items-center justify-between gap-2 rounded-lg border-2 border-border bg-card px-4 py-2 text-start text-sm font-medium leading-[1.8] hover:bg-muted"
                    }
                  >
                    <span>{t(soil.labelKey)}</span>
                    {soilType === soil.value ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold leading-[1.5]">
                <Droplets className="h-5 w-5 text-info" aria-hidden />
                {t("profileSetup.irrigation")}
              </h2>

              <div className="mt-4 grid grid-cols-1 gap-2 xs:grid-cols-2">
                {WATER_SOURCES.map((source) => (
                  <button
                    key={source.value}
                    type="button"
                    onClick={() => setWaterSource(source.value)}
                    aria-pressed={waterSource === source.value}
                    className={
                      waterSource === source.value
                        ? "flex min-h-tap items-center justify-between gap-2 rounded-lg border-2 border-primary bg-primary px-4 py-2 text-start text-sm font-semibold leading-[1.8] text-primary-foreground"
                        : "flex min-h-tap items-center justify-between gap-2 rounded-lg border-2 border-border bg-card px-4 py-2 text-start text-sm font-medium leading-[1.8] hover:bg-muted"
                    }
                  >
                    <span>{t(source.labelKey)}</span>
                    {waterSource === source.value ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h2 className="text-lg font-semibold leading-[1.5]">{t("profileSetup.crops")}</h2>
            <p className="mt-2 text-sm leading-[1.8] text-muted-foreground">{t("profileSetup.cropsHint")}</p>
            <p className="mt-2 text-sm font-semibold leading-[1.8] text-primary">
              {t("profileSetup.cropsSelected", { count: crops.length })}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-3">
              {PAKISTAN_CROPS.map((crop) => {
                const selected = crops.includes(crop.key)
                return (
                  <button
                    key={crop.key}
                    type="button"
                    onClick={() => toggleCrop(crop.key)}
                    aria-pressed={selected}
                    className={
                      selected
                        ? "flex min-h-tap flex-col items-start rounded-lg border-2 border-primary bg-primary px-3 py-2 text-start text-primary-foreground"
                        : "flex min-h-tap flex-col items-start rounded-lg border-2 border-border bg-card px-3 py-2 text-start hover:bg-muted"
                    }
                  >
                    <span className="text-sm font-semibold leading-[1.7]">{crop.en}</span>
                    <span
                      lang="ur"
                      dir="rtl"
                      className={
                        selected
                          ? "font-nastaliq text-xs leading-[1.9] text-primary-foreground/85"
                          : "font-nastaliq text-xs leading-[1.9] text-muted-foreground"
                      }
                    >
                      {crop.ur}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <h2 className="text-lg font-semibold leading-[1.5]">{t("auth.preferredLanguage")}</h2>
            <p className="mt-2 text-sm leading-[1.8] text-muted-foreground">{t("profileSetup.languageHint")}</p>
            <div className="mt-4">
              <LanguageSwitcher variant="list" />
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-5 rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-[1.8] text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {/* ----------------------------------------------------- navigation */}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="min-h-tap"
          onClick={() => setStep((current) => Math.max(1, current - 1))}
          disabled={step === 1 || saving}
        >
          <ArrowLeft className="flip-rtl h-4 w-4" aria-hidden />
          {t("common.previous")}
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild variant="ghost" className="min-h-tap order-2 sm:order-1">
            <Link href="/dashboard">{t("profileSetup.skip")}</Link>
          </Button>

          {step < TOTAL_STEPS ? (
            <Button
              type="button"
              size="lg"
              className="min-h-tap order-1 sm:order-2"
              onClick={() => setStep((current) => Math.min(TOTAL_STEPS, current + 1))}
              disabled={!canContinue}
            >
              {t("common.next")}
              <ArrowRight className="flip-rtl h-5 w-5" aria-hidden />
            </Button>
          ) : (
            <Button type="button" size="lg" className="min-h-tap order-1 sm:order-2" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <span className="spinner" aria-hidden />
                  {t("profileSetup.saving")}
                </>
              ) : (
                <>
                  <Check className="h-5 w-5" aria-hidden />
                  {t("profileSetup.finish")}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
