import mongoose from "mongoose"
import type { AuthResult } from "@/lib/auth-helpers"

/** Shared helpers for the consultation routes (ported from server/routes/consultations.js). */

export const CONSULTATION_TYPES = [
  "crop_disease",
  "market_advisory",
  "soil_management",
  "pest_control",
  "irrigation",
  "fertilizer",
  "harvesting",
  "general",
] as const

export const CONSULTATION_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "follow_up_required",
] as const

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const

/** Recommendations use `critical` where a consultation uses `urgent`. */
export const RECOMMENDATION_PRIORITIES = ["low", "medium", "high", "critical"] as const

export const RECOMMENDATION_CATEGORIES = [
  "treatment",
  "fertilizer",
  "pesticide",
  "irrigation",
  "harvesting",
  "market_timing",
  "crop_selection",
] as const

/** Roles that may act as the expert side of a consultation. */
export const EXPERT_ROLES = ["expert", "agriculture_expert", "agri_doctor"]

export const FARMER_FIELDS = "name mobile email village district state profilePicture"
export const EXPERT_FIELDS = "name mobile email village district state specialization qualification rating profilePicture"

/** Hours the platform promises for a first response, by priority. */
export const RESOLUTION_TARGET_HOURS: Record<string, number> = {
  low: 48,
  medium: 24,
  high: 12,
  urgent: 4,
}

export function isValidId(id: any): boolean {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id)
}

/**
 * `find()` casts id strings for us but `aggregate()` does not, and the same
 * filter object is used for both — so ids go in already cast.
 */
export function toObjectId(id: string) {
  return new mongoose.Types.ObjectId(id)
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function readBody(req: Request): Promise<Record<string, any>> {
  try {
    return (await req.json()) ?? {}
  } catch {
    return {}
  }
}

export function isExpertRole(role?: string): boolean {
  return !!role && (EXPERT_ROLES.includes(role) || role === "admin")
}

/** A consultation is visible to its farmer, its assigned expert, and admins. */
export function canAccess(consultation: any, auth: AuthResult & { ok: true }): boolean {
  if (auth.role === "admin") return true
  const farmerId = String(consultation.farmer?._id ?? consultation.farmer ?? "")
  const expertId = String(consultation.expert?._id ?? consultation.expert ?? "")
  return farmerId === auth.userId || (!!expertId && expertId === auth.userId)
}

/**
 * Rebuilds the derived fields the UI reads. Mongoose instance methods are lost
 * by `.lean()`, and the old Express code exposed these via `getAnalytics()`.
 */
export function serializeConsultation(consultation: any) {
  if (!consultation) return consultation

  const messages: any[] = Array.isArray(consultation.messages) ? consultation.messages : []
  const recommendations: any[] = Array.isArray(consultation.recommendations) ? consultation.recommendations : []
  const implemented = recommendations.filter((r) => r?.isImplemented).length

  const resolvedAt = consultation.resolution?.resolvedAt
  const duration =
    consultation.actualResolutionTime ??
    (resolvedAt && consultation.createdAt
      ? Math.round((new Date(resolvedAt).getTime() - new Date(consultation.createdAt).getTime()) / 3_600_000)
      : null)

  return {
    ...consultation,
    messages,
    recommendations,
    activeRecommendations: recommendations.filter((r) => !r?.isImplemented),
    analytics: {
      ...(consultation.analytics || {}),
      duration,
      messagesExchanged: messages.length,
      recommendationsGiven: recommendations.length,
      implementationRate: recommendations.length ? (implemented / recommendations.length) * 100 : 0,
    },
  }
}

/**
 * Picks the best available expert for a new consultation: same specialisation
 * first, then same province, ranked by rating. Returns `null` when the platform
 * has no expert on record — the consultation then stays `open` rather than
 * being assigned to somebody who does not exist.
 */
export async function findExpert(User: any, type: string, province?: string) {
  const base: Record<string, any> = { role: { $in: EXPERT_ROLES }, isActive: { $ne: false } }

  const attempts: Record<string, any>[] = []
  if (province) attempts.push({ ...base, specialization: type, state: province })
  attempts.push({ ...base, specialization: type })
  if (province) attempts.push({ ...base, state: province })
  attempts.push({ ...base })

  for (const query of attempts) {
    const expert = await User.findOne(query).sort({ "rating.average": -1, lastSeen: -1 }).select("_id").lean()
    if (expert) return expert._id
  }

  return null
}
