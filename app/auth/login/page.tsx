"use client"

/**
 * Log in — Pakistani mobile number (03XXXXXXXXX) or email, plus a password.
 *
 * The fake OTP flow that used to live here accepted a hardcoded "12345" and
 * minted a client-side token, which let anyone past the door. `/api/auth/send-otp`
 * and `/api/auth/verify-otp` are now disabled (501), so the UI is gone too —
 * per AGENT_CONTRACT rule 6, a feature either works or is cleanly removed from
 * the interface. Password login goes through `useAuth().login()` so the provider
 * state is populated and the dashboard guard does not bounce the user back.
 */

import type React from "react"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Smartphone, Sprout } from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { ThemeToggle } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Pakistani mobile: 11 digits, always starting 03. */
const PK_MOBILE = /^03\d{9}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type Mode = "mobile" | "email"

export default function LoginPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const { login, user, loading } = useAuth()

  const [mode, setMode] = useState<Mode>("mobile")
  const [mobile, setMobile] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Someone who is already signed in has no business on this screen.
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard")
  }, [loading, user, router])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (mode === "mobile" && !PK_MOBILE.test(mobile)) {
      setError(t("validation.invalidMobile"))
      return
    }
    if (mode === "email" && !EMAIL.test(email.trim())) {
      setError(t("validation.invalidEmail"))
      return
    }
    if (password.length < 6) {
      setError(t("validation.passwordTooShort"))
      return
    }

    setSubmitting(true)
    try {
      const result = await login(
        mode === "mobile"
          ? { mobile, password }
          : { email: email.trim().toLowerCase(), password },
      )

      if (result.success) {
        router.push("/dashboard")
      } else {
        setError(result.message ?? t("validation.somethingWentWrong"))
        setPassword("")
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
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-2 px-3 sm:px-6">
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

      <main id="main-content" className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-7">
            <h1 className="text-2xl font-bold leading-[1.35]">{t("auth.welcomeBack")}</h1>
            <div className="rule-gold mt-2 w-12" />
            <p className="mt-3 text-sm leading-[1.8] text-muted-foreground">{t("auth.loginSubtitle")}</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
              {mode === "mobile" ? (
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
              ) : (
                <div>
                  <Label htmlFor="email" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.emailAddress")}
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
              )}

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
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="min-h-tap px-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={t("auth.showPassword")}
                    aria-pressed={showPassword}
                    className="tap-target absolute end-0 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                  </button>
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
                    {t("auth.loggingIn")}
                  </>
                ) : (
                  t("auth.login")
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setMode((current) => (current === "mobile" ? "email" : "mobile"))
                  setError(null)
                }}
                className={cn(
                  "min-h-tap w-full rounded-lg text-sm font-semibold leading-[1.8] text-primary underline-offset-4 hover:underline",
                )}
              >
                {mode === "mobile" ? t("auth.useEmailInstead") : t("auth.useMobileInstead")}
              </button>
            </form>

            <div className="mt-6 border-t border-border pt-5 text-center text-sm leading-[1.8]">
              <span className="text-muted-foreground">{t("auth.dontHaveAccount")}</span>{" "}
              <Link href="/auth/signup" className="font-semibold text-primary underline-offset-4 hover:underline">
                {t("auth.signup")}
              </Link>
            </div>
          </div>

          {/* Demo credentials — this build is a reviewable prototype, and hiding the
              login it ships with helps nobody. */}
          <div className="mt-4 rounded-xl border border-gold/50 bg-gold-surface px-4 py-3">
            <p className="text-sm font-semibold leading-[1.8] text-gold-foreground">{t("auth.demoTitle")}</p>
            <p className="mt-1 text-sm leading-[1.8] text-gold-foreground/90">{t("auth.demoHint")}</p>
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
