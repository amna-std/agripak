/**
 * Scheme filtering and the eligibility matcher.
 *
 * `_lib` is a Next.js private folder — nothing here is routable.
 */

import { authenticate } from "@/lib/auth-helpers"
import {
  PAKISTAN_SCHEMES,
  type CoveredProvince,
  type LandSizeRule,
  type Scheme,
  type SchemeCategory,
  type SchemeProvince,
  type SchemeStatus,
  type Tenure,
} from "@/lib/data/pakistan-schemes"
import { normalizeProvince } from "../../auth/_lib/pakistan"

/* --------------------------------------------------------------------- auth */

/** Schemes are public information; a token only personalises the answer. */
export async function optionalUser(req: Request): Promise<any | null> {
  try {
    const auth = await authenticate(req)
    return auth.ok ? auth.user : null
  } catch {
    return null
  }
}

/* ---------------------------------------------------------------- normalise */

const TENURE_ALIASES: Record<string, Tenure> = {
  owner: "owner",
  malik: "owner",
  landowner: "owner",
  "owner-cum-tenant": "owner-cum-tenant",
  "owner cum tenant": "owner-cum-tenant",
  tenant: "tenant",
  mazara: "tenant",
  muzara: "tenant",
  haari: "sharecropper",
  hari: "sharecropper",
  sharecropper: "sharecropper",
  "share-cropper": "sharecropper",
  batai: "sharecropper",
  landless: "landless",
  "be-zameen": "landless",
}

export function normalizeTenure(raw: unknown): Tenure | null {
  if (typeof raw !== "string") return null
  return TENURE_ALIASES[raw.trim().toLowerCase()] ?? null
}

/** Acres, converting from hectares/kanal/marla when the caller says so. */
export function toAcres(value: unknown, unit?: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN
  if (!Number.isFinite(n) || n < 0) return null
  switch (String(unit ?? "acres").trim().toLowerCase()) {
    case "hectare":
    case "hectares":
      return Number((n * 2.471).toFixed(3))
    case "kanal":
      return Number((n / 8).toFixed(3))
    case "marla":
      return Number((n / 160).toFixed(4))
    default:
      return n
  }
}

/* --------------------------------------------------------------- filtering */

export interface SchemeFilters {
  province?: SchemeProvince | CoveredProvince | null
  category?: SchemeCategory | null
  status?: SchemeStatus | "all" | null
  search?: string | null
  featured?: boolean
}

/**
 * `?province=` accepts either the short label ("KPK") or the canonical name
 * ("Khyber Pakhtunkhwa"), and always returns the federal schemes too — a Sindh
 * farmer is eligible for both Sindh and federal programmes.
 */
export function resolveProvince(raw: unknown): { label: SchemeProvince | null; canonical: CoveredProvince | null } {
  if (typeof raw !== "string" || !raw.trim() || raw.trim().toLowerCase() === "all") {
    return { label: null, canonical: null }
  }
  const value = raw.trim()
  if (value.toLowerCase() === "federal") return { label: "Federal", canonical: null }

  const canonical = normalizeProvince(value) as CoveredProvince | null
  if (!canonical) return { label: null, canonical: null }

  const label: SchemeProvince | null =
    canonical === "Punjab"
      ? "Punjab"
      : canonical === "Sindh"
        ? "Sindh"
        : canonical === "Khyber Pakhtunkhwa"
          ? "KPK"
          : canonical === "Balochistan"
            ? "Balochistan"
            : null

  return { label, canonical }
}

/**
 * Resolves a scheme id (or exact name) within a specific list.
 *
 * The `findScheme` helper in the data module is bound to the curated file's
 * own lookup table, so it cannot see a refreshed record whose `status` or
 * amount has changed. Routes serving the merged list must look up inside that
 * list instead, or the detail page would silently serve stale values that the
 * list page has already corrected.
 */
export function findSchemeIn(schemes: Scheme[], id: string): Scheme | null {
  if (!id) return null
  const key = decodeURIComponent(id).trim().toLowerCase()
  return schemes.find((s) => s.id === key) ?? schemes.find((s) => s.name.toLowerCase() === key) ?? null
}

/**
 * `schemes` defaults to the curated file so existing callers keep working;
 * routes pass the merged database-or-curated list from `loadSchemes()`.
 */
export function filterSchemes(filters: SchemeFilters, schemes: Scheme[] = PAKISTAN_SCHEMES): Scheme[] {
  let list = [...schemes]

  if (filters.province) {
    const { label, canonical } = resolveProvince(filters.province)
    if (label === "Federal") {
      list = list.filter((s) => s.province === "Federal")
    } else if (canonical) {
      // Provincial schemes for that province, plus everything federal.
      list = list.filter((s) => s.provincesCovered.includes(canonical))
    }
  }

  if (filters.category) list = list.filter((s) => s.category === filters.category)

  if (filters.status && filters.status !== "all") {
    list = list.filter((s) => s.status === filters.status)
  }

  if (filters.featured) list = list.filter((s) => s.featured)

  if (filters.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.nameUr.includes(filters.search!) ||
        s.id.includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((tag) => tag.includes(q)),
    )
  }

  // Active first, then featured, then by headline value.
  return list.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : b.status === "active" ? 1 : 0
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    return (b.benefitAmount ?? 0) - (a.benefitAmount ?? 0)
  })
}

/* -------------------------------------------------------------- eligibility */

export interface Applicant {
  province: CoveredProvince | null
  landSizeAcres: number | null
  tenure: Tenure | null
  hasLandRecord: boolean | null
  source: "body" | "profile" | "mixed" | "none"
}

export interface SchemeMatch {
  schemeId: string
  name: string
  nameUr: string
  province: SchemeProvince
  category: SchemeCategory
  status: SchemeStatus
  benefitAmount: number | null
  benefitAmountLabel: string
  officialUrl: string
  howToApply: string
  eligible: boolean
  /** 0–100 confidence, reduced by each blocker and each unchecked field. */
  score: number
  matched: string[]
  blockers: string[]
  /** Fields the applicant did not supply, so we could not check them. */
  unknowns: string[]
  notes: string[]
}

function landRuleFor(scheme: Scheme, province: CoveredProvince | null): LandSizeRule | undefined {
  const rules = scheme.eligibilityRules
  if (province && rules.landSizeByProvince?.[province]) return rules.landSizeByProvince[province]
  return rules.landSizeAcres
}

export function matchScheme(scheme: Scheme, applicant: Applicant): SchemeMatch {
  const rules = scheme.eligibilityRules
  const matched: string[] = []
  const blockers: string[] = []
  const unknowns: string[] = []
  const notes: string[] = [...(rules.notes ?? [])]

  /* province */
  if (rules.provinces === "all") {
    matched.push("Open nationwide")
  } else if (!applicant.province) {
    unknowns.push("Province not provided — could not confirm regional eligibility")
  } else if (rules.provinces.includes(applicant.province)) {
    matched.push(`Available in ${applicant.province}`)
  } else {
    blockers.push(`Only for farmers in ${rules.provinces.join(", ")} — you are in ${applicant.province}`)
  }

  /* land size */
  const landRule = landRuleFor(scheme, applicant.province)
  if (landRule && (landRule.min !== undefined || landRule.max !== undefined)) {
    if (applicant.landSizeAcres === null) {
      unknowns.push("Land size not provided — could not check the holding limit")
    } else {
      const { min, max, label } = landRule
      if (min !== undefined && applicant.landSizeAcres < min) {
        blockers.push(
          label
            ? `${label} — you reported ${applicant.landSizeAcres} acres`
            : `Requires at least ${min} acres — you reported ${applicant.landSizeAcres}`,
        )
      } else if (max !== undefined && applicant.landSizeAcres > max) {
        blockers.push(
          label
            ? `${label} — you reported ${applicant.landSizeAcres} acres`
            : `Limited to holdings of ${max} acres or less — you reported ${applicant.landSizeAcres}`,
        )
      } else {
        const bound = label ?? (max !== undefined ? `up to ${max} acres` : `${min} acres or more`)
        matched.push(`Your holding of ${applicant.landSizeAcres} acres fits the limit (${bound})`)
      }
    }
  }

  /* tenure */
  if (rules.tenure?.length) {
    if (!applicant.tenure) {
      unknowns.push("Tenure not provided — could not check whether owners, tenants or landless applicants qualify")
    } else if (rules.tenure.includes(applicant.tenure)) {
      matched.push(`Open to ${applicant.tenure.replace(/-/g, " ")} farmers`)
    } else {
      blockers.push(`Open to ${rules.tenure.join(", ")} only — you are ${applicant.tenure.replace(/-/g, " ")}`)
    }
  }

  /* land record */
  if (rules.requiresLandRecord) {
    if (applicant.hasLandRecord === null) {
      unknowns.push("Land record status not provided — this scheme needs a verified revenue record")
    } else if (applicant.hasLandRecord) {
      matched.push("You have a verified land record")
    } else {
      blockers.push("Requires a land record verified by the revenue department (fard / Form VII / PLRA entry)")
    }
  }

  if (rules.disqualifiers?.length) {
    notes.push(`Also disqualifying: ${rules.disqualifiers.join("; ")}. Check these apply to you before applying.`)
  }

  if (scheme.status === "closed") {
    notes.push(
      scheme.applicationWindow
        ? `Applications are currently closed. ${scheme.applicationWindow}`
        : "Applications are currently closed — watch the official page for the next round.",
    )
  }

  const eligible = blockers.length === 0
  const score = Math.max(0, Math.min(100, 100 - blockers.length * 45 - unknowns.length * 12))

  return {
    schemeId: scheme.id,
    name: scheme.name,
    nameUr: scheme.nameUr,
    province: scheme.province,
    category: scheme.category,
    status: scheme.status,
    benefitAmount: scheme.benefitAmount,
    benefitAmountLabel: scheme.benefitAmountLabel,
    officialUrl: scheme.officialUrl,
    howToApply: scheme.howToApply,
    eligible,
    score,
    matched,
    blockers,
    unknowns,
    notes,
  }
}

/** Compact object for list endpoints — the full record is on the detail route. */
export function toSummary(scheme: Scheme) {
  return {
    id: scheme.id,
    name: scheme.name,
    nameUr: scheme.nameUr,
    province: scheme.province,
    provincesCovered: scheme.provincesCovered,
    category: scheme.category,
    description: scheme.description,
    descriptionUr: scheme.descriptionUr,
    benefitAmount: scheme.benefitAmount,
    benefitAmountLabel: scheme.benefitAmountLabel,
    currency: "PKR",
    status: scheme.status,
    featured: scheme.featured,
    officialUrl: scheme.officialUrl,
    implementingAgency: scheme.implementingAgency,
    applicationWindow: scheme.applicationWindow ?? null,
    tags: scheme.tags,
    lastVerified: scheme.lastVerified,
  }
}
