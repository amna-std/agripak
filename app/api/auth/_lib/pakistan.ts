/**
 * Pakistan-specific identity/geography rules shared by the auth and user routes.
 *
 * `_lib` is a Next.js private folder, so nothing in here is routable.
 */

import { PROVINCES, type Province } from "@/lib/data/pakistan-locations"
import User from "@/lib/models/User"

/* ------------------------------------------------------------------ mobile */

/** Pakistani mobile numbers are 11 digits and always start `03`. */
export const PK_MOBILE_REGEX = /^03\d{9}$/

export const MOBILE_ERROR = "Enter a valid Pakistani mobile number (03XXXXXXXXX)"

/**
 * Accepts the shapes real users type — `0300 1234567`, `+92 300 1234567`,
 * `0092-300-1234567`, `3001234567` — and returns the canonical `03XXXXXXXXX`.
 * Returns `null` when the input is not a Pakistani mobile number.
 */
export function normalizeMobile(raw: unknown): string | null {
  if (typeof raw !== "string") return null

  let digits = raw.replace(/[\s\-().]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)

  if (digits.startsWith("0092")) digits = digits.slice(4)
  else if (digits.startsWith("92")) digits = digits.slice(2)
  else if (digits.startsWith("0")) digits = digits.slice(1)

  // What remains must be the 10-digit subscriber number, which always starts 3.
  if (!/^3\d{9}$/.test(digits)) return null
  return `0${digits}`
}

/** E.164 form, e.g. `03001234567` -> `+923001234567`. */
export function toE164(mobile: string): string {
  return `+92${mobile.slice(1)}`
}

/* --------------------------------------------------------------- geography */

export const COUNTRY = "Pakistan"

export { PROVINCES }
export type { Province }

/**
 * Everything a user might type, mapped onto the canonical province names. The
 * canonical spellings themselves come from the shared location data, so the
 * auth layer can never drift from the location picker.
 */
const PROVINCE_ALIASES: Record<string, Province> = {
  ...Object.fromEntries(PROVINCES.map((province) => [province.toLowerCase(), province])),
  sind: "Sindh",
  "khyber pakhtoonkhwa": "Khyber Pakhtunkhwa",
  "khyber-pakhtunkhwa": "Khyber Pakhtunkhwa",
  kp: "Khyber Pakhtunkhwa",
  kpk: "Khyber Pakhtunkhwa",
  nwfp: "Khyber Pakhtunkhwa",
  baluchistan: "Balochistan",
  "azad jammu and kashmir": "Azad Jammu & Kashmir",
  "azad kashmir": "Azad Jammu & Kashmir",
  ajk: "Azad Jammu & Kashmir",
  "gilgit baltistan": "Gilgit-Baltistan",
  gb: "Gilgit-Baltistan",
  islamabad: "Islamabad Capital Territory",
  ict: "Islamabad Capital Territory",
  "federal capital": "Islamabad Capital Territory",
}

export const PROVINCE_ERROR = `Select a valid Pakistani province: ${PROVINCES.join(", ")}`

export function normalizeProvince(raw: unknown): Province | null {
  if (typeof raw !== "string") return null
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ")
  return PROVINCE_ALIASES[key] ?? null
}

/** Pakistan Post uses 5-digit postal codes (Lahore 54000, Karachi 74200…). */
export const PK_POSTCODE_REGEX = /^\d{5}$/
export const POSTCODE_ERROR = "Enter a valid 5-digit Pakistani postal code"

/* --------------------------------------------------------------- languages */

/** en + the four right-to-left languages the app ships. */
export const LANGUAGES = ["en", "ur", "pa", "sd", "ps"] as const
export type Language = (typeof LANGUAGES)[number]

/**
 * Speech-recognition tags per language.
 *
 * These MUST stay identical to the `voiceLanguage` enum in `lib/models/User.js`
 * — `en-PK`, `ur-PK`, `pa-PK`, `sd-PK`, `ps-AF`. Pashto's only widely supported
 * tag is `ps-AF`, and English is tagged `en-PK` rather than `en-US`.
 */
export const VOICE_LANGUAGE_BY_LANGUAGE: Record<Language, string> = {
  en: "en-PK",
  ur: "ur-PK",
  pa: "pa-PK",
  sd: "sd-PK",
  ps: "ps-AF",
}

export const VOICE_LANGUAGES = Object.values(VOICE_LANGUAGE_BY_LANGUAGE)

export const LANGUAGE_ERROR = `Language must be one of: ${LANGUAGES.join(", ")}`

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value)
}

/* ------------------------------------------------------------------- roles */

/**
 * Roles a member of the public may self-register as. `admin` is deliberately
 * absent, and `agri_doctor` is out of scope (it duplicated the expert role).
 */
export const REGISTRATION_ROLES = ["farmer", "agriculture_expert", "seller"] as const
export type RegistrationRole = (typeof REGISTRATION_ROLES)[number]

const ROLE_ALIASES: Record<string, RegistrationRole> = {
  farmer: "farmer",
  expert: "agriculture_expert",
  agriculture_expert: "agriculture_expert",
  agri_expert: "agriculture_expert",
  seller: "seller",
  buyer: "seller",
}

export const ROLE_ERROR = `Role must be one of: ${REGISTRATION_ROLES.join(", ")}`

export function normalizeRole(raw: unknown): RegistrationRole | null {
  if (raw === undefined || raw === null || raw === "") return "farmer"
  if (typeof raw !== "string") return null
  return ROLE_ALIASES[raw.trim().toLowerCase()] ?? null
}

export function isExpertRole(role: string): boolean {
  return role === "agriculture_expert" || role === "expert" || role === "agri_doctor"
}

/* ----------------------------------------------------------------- seasons */

/** Pakistan grows on two seasons: Rabi (Nov–Apr) and Kharif (May–Oct). */
export function currentSeason(date = new Date()): "rabi" | "kharif" {
  const month = date.getMonth() + 1
  return month >= 5 && month <= 10 ? "kharif" : "rabi"
}

/* ------------------------------------------------------------------- email */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/* -------------------------------------------------------- voice language */

/**
 * `lib/models/User.js` carries a `pre("save")` hook that maps
 * `preferredLanguage` through an `{ en, hi, te }` table and falls back to
 * "en-US" for everything else — so *every* Pakistani user is written with
 * `voiceLanguage: "en-US"`, a value the model's own enum no longer allows.
 *
 * Mongoose runs document validation *before* userland `pre("save")` middleware,
 * so that bad value is persisted silently rather than rejected. Middleware
 * registered after a model is compiled is ignored, so the corrected tag is
 * written with a targeted follow-up instead — and only when it is wrong.
 *
 * Delete this once the hook in `lib/models/User.js` uses the Pakistani tags.
 */
export async function syncVoiceLanguage(user: any): Promise<void> {
  const expected = VOICE_LANGUAGE_BY_LANGUAGE[user.preferredLanguage as Language]
  if (!expected || user.voiceLanguage === expected) return

  user.voiceLanguage = expected
  await User.updateOne({ _id: user._id }, { $set: { voiceLanguage: expected } })
}

/* ---------------------------------------------------------- error mapping */

/** Turns a mongoose write error into a user-facing message, or `null`. */
export function mongoErrorMessage(error: any): string | null {
  if (!error) return null

  if (error.name === "ValidationError") {
    const first: any = Object.values(error.errors ?? {})[0]
    return first?.message || "Validation failed"
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern ?? error.keyValue ?? {})[0]
    if (field === "mobile") return "An account with this mobile number already exists"
    if (field === "email") return "An account with this email already exists"
    return "An account with these details already exists"
  }

  return null
}
