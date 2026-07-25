"use client"

/**
 * Government scheme detail.
 *
 * Everything here comes from GET /api/schemes/[id]. The page that used to live
 * at this path hardcoded a single Indian scheme (PM-KISAN, "₹6,000/year",
 * documents: ["Aadhaar Card", ...]) with Hindi and Telugu copy, and imported an
 * `IndianRupee` icon. All of that is gone: the schemes are real Pakistani ones
 * and every field — including the document list — comes from the API.
 *
 * Two fields get their own treatment rather than being buried:
 *   `caveats` — where the published rules are ambiguous. A farmer deciding
 *               whether to spend a day at a bank branch needs to see this first.
 *   `sources` — the government pages each figure came from, so the numbers are
 *               checkable rather than taken on trust.
 *
 * Chrome (header / nav / bottom bar) belongs to components/AppShell.tsx — this
 * page renders content only.
 */

import type { ReactNode } from "react"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  Link2,
  MapPin,
  Phone,
  RefreshCw,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useLanguage } from "@/lib/contexts"
import { schemesApi } from "@/lib/api"

/* ------------------------------------------------------------------ types */

interface RelatedScheme {
  id: string
  name: string
  nameUr?: string
}

interface Scheme {
  id: string
  name: string
  nameUr?: string
  province?: string
  provincesCovered?: string[]
  category?: string
  description?: string
  descriptionUr?: string
  benefitAmount?: number
  benefitAmountLabel?: string
  currency?: string
  benefits?: string[]
  eligibility?: string[]
  documents?: string[]
  howToApply?: string
  officialUrl?: string
  implementingAgency?: string
  helpline?: string
  applicationWindow?: string | null
  status?: string
  featured?: boolean
  tags?: string[]
  caveats?: string[]
  sources?: string[]
  lastVerified?: string
  relatedSchemes?: RelatedScheme[]
}

/* --------------------------------------------------------------- fragments */

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Info
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

function BulletList({ items, marker }: { items: string[]; marker: "check" | "doc" }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-[1.8]">
          {marker === "check" ? (
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
          ) : (
            <FileText className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------- page */

export default function SchemeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { t, isRTL, formatCurrency } = useLanguage()

  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined)

  const [scheme, setScheme] = useState<Scheme | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** Urdu copy is only worth showing when the reader is already in an RTL script. */
  const localise = (english?: string, urdu?: string) => (isRTL && urdu ? urdu : english ?? "")

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res: any = await schemesApi.get(id)
      // The route nests the scheme under `data`; tolerate either shape.
      const payload = res?.data ?? res
      const found: Scheme | undefined = payload?.scheme ?? payload
      if (!found?.id) throw new Error(t("schemes.notFound"))
      setScheme(found)
    } catch (err: any) {
      setError(err?.message || t("schemes.loadError"))
      setScheme(null)
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => {
    load()
  }, [load])

  /* ------------------------------------------------------------- loading */

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  /* --------------------------------------------------------------- error */

  if (error || !scheme) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="text-sm leading-[1.8] text-muted-foreground">
              {error || t("schemes.notFound")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={load} className="min-h-tap gap-2">
                <RefreshCw className="h-4 w-4" aria-hidden />
                {t("common.retry")}
              </Button>
              <Button variant="outline" className="min-h-tap" onClick={() => router.push("/schemes")}>
                {t("schemes.backToSchemes")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* -------------------------------------------------------------- content */

  const title = localise(scheme.name, scheme.nameUr)
  const description = localise(scheme.description, scheme.descriptionUr)
  const provinces = scheme.provincesCovered?.length
    ? scheme.provincesCovered.join(", ")
    : scheme.province

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <Button variant="ghost" className="min-h-tap -ms-2 gap-2" onClick={() => router.push("/schemes")}>
        <ArrowLeft className={`h-4 w-4 ${isRTL ? "rotate-180" : ""}`} aria-hidden />
        {t("schemes.backToSchemes")}
      </Button>

      {/* headline */}
      <Card className="overflow-hidden">
        <div className="bg-primary px-5 py-6 text-primary-foreground">
          <div className="flex flex-wrap items-center gap-2">
            {scheme.status === "active" && (
              <Badge className="bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/20">
                {t("schemes.openNow")}
              </Badge>
            )}
            {scheme.category && (
              <Badge variant="outline" className="border-primary-foreground/30 text-primary-foreground">
                {scheme.category}
              </Badge>
            )}
          </div>

          <h1 className="mt-3 text-xl font-bold leading-[1.4] sm:text-2xl">{title}</h1>
          {!isRTL && scheme.nameUr && (
            <p className="font-nastaliq mt-2 text-base leading-[2] opacity-90" lang="ur" dir="rtl">
              {scheme.nameUr}
            </p>
          )}

          {provinces && (
            <p className="mt-3 flex items-center gap-1.5 text-sm opacity-90">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              {provinces}
            </p>
          )}
        </div>

        <CardContent className="space-y-4 pt-5">
          {description && <p className="text-sm leading-[1.9]">{description}</p>}

          {(scheme.benefitAmountLabel || typeof scheme.benefitAmount === "number") && (
            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Banknote className="h-4 w-4" aria-hidden />
                {t("schemes.benefit")}
              </p>
              <p className="mt-1.5 text-sm font-semibold leading-[1.8]">
                {scheme.benefitAmountLabel ?? formatCurrency(scheme.benefitAmount as number)}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {scheme.officialUrl && (
              <Button asChild className="min-h-tap gap-2">
                <a href={scheme.officialUrl} target="_blank" rel="noopener noreferrer">
                  {t("schemes.officialPage")}
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </Button>
            )}
            {scheme.helpline && (
              <Button variant="outline" className="min-h-tap gap-2" asChild>
                <a href={`tel:${scheme.helpline.replace(/[^\d+]/g, "")}`}>
                  <Phone className="h-4 w-4" aria-hidden />
                  <span dir="ltr">{scheme.helpline}</span>
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Caveats sit high on the page: they change whether applying is worth the trip. */}
      {scheme.caveats?.length ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base leading-[1.5]">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              {t("schemes.caveats")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {scheme.caveats.map((c, i) => (
                <li key={i} className="text-sm leading-[1.8] text-muted-foreground">
                  {c}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {scheme.benefits?.length ? (
        <Section icon={BadgeCheck} title={t("schemes.benefits")}>
          <BulletList items={scheme.benefits} marker="check" />
        </Section>
      ) : null}

      {scheme.eligibility?.length ? (
        <Section icon={CheckCircle2} title={t("schemes.eligibility")}>
          <BulletList items={scheme.eligibility} marker="check" />
        </Section>
      ) : null}

      {/* Documents come from the API — CNIC, PLRA fard and so on, never a hardcoded list. */}
      {scheme.documents?.length ? (
        <Section icon={FileText} title={t("schemes.requiredDocuments")}>
          <BulletList items={scheme.documents} marker="doc" />
        </Section>
      ) : null}

      {scheme.howToApply && (
        <Section icon={Info} title={t("schemes.howToApply")}>
          <p className="text-sm leading-[1.9]">{scheme.howToApply}</p>
          {scheme.applicationWindow && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
              {scheme.applicationWindow}
            </p>
          )}
        </Section>
      )}

      {scheme.implementingAgency && (
        <Section icon={Building2} title={t("schemes.implementingAgency")}>
          <p className="text-sm leading-[1.9]">{scheme.implementingAgency}</p>
        </Section>
      )}

      {scheme.relatedSchemes?.length ? (
        <Section icon={Link2} title={t("schemes.relatedSchemes")}>
          <div className="flex flex-col gap-2">
            {scheme.relatedSchemes.map((r) => (
              <Link
                key={r.id}
                href={`/schemes/${r.id}`}
                className="min-h-tap rounded-lg border border-border px-3 py-2.5 text-sm leading-[1.7] transition-colors hover:bg-muted"
              >
                {localise(r.name, r.nameUr)}
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Provenance: every figure above is checkable against these pages. */}
      {scheme.sources?.length ? (
        <Section icon={Link2} title={t("schemes.sources")}>
          <ul className="space-y-2">
            {scheme.sources.map((src, i) => (
              <li key={i}>
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="block break-all text-start text-sm leading-[1.8] text-primary underline underline-offset-2"
                >
                  {src}
                </a>
              </li>
            ))}
          </ul>
          {scheme.lastVerified && (
            <p className="mt-3 text-xs leading-[1.9] text-muted-foreground">
              {t("schemes.lastVerified")} {scheme.lastVerified}
            </p>
          )}
        </Section>
      ) : null}
    </div>
  )
}
