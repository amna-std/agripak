/**
 * Shared types for the AgriPak translation layer.
 *
 * `en.ts` is the schema source of truth. Everything here is derived from it, so
 * a key added to English but missing from ur/pa/sd/ps fails `tsc`.
 */

import type { en } from "./en"

/** The exact shape every locale file must implement. */
export type TranslationSchema = typeof en

/** Top-level namespaces: "common" | "nav" | "auth" | ... */
export type TranslationNamespace = keyof TranslationSchema

/**
 * Every valid dot path, e.g. "common.save" | "weather.humidity" | "crops.wheat".
 * Two levels deep — that is all the schema allows, which keeps this cheap for tsc.
 */
export type TranslationKey = {
  [N in keyof TranslationSchema]: `${N & string}.${keyof TranslationSchema[N] & string}`
}[keyof TranslationSchema]

/** Supported language codes. */
export type LanguageCode = "en" | "ur" | "pa" | "sd" | "ps"

/** Text direction. `ur`, `pa`, `sd` and `ps` are all right-to-left. */
export type Direction = "ltr" | "rtl"

export interface LanguageMeta {
  /** ISO-ish app code used in URLs, localStorage and the user profile. */
  code: LanguageCode
  /** English name, for admin UI and accessibility labels. */
  name: string
  /** Endonym, written in its own script — use this in the language picker. */
  nativeName: string
  /** Writing direction of the script. */
  dir: Direction
  /** BCP-47 locale used for speechSynthesis and Intl. */
  locale: string
  /** True when the script needs the Nastaliq/Arabic font stack. */
  usesArabicScript: boolean
}
