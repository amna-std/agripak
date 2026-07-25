"use client"

/**
 * AgriPak landing page — the public front door.
 *
 * This route is "chromeless" (see components/nav-items.ts), so it renders its own
 * slim header. Everything user-facing goes through `t()`; the only literal strings
 * are the bilingual brand lockup, which is a constant in all five locale files.
 *
 * No invented statistics live here. The old page advertised "50K+ farmers" and
 * "98% accuracy" — numbers nobody could substantiate — so they are gone. What is
 * shown instead is the feature set that actually ships.
 */

import Link from "next/link"
import { useMemo } from "react"
import {
  ArrowRight,
  Bot,
  Cloud,
  FileText,
  Languages,
  Leaf,
  MapPin,
  MessageCircle,
  ScanLine,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sprout,
  TrendingUp,
  Volume2,
  Wallet,
} from "lucide-react"

import { useAuth, useLanguage } from "@/lib/contexts"
import { PROVINCE_URDU, PROVINCES } from "@/lib/data/pakistan-locations"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { ThemeToggle } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

const FEATURES = [
  { href: "/weather", icon: Cloud, title: "landing.featureWeather", body: "landing.featureWeatherBody" },
  { href: "/market", icon: TrendingUp, title: "landing.featureMarket", body: "landing.featureMarketBody" },
  { href: "/crop-scan", icon: ScanLine, title: "landing.featureScan", body: "landing.featureScanBody" },
  { href: "/crop-advisor", icon: Leaf, title: "landing.featureAdvisor", body: "landing.featureAdvisorBody" },
  { href: "/schemes", icon: FileText, title: "landing.featureSchemes", body: "landing.featureSchemesBody" },
  { href: "/marketplace", icon: ShoppingCart, title: "landing.featureMarketplace", body: "landing.featureMarketplaceBody" },
  { href: "/community", icon: MessageCircle, title: "landing.featureCommunity", body: "landing.featureCommunityBody" },
  { href: "/ai-assistant", icon: Bot, title: "landing.featureAi", body: "landing.featureAiBody" },
] as const

const STEPS = [
  { title: "landing.howStep1", body: "landing.howStep1Body" },
  { title: "landing.howStep2", body: "landing.howStep2Body" },
  { title: "landing.howStep3", body: "landing.howStep3Body" },
] as const

const TRUST = [
  { icon: MapPin, label: "landing.trustNationwide" },
  { icon: Languages, label: "landing.trustLanguages" },
  { icon: Wallet, label: "landing.trustFree" },
  { icon: Smartphone, label: "landing.trustMobile" },
] as const

export default function HomePage() {
  const { t, currentLanguage, speak } = useLanguage()
  const { user, loading } = useAuth()

  /** The Urdu companion headline is only useful when the page itself is English. */
  const showUrduHeadline = currentLanguage === "en"

  const provinces = useMemo(
    () => PROVINCES.map((province) => ({ en: province, ur: PROVINCE_URDU[province] })),
    [],
  )

  return (
    <div className="min-h-screen bg-background">
      {/* ------------------------------------------------------------ header */}
      <header className="safe-t sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sprout className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-base font-bold leading-[1.4] sm:text-lg">{t("common.appName")}</span>
              <span className="font-nastaliq text-xs leading-[1.9] text-muted-foreground" lang="ur" dir="rtl">
                {t("landing.appNameUrdu")}
              </span>
            </span>
          </Link>

          <div className="flex-1" />

          <LanguageSwitcher />
          <ThemeToggle />

          <Button asChild size="sm" variant="ghost" className="hidden min-h-tap sm:inline-flex">
            <Link href="/auth/login">{t("landing.ctaLogin")}</Link>
          </Button>
          <Button asChild size="sm" className="min-h-tap">
            <Link href={user ? "/dashboard" : "/auth/signup"}>
              {user ? t("nav.dashboard") : t("auth.signup")}
            </Link>
          </Button>
        </div>
      </header>

      <main id="main-content">
        {/* -------------------------------------------------------- hero */}
        <section className="relative overflow-hidden bg-brand-gradient">
          {/* Soft field-furrow texture. Decorative only. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 18% 20%, rgba(255,255,255,0.55) 0, transparent 42%), radial-gradient(circle at 82% 8%, rgba(212,175,55,0.5) 0, transparent 38%)",
            }}
          />

          {/* `bg-brand-gradient` already sets `color: --brand-foreground`, which
              flips with the theme — so nothing in here hardcodes white. */}
          <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-foreground/30 bg-brand-foreground/10 px-3 py-1.5 text-sm font-semibold leading-[1.7]">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
              {t("landing.badge")}
            </span>

            <h1 className="mt-5 max-w-3xl text-3xl font-extrabold leading-[1.2] xs:text-4xl sm:text-5xl lg:text-6xl">
              {t("landing.headline")}
            </h1>

            {showUrduHeadline ? (
              <p
                lang="ur"
                dir="rtl"
                className="font-nastaliq mt-3 max-w-3xl text-xl leading-[2.1] text-gold-surface sm:text-2xl"
              >
                {t("landing.headlineUrdu")}
              </p>
            ) : null}

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-brand-foreground/90 sm:text-lg">
              {t("landing.subheadline")}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                asChild
                size="lg"
                className="min-h-tap w-full bg-background text-brand hover:bg-background/90 sm:w-auto"
              >
                <Link href={user ? "/dashboard" : "/auth/signup"}>
                  {loading ? t("common.loading") : user ? t("nav.dashboard") : t("landing.ctaStart")}
                  <ArrowRight className="flip-rtl h-5 w-5" aria-hidden />
                </Link>
              </Button>

              <Button
                asChild
                size="lg"
                variant="outline"
                className="min-h-tap w-full border-2 border-brand-foreground/60 bg-transparent text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground sm:w-auto"
              >
                <Link href="/auth/login">{t("landing.ctaLogin")}</Link>
              </Button>

              <Button
                type="button"
                size="lg"
                variant="ghost"
                onClick={() => speak(`${t("landing.headline")}. ${t("landing.subheadline")}`)}
                className="min-h-tap w-full text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground sm:w-auto"
              >
                <Volume2 className="h-5 w-5" aria-hidden />
                {t("ai.readAloud")}
              </Button>
            </div>

            <ul className="mt-9 grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
              {TRUST.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-start gap-2 rounded-xl border border-brand-foreground/25 bg-brand-foreground/10 px-3 py-3 text-sm font-medium leading-[1.7]"
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gold-surface" aria-hidden />
                  <span>{t(label)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------- features */}
        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold leading-[1.35] sm:text-3xl">{t("landing.featuresTitle")}</h2>
            <div className="rule-gold mt-3 w-16" />
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {t("landing.featuresSubtitle")}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ href, icon: Icon, title, body }) => (
              <Link
                key={href}
                href={href}
                className="card-hover group flex min-h-tap flex-col rounded-2xl border border-border bg-card p-5 shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold leading-[1.5]">{t(title)}</h3>
                <p className="mt-2 flex-1 text-sm leading-[1.8] text-muted-foreground">{t(body)}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold leading-[1.7] text-primary">
                  {t("common.seeMore")}
                  <ArrowRight className="flip-rtl h-4 w-4" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------- how it works */}
        <section className="border-y border-border bg-muted/50">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 className="text-2xl font-bold leading-[1.35] sm:text-3xl">{t("landing.howTitle")}</h2>
            <div className="rule-gold mt-3 w-16" />

            <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {STEPS.map(({ title, body }, index) => (
                <li key={title} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold leading-[1.5]">{t(title)}</h3>
                  <p className="mt-2 text-sm leading-[1.8] text-muted-foreground">{t(body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------- coverage + languages */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary">
              <MapPin className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-bold leading-[1.4] sm:text-2xl">{t("landing.coverageTitle")}</h2>
            <p className="mt-2 text-sm leading-[1.8] text-muted-foreground">{t("landing.coverageBody")}</p>

            <ul className="mt-5 flex flex-wrap gap-2">
              {provinces.map((province) => (
                <li
                  key={province.en}
                  className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-medium leading-[1.7] text-secondary-foreground"
                >
                  {province.en}
                  <span className="font-nastaliq ms-2 text-xs leading-[1.9] text-muted-foreground" lang="ur" dir="rtl">
                    {province.ur}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-surface text-gold-foreground">
              <Languages className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-bold leading-[1.4] sm:text-2xl">{t("landing.languagesTitle")}</h2>
            <p className="mt-2 text-sm leading-[1.8] text-muted-foreground">{t("landing.languagesBody")}</p>

            <div className="mt-5">
              <LanguageSwitcher variant="list" />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- final call */}
        <section className="border-t border-border bg-brand-gradient">
          <div className="mx-auto w-full max-w-4xl px-4 py-12 text-center sm:px-6 sm:py-16">
            <h2 className="text-2xl font-bold leading-[1.35] sm:text-3xl">{t("landing.finalTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-brand-foreground/90">
              {t("landing.finalBody")}
            </p>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-tap w-full bg-background text-brand hover:bg-background/90 sm:w-auto">
                <Link href={user ? "/dashboard" : "/auth/signup"}>
                  {user ? t("nav.dashboard") : t("landing.ctaStart")}
                  <ArrowRight className="flip-rtl h-5 w-5" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="min-h-tap w-full border-2 border-brand-foreground/60 bg-transparent text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground sm:w-auto"
              >
                <Link href="/auth/login">{t("landing.ctaLogin")}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------ footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sprout className="h-5 w-5" aria-hidden />
              </span>
              <span className="flex flex-col">
                <span className="font-bold leading-[1.4]">{t("common.appName")}</span>
                <span className="text-sm leading-[1.7] text-muted-foreground">{t("common.tagline")}</span>
              </span>
            </div>
            <p className="text-sm leading-[1.8] text-muted-foreground">{t("landing.footerRights")}</p>
          </div>

          <p className="mt-6 border-t border-border pt-4 text-xs leading-[1.9] text-muted-foreground">
            {t("landing.honestNote")}
          </p>
        </div>
      </footer>
    </div>
  )
}
