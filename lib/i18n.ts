/**
 * AgriPak i18n core (framework-free).
 *
 * Five languages: English (en) + Urdu (ur), Punjabi/Shahmukhi (pa), Sindhi (sd),
 * Pashto (ps). All four Pakistani languages are right-to-left.
 * Hindi and Telugu were removed in the Pakistan rebuild — do not re-add them.
 *
 * Dictionaries live in `lib/data/translations/*`. `en.ts` is the schema source of
 * truth, so a key missing from any other locale is a TypeScript error.
 *
 * Usage in a client component (preferred):
 *
 *   const { t, dir, formatCurrency } = useLanguage()   // lib/contexts/LanguageContext
 *   t("market.title")            // -> "منڈی کے بھاؤ"
 *   formatCurrency(3500)         // -> "Rs 3,500"
 *
 * Usage outside React (server components, utils, API formatting):
 *
 *   import { translate, formatCurrency } from "@/lib/i18n"
 *   translate("crops.wheat", "ur")
 */

import {
  DEFAULT_LANGUAGE,
  dictionaries,
  getDirection,
  getLocale,
  isLanguageCode,
  isRTL,
  languageCodes,
  languageList,
  languageMeta,
  languages,
  normalizeLanguage,
  rtlLanguages,
} from "./data/translations"
import type { Direction, LanguageCode, LanguageMeta, TranslationKey, TranslationSchema } from "./data/translations"

export {
  DEFAULT_LANGUAGE,
  dictionaries,
  getDirection,
  getLocale,
  isLanguageCode,
  isRTL,
  languageCodes,
  languageList,
  languageMeta,
  languages,
  normalizeLanguage,
  rtlLanguages,
}
export type { Direction, LanguageCode, LanguageMeta, TranslationKey, TranslationSchema }

/* Kept as a named export because older code imported `translations` from here. */
export const translations = dictionaries

/** Values that can be interpolated into a translated string. */
export type TranslationVars = Record<string, string | number>

/**
 * Legacy flat keys used by the pre-Pakistan build (`t("home")`, `t("weather")`, ...).
 * Mapped onto the new namespaced keys so old call sites keep working.
 * New code should always use the full dot path.
 */
const LEGACY_KEY_ALIASES: Record<string, TranslationKey> = {
  home: "nav.home",
  market: "nav.market",
  sell: "nav.sell",
  crop: "crops.crop",
  crops: "crops.title",
  profile: "nav.profile",
  loading: "common.loading",
  error: "common.error",
  success: "common.success",
  cancel: "common.cancel",
  save: "common.save",
  edit: "common.edit",
  delete: "common.delete",
  login: "auth.login",
  signup: "auth.signup",
  logout: "auth.logout",
  phone: "auth.mobileNumber",
  password: "auth.password",
  profileSetup: "auth.profileSetup",
  personalInfo: "auth.personalInfo",
  farmDetails: "auth.farmDetails",
  farmingType: "auth.farmingType",
  marketplace: "marketplace.title",
  products: "marketplace.products",
  cart: "marketplace.cart",
  orders: "marketplace.orders",
  weather: "weather.title",
  temperature: "weather.temperature",
  humidity: "weather.humidity",
  cropGuidance: "crops.guidance",
  cropScanner: "crops.diseaseDetection",
  community: "community.title",
  forum: "community.forum",
  expert: "auth.expert",
  notifications: "nav.notifications",
}

function lookup(dict: TranslationSchema, key: string): string | undefined {
  // hasOwnProperty, not `LEGACY_KEY_ALIASES[key]`: a key such as "toString" or
  // "constructor" would otherwise resolve to an inherited Object.prototype member
  // and blow up on `.split()`.
  const alias = Object.prototype.hasOwnProperty.call(LEGACY_KEY_ALIASES, key) ? LEGACY_KEY_ALIASES[key] : undefined
  const path = (alias ?? key).split(".")
  let node: unknown = dict
  for (const segment of path) {
    if (typeof node !== "object" || node === null) return undefined
    if (!Object.prototype.hasOwnProperty.call(node, segment)) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === "string" ? node : undefined
}

/** Replaces `{name}` placeholders. */
function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  )
}

/**
 * Translate a dot-path key.
 *
 * Resolution order: requested language -> English -> the key itself (so a missing
 * string is visible in the UI rather than rendering as an empty element).
 */
export function translate(
  key: TranslationKey | (string & {}),
  lang: LanguageCode | string = DEFAULT_LANGUAGE,
  vars?: TranslationVars,
): string {
  const code = normalizeLanguage(lang)
  const value = lookup(dictionaries[code], key) ?? lookup(dictionaries[DEFAULT_LANGUAGE], key)
  return interpolate(value ?? key, vars)
}

/** Backwards-compatible alias for the old `getTranslation(key, lang)` helper. */
export const getTranslation = (key: string, lang: string = DEFAULT_LANGUAGE, vars?: TranslationVars): string =>
  translate(key, lang, vars)

/** Returns a bound `t()` for one language. */
export function createTranslator(lang: LanguageCode | string) {
  const code = normalizeLanguage(lang)
  return (key: TranslationKey | (string & {}), vars?: TranslationVars) => translate(key, code, vars)
}

/* ------------------------------------------------------------------ numbers */

/**
 * Numbers are always rendered with Latin digits and 1,234,567 grouping, in every
 * language. Pakistani farmers read Latin digits on price boards and phone screens,
 * and `ur-PK` would otherwise emit Eastern-Arabic digits (۱۲۳) plus lakh grouping.
 */
const NUMERIC_LOCALE = "en-US"

export interface NumberFormatOptions {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

export function formatNumber(value: number | string, options: NumberFormatOptions = {}): string {
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n)) return "—"
  return new Intl.NumberFormat(NUMERIC_LOCALE, {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
  }).format(n)
}

/* ----------------------------------------------------------------- currency */

/** ISO code for the only currency this app deals in. */
export const CURRENCY_CODE = "PKR"

/** `"Rs"` is the default; `"₨"` and `"PKR"` are the other accepted forms. The Indian rupee sign is never valid. */
export type CurrencySymbol = "Rs" | "₨" | "PKR"

export interface CurrencyFormatOptions extends NumberFormatOptions {
  /** Symbol to prefix. Default `"Rs"`. */
  symbol?: CurrencySymbol
  /** Drop the symbol and return the grouped number only. */
  hideSymbol?: boolean
  /**
   * Shorten large amounts using South Asian units — 350000 -> "Rs 3.5 lakh".
   * The unit word is translated into `lang`.
   */
  compact?: boolean
  /** Language used for the compact unit word. Ignored unless `compact` is true. */
  lang?: LanguageCode | string
}

/**
 * Format an amount in Pakistani Rupees.
 *
 *   formatCurrency(3500)                          // "Rs 3,500"
 *   formatCurrency(3500, { symbol: "₨" })         // "₨ 3,500"
 *   formatCurrency(350000, { compact: true })     // "Rs 3.5 lakh"
 *   formatCurrency(350000, { compact: true, lang: "ur" })  // "Rs 3.5 لاکھ"
 */
export function formatCurrency(amount: number | string | null | undefined, options: CurrencyFormatOptions = {}): string {
  const { symbol = "Rs", hideSymbol = false, compact = false, lang = DEFAULT_LANGUAGE, ...numberOptions } = options

  const n = typeof amount === "string" ? Number(amount) : amount
  if (n === null || n === undefined || !Number.isFinite(n)) return hideSymbol ? "—" : `${symbol} —`

  const prefix = hideSymbol ? "" : `${symbol} `
  const sign = n < 0 ? "-" : ""
  const abs = Math.abs(n)

  if (compact && abs >= 1000) {
    const unit = (key: "thousand" | "lakh" | "crore") => translate(`currency.${key}`, lang)
    const short = (value: number) =>
      formatNumber(value, { maximumFractionDigits: value < 10 ? 1 : 0, ...numberOptions })

    if (abs >= 10_000_000) return `${prefix}${sign}${short(abs / 10_000_000)} ${unit("crore")}`
    if (abs >= 100_000) return `${prefix}${sign}${short(abs / 100_000)} ${unit("lakh")}`
    return `${prefix}${sign}${short(abs / 1000)} ${unit("thousand")}`
  }

  return `${prefix}${sign}${formatNumber(abs, numberOptions)}`
}

/**
 * AMIS publishes mandi rates as PKR per 100 kg. One Pakistani maund is 40 kg.
 * Exposed here so market pages all convert identically.
 */
export const KG_PER_MAUND = 40

export function per100kgToPerMaund(pricePer100kg: number): number {
  return (pricePer100kg / 100) * KG_PER_MAUND
}

/** e.g. `formatPricePerUnit(3500, "maund", "ur")` -> "Rs 3,500 فی من" */
export function formatPricePerUnit(
  amount: number,
  unit: keyof TranslationSchema["units"],
  lang: LanguageCode | string = DEFAULT_LANGUAGE,
  options: CurrencyFormatOptions = {},
): string {
  return `${formatCurrency(amount, options)} ${translate(`units.${unit}`, lang)}`
}
