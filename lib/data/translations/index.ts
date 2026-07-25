/**
 * AgriPak translation registry.
 *
 * Five languages: English + the four Pakistani languages the app ships with.
 * Hindi (`hi`) and Telugu (`te`) were removed in the Pakistan rebuild — do not re-add them.
 *
 * Prefer importing from `@/lib/i18n`, which re-exports everything here plus the
 * `t()` / `formatCurrency()` helpers.
 */

import { en } from "./en"
import { ur } from "./ur"
import { pa } from "./pa"
import { sd } from "./sd"
import { ps } from "./ps"
import type { Direction, LanguageCode, LanguageMeta, TranslationSchema } from "./types"

export type { Direction, LanguageCode, LanguageMeta, TranslationKey, TranslationNamespace, TranslationSchema } from "./types"
export { en, ur, pa, sd, ps }

/** All dictionaries, keyed by language code. */
export const dictionaries: Record<LanguageCode, TranslationSchema> = { en, ur, pa, sd, ps }

/** Language codes in the order they should appear in a picker. */
export const languageCodes: LanguageCode[] = ["ur", "en", "pa", "sd", "ps"]

/**
 * Metadata for every supported language.
 * `locale` is the BCP-47 tag used for `speechSynthesis` and `Intl`.
 */
export const languageList: LanguageMeta[] = [
  { code: "ur", name: "Urdu", nativeName: "اردو", dir: "rtl", locale: "ur-PK", usesArabicScript: true },
  { code: "en", name: "English", nativeName: "English", dir: "ltr", locale: "en-PK", usesArabicScript: false },
  { code: "pa", name: "Punjabi", nativeName: "پنجابی", dir: "rtl", locale: "pa-PK", usesArabicScript: true },
  { code: "sd", name: "Sindhi", nativeName: "سنڌي", dir: "rtl", locale: "sd-PK", usesArabicScript: true },
  { code: "ps", name: "Pashto", nativeName: "پښتو", dir: "rtl", locale: "ps-AF", usesArabicScript: true },
]

/** Lookup map: code -> metadata. */
export const languageMeta: Record<LanguageCode, LanguageMeta> = languageList.reduce(
  (acc, meta) => {
    acc[meta.code] = meta
    return acc
  },
  {} as Record<LanguageCode, LanguageMeta>,
)

/** Simple `{ code: nativeName }` map — handy for `<select>` options. */
export const languages: Record<LanguageCode, string> = languageList.reduce(
  (acc, meta) => {
    acc[meta.code] = meta.nativeName
    return acc
  },
  {} as Record<LanguageCode, string>,
)

/** Codes whose script is written right-to-left. */
export const rtlLanguages: LanguageCode[] = languageList.filter((l) => l.dir === "rtl").map((l) => l.code)

export const DEFAULT_LANGUAGE: LanguageCode = "en"

/** Narrowing type guard — use before casting anything from the API or localStorage. */
export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && value in dictionaries
}

/** Falls back to `en` for unknown / legacy values (e.g. an old `hi` in a user profile). */
export function normalizeLanguage(value: unknown): LanguageCode {
  return isLanguageCode(value) ? value : DEFAULT_LANGUAGE
}

export function getDirection(code: LanguageCode): Direction {
  return languageMeta[code]?.dir ?? "ltr"
}

export function isRTL(code: LanguageCode): boolean {
  return getDirection(code) === "rtl"
}

/** BCP-47 locale for speech synthesis / Intl. */
export function getLocale(code: LanguageCode): string {
  return languageMeta[code]?.locale ?? "en-PK"
}
