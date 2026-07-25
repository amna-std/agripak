"use client"

/**
 * Create an account.
 *
 * Wired to `useAuth().register()`, which POSTs `/api/auth/register`, stores the
 * returned token and populates the auth context — so a new user lands logged in.
 *
 * The API enforces: name (>= 2), mobile `03XXXXXXXXX`, password (>= 6), village,
 * district and `state` (a Pakistani province). The fake
 * "12345" OTP gate that used to block this form are both gone; provinces and
 * districts now come from lib/data/pakistan-locations.ts so the values the form
 * submits are ones the backend already recognises.
 */

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Lock, Mail, MapPin, Smartphone, Sprout, User } from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { PROVINCES, PROVINCE_URDU, locationsByProvince, type Province } from "@/lib/data/pakistan-locations"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { ThemeToggle } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const PK_MOBILE = /^03\d{9}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Sentinel for "my district is not in the list" — never submitted as a value. */
const OTHER_DISTRICT = "__other__"

/** The three roles `/api/auth/register` accepts (buyer is aliased to seller). */
const ROLES = [
  { value: "farmer", labelKey: "auth.farmer" },
  { value: "seller", labelKey: "auth.dealer" },
  { value: "agriculture_expert", labelKey: "auth.expert" },
] as const

export default function SignUpPage() {
  const router = useRouter()
  const { t, currentLanguage } = useLanguage()
  const { register, user, loading } = useAuth()

  const [name, setName] = useState("")
  const [mobile, setMobile] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [province, setProvince] = useState<Province | "">("")
  const [district, setDistrict] = useState("")
  const [customDistrict, setCustomDistrict] = useState("")
  const [village, setVillage] = useState("")
  const [role, setRole] = useState<string>("farmer")

  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard")
  }, [loading, user, router])

  /** District headquarters we ship coordinates for, narrowed to the province. */
  const districts = useMemo(
    () => (province ? locationsByProvince(province).map((location) => location.name).sort() : []),
    [province],
  )

  const resolvedDistrict = district === OTHER_DISTRICT ? customDistrict.trim() : district

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (name.trim().length < 2) return setError(t("validation.tooShort"))
    if (!PK_MOBILE.test(mobile)) return setError(t("validation.invalidMobile"))
    if (email.trim() && !EMAIL.test(email.trim())) return setError(t("validation.invalidEmail"))
    if (password.length < 6) return setError(t("validation.passwordTooShort"))
    if (password !== confirmPassword) return setError(t("validation.passwordMismatch"))
    if (!province) return setError(t("validation.selectProvince"))
    if (resolvedDistrict.length < 2) return setError(t("validation.selectDistrict"))
    if (village.trim().length < 2) return setError(t("validation.required"))

    setSubmitting(true)
    try {
      const result = await register({
        name: name.trim(),
        mobile,
        email: email.trim() ? email.trim().toLowerCase() : undefined,
        password,
        role,
        village: village.trim(),
        district: resolvedDistrict,
        // The User model calls this field `state`; in Pakistan it holds a province.
        state: province,
        preferredLanguage: currentLanguage,
      })

      if (result.success) {
        // New farmers go straight into onboarding; everyone else to the dashboard.
        router.push(role === "farmer" ? "/profile-setup" : "/dashboard")
      } else {
        setError(result.message ?? t("validation.somethingWentWrong"))
      }
    } catch {
      setError(t("validation.networkError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="safe-t border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-2 px-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sprout className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-base font-bold leading-[1.4]">{t("common.appName")}</span>
              <span className="font-nastaliq text-xs leading-[1.9] text-muted-foreground" lang="ur" dir="rtl">
                {t("landing.appNameUrdu")}
              </span>
            </span>
          </Link>

          <div className="flex-1" />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main id="main-content" className="flex flex-1 justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-7">
            <h1 className="text-2xl font-bold leading-[1.35]">{t("auth.createAccount")}</h1>
            <div className="rule-gold mt-2 w-12" />
            <p className="mt-3 text-sm leading-[1.8] text-muted-foreground">{t("auth.signupSubtitle")}</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* -------------------------------------------------- name */}
                <div>
                  <Label htmlFor="name" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.fullName")}
                  </Label>
                  <div className="relative mt-2">
                    <User
                      className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="min-h-tap ps-11"
                    />
                  </div>
                </div>

                {/* ------------------------------------------------ mobile */}
                <div>
                  <Label htmlFor="mobile" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.mobileNumber")}
                  </Label>
                  <div className="relative mt-2">
                    <Smartphone
                      className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="mobile"
                      name="mobile"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder={t("auth.mobilePlaceholder")}
                      value={mobile}
                      onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 11))}
                      aria-describedby="mobile-hint"
                      className="force-ltr min-h-tap ps-11 text-start tracking-wide"
                    />
                  </div>
                  <p id="mobile-hint" className="mt-2 text-xs leading-[1.9] text-muted-foreground">
                    {t("auth.mobileHint")}
                  </p>
                </div>
              </div>

              {/* --------------------------------------------------- email */}
              <div>
                <Label htmlFor="email" className="text-sm font-semibold leading-[1.7]">
                  {t("auth.emailOptional")}
                </Label>
                <div className="relative mt-2">
                  <Mail
                    className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    placeholder="farmer@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="force-ltr min-h-tap ps-11 text-start"
                  />
                </div>
              </div>

              {/* ------------------------------------------------ location */}
              <fieldset className="rounded-xl border border-border p-4">
                <legend className="flex items-center gap-2 px-1 text-sm font-semibold leading-[1.7]">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  {t("marketplace.location")}
                </legend>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="province" className="text-sm font-semibold leading-[1.7]">
                      {t("auth.province")}
                    </Label>
                    <Select
                      value={province}
                      onValueChange={(value) => {
                        setProvince(value as Province)
                        setDistrict("")
                        setCustomDistrict("")
                      }}
                    >
                      <SelectTrigger id="province" className="mt-2 min-h-tap">
                        <SelectValue placeholder={t("auth.selectProvince")} />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVINCES.map((option) => (
                          <SelectItem key={option} value={option} className="min-h-tap">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="leading-[1.8]">{option}</span>
                              <span className="font-nastaliq text-xs leading-[1.9] text-muted-foreground" lang="ur" dir="rtl">
                                {PROVINCE_URDU[option]}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="district" className="text-sm font-semibold leading-[1.7]">
                      {t("auth.district")}
                    </Label>
                    <Select value={district} onValueChange={setDistrict} disabled={!province}>
                      <SelectTrigger id="district" className="mt-2 min-h-tap">
                        <SelectValue placeholder={t("auth.selectDistrict")} />
                      </SelectTrigger>
                      <SelectContent>
                        {districts.map((option) => (
                          <SelectItem key={option} value={option} className="min-h-tap">
                            {option}
                          </SelectItem>
                        ))}
                        <SelectItem value={OTHER_DISTRICT} className="min-h-tap">
                          {t("auth.districtOther")}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {district === OTHER_DISTRICT ? (
                      <Input
                        aria-label={t("auth.districtManual")}
                        placeholder={t("auth.districtManual")}
                        value={customDistrict}
                        onChange={(event) => setCustomDistrict(event.target.value)}
                        className="mt-2 min-h-tap"
                      />
                    ) : null}
                  </div>
                </div>

                <div className="mt-5">
                  <Label htmlFor="village" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.villageOrTown")}
                  </Label>
                  <Input
                    id="village"
                    name="village"
                    autoComplete="address-level3"
                    placeholder={t("auth.villagePlaceholder")}
                    value={village}
                    onChange={(event) => setVillage(event.target.value)}
                    className="mt-2 min-h-tap"
                  />
                </div>
              </fieldset>

              {/* ---------------------------------------------------- role */}
              <div>
                <span className="text-sm font-semibold leading-[1.7]">{t("auth.role")}</span>
                <div className="mt-2 grid grid-cols-1 gap-2 xs:grid-cols-3">
                  {ROLES.map((option) => {
                    const active = role === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRole(option.value)}
                        aria-pressed={active}
                        className={
                          active
                            ? "min-h-tap rounded-lg border-2 border-primary bg-primary px-3 py-2 text-sm font-semibold leading-[1.8] text-primary-foreground"
                            : "min-h-tap rounded-lg border-2 border-border bg-card px-3 py-2 text-sm font-medium leading-[1.8] text-foreground hover:bg-muted"
                        }
                      >
                        {t(option.labelKey)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ------------------------------------------------ password */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="password" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.password")}
                  </Label>
                  <div className="relative mt-2">
                    <Lock
                      className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      aria-describedby="password-hint"
                      className="min-h-tap px-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={t("auth.showPassword")}
                      aria-pressed={showPassword}
                      className="tap-target absolute end-0 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" aria-hidden />
                      ) : (
                        <Eye className="h-5 w-5" aria-hidden />
                      )}
                    </button>
                  </div>
                  <p id="password-hint" className="mt-2 text-xs leading-[1.9] text-muted-foreground">
                    {t("auth.passwordHint")}
                  </p>
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.confirmPassword")}
                  </Label>
                  <div className="relative mt-2">
                    <Lock
                      className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="min-h-tap ps-11"
                    />
                  </div>
                </div>
              </div>

              {error ? (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-[1.8] text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" className="min-h-tap w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <span className="spinner" aria-hidden />
                    {t("auth.creatingAccount")}
                  </>
                ) : (
                  t("auth.createAccount")
                )}
              </Button>
            </form>

            <div className="mt-6 border-t border-border pt-5 text-center text-sm leading-[1.8]">
              <span className="text-muted-foreground">{t("auth.alreadyHaveAccount")}</span>{" "}
              <Link href="/auth/login" className="font-semibold text-primary underline-offset-4 hover:underline">
                {t("auth.login")}
              </Link>
            </div>
          </div>

          <div className="mt-4 text-center">
            <Link
              href="/"
              className="inline-flex min-h-tap items-center gap-2 text-sm font-medium leading-[1.8] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="flip-rtl h-4 w-4" aria-hidden />
              {t("auth.backToHome")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
