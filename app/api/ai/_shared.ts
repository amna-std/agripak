/**
 * Helpers shared by the three `/api/ai/*` routes.
 *
 * This file is NOT a route (no `route.ts` name), so Next.js will not expose it.
 */

import { fail } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import { GeminiError, isGeminiConfigured } from "@/lib/services/geminiService"
import { guessLanguage, type FarmerProfile, type LanguageCode } from "@/lib/prompts"

/**
 * All three AI routes are usable signed-out: an anonymous visitor still gets an
 * answer, they just do not get profile personalisation or saved history.
 *
 * Returns the authenticated user document, or null. A token that is present but
 * rejected is logged (so a broken client is visible in the server logs) rather
 * than failing the request.
 */
export async function optionalAuth(req: Request): Promise<any | null> {
  const hasHeader = Boolean(req.headers.get("authorization") || req.headers.get("Authorization"))
  if (!hasHeader) return null

  const auth = await authenticate(req)
  if (!auth.ok) {
    console.warn("[ai] ignoring invalid credentials:", auth.message)
    return null
  }
  return auth.user
}

const LANGUAGES: LanguageCode[] = ["en", "ur", "pa", "sd", "ps"]

/**
 * Accepts whatever the client sent and returns a supported code.
 * Hindi/Telugu were removed from the product, so `hi`/`te` fall back to English
 * rather than producing an answer in a script this audience cannot read.
 */
export function normaliseLanguage(input: unknown): LanguageCode | "auto" {
  if (typeof input !== "string") return "auto"
  const code = input.trim().toLowerCase().slice(0, 5).split("-")[0]
  return (LANGUAGES as string[]).includes(code) ? (code as LanguageCode) : "auto"
}

/**
 * Decides which language to answer in: an explicit request wins, then the
 * language of the message itself, then the signed-in user's preference.
 * The prompts also instruct the model to mirror the farmer regardless, so a
 * wrong guess here degrades instead of breaking.
 */
export function resolveLanguage(explicit: unknown, text?: string, userPreference?: unknown): LanguageCode | "auto" {
  const asked = normaliseLanguage(explicit)
  if (asked !== "auto") return asked

  const sniffed = text ? guessLanguage(text) : "auto"
  // A non-Latin script is a reliable signal, so act on it.
  if (sniffed !== "auto" && sniffed !== "en") return sniffed

  const preferred = normaliseLanguage(userPreference)
  if (preferred !== "auto") return preferred

  // Latin script is NOT a reliable signal: "meri gandum kharab ho rahi hai" is
  // Roman Urdu, and pinning it to English would answer the wrong language.
  // Returning "auto" lets the prompt tell the model to mirror the farmer.
  return "auto"
}

/** Maps a Mongoose User document onto the profile block the prompts render. */
export function toFarmerProfile(user: any): FarmerProfile | null {
  if (!user) return null
  const crops: string[] = []
  for (const crop of user.currentCrops ?? []) {
    if (crop?.cropName) crops.push(String(crop.cropName))
  }
  for (const crop of user.preferredCrops ?? []) {
    if (crop && !crops.includes(String(crop))) crops.push(String(crop))
  }

  const landValue = user.landSize?.value
  const landAcres =
    typeof landValue === "number"
      ? user.landSize?.unit === "hectares"
        ? Math.round(landValue * 2.471 * 100) / 100
        : landValue
      : undefined

  return {
    name: user.name,
    province: user.state,
    district: user.district,
    village: user.village,
    landSizeAcres: landAcres,
    soilType: user.soilType,
    waterSource: user.irrigationType,
    crops: crops.slice(0, 8),
    language: user.preferredLanguage,
  }
}

/** Turns a thrown `GeminiError` (or anything else) into the standard failure body. */
export function aiFailure(error: unknown) {
  if (error instanceof GeminiError) {
    return fail(error.message, error.status, { code: error.code })
  }
  throw error // let `handler()` log it and return a generic 500
}

/** Guard used at the top of every AI route. */
export function requireGemini() {
  if (!isGeminiConfigured()) {
    return fail("The AI service is not configured on this server.", 503, { code: "not_configured" })
  }
  return null
}

/** Trims and length-caps free text coming from the client. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength)
}
