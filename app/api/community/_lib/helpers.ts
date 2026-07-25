import mongoose from "mongoose"
import { authenticate, type AuthResult } from "@/lib/auth-helpers"

/**
 * Shared helpers for the community / forum API routes.
 *
 * Ported from the old Express `server/routes/community.js` +
 * `server/services/communityService.js`. Kept local to `app/api/community`
 * so the routes stay self-contained.
 */

export const POST_TYPES = ["question", "discussion", "tip", "experience", "problem", "success_story"] as const
export const POST_CATEGORIES = ["crops", "livestock", "equipment", "weather", "market", "government", "general"] as const
export const GROUP_CATEGORIES = [
  "crop_specific",
  "location_based",
  "technique_based",
  "general",
  "expert_led",
  "disease_support",
] as const
export const REACTION_TYPES = ["like", "love", "helpful", "thanks"] as const

/** Roles that count as "expert" for expert-advice filtering. */
export const EXPERT_ROLES = ["expert", "agriculture_expert", "agri_doctor"]

/**
 * Reads a request body that may arrive as JSON *or* as `multipart/form-data`
 * (the existing frontend posts FormData so it can attach files).
 *
 * Binary parts are skipped: Vercel lambdas have a read-only filesystem, so
 * there is nowhere to persist an upload. Attachments must be supplied as
 * already-hosted URLs via the `attachments` field.
 */
export async function readBody(req: Request): Promise<Record<string, any>> {
  const contentType = req.headers.get("content-type") || ""

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const form = await req.formData()
      const out: Record<string, any> = {}
      for (const [key, value] of form.entries()) {
        if (typeof value !== "string") continue
        if (key in out) out[key] = ([] as any[]).concat(out[key], value)
        else out[key] = value
      }
      return out
    } catch {
      return {}
    }
  }

  try {
    return (await req.json()) ?? {}
  } catch {
    return {}
  }
}

/** FormData sends objects as JSON strings; JSON bodies send them as objects. */
export function maybeJson(value: any): any {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/** Accepts `["a","b"]`, `"a,b"` or `"a"` and always returns a trimmed array. */
export function toStringArray(value: any): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value : String(value).split(",")
  return raw
    .map((item) => String(item).trim())
    .filter(Boolean)
}

export function isValidId(id: any): boolean {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id)
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Returns `value` when the model's schema enum allows it, otherwise a safe
 * fallback. The shared models are owned by another workstream and their
 * language enums are still being tightened, so routes
 * must not hard-fail on a value the schema has not learned about yet.
 */
export function enumValue(model: any, path: string, value: any, fallback: string): string {
  const candidate = typeof value === "string" && value ? value : fallback
  const schemaPath = model?.schema?.path?.(path)
  const allowed: string[] | undefined = schemaPath?.enumValues?.length
    ? schemaPath.enumValues
    : schemaPath?.options?.enum
  if (!Array.isArray(allowed) || allowed.length === 0) return candidate
  if (allowed.includes(candidate)) return candidate
  if (allowed.includes(fallback)) return fallback
  return allowed[0]
}

/** Authenticates without failing the request — used by publicly readable routes. */
export async function optionalAuth(req: Request): Promise<(AuthResult & { ok: true }) | null> {
  try {
    const auth = await authenticate(req)
    return auth.ok ? auth : null
  } catch {
    return null
  }
}

export function paginationFrom(params: URLSearchParams, defaultLimit = 20) {
  const page = Math.max(1, Number(params.get("page")) || 1)
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || defaultLimit))
  return { page, limit, skip: (page - 1) * limit }
}

/**
 * `.lean()` strips Mongoose virtuals, so the counts the frontend renders are
 * recomputed here.
 */
export function serializePost(post: any) {
  if (!post) return post
  const reactions: any[] = Array.isArray(post.reactions) ? post.reactions : []
  const comments: any[] = Array.isArray(post.comments) ? post.comments : []
  const likes = reactions.filter((r) => r?.type === "like").length
  const helpful = reactions.filter((r) => r?.type === "helpful").length * 2

  return {
    ...post,
    reactions,
    comments,
    tags: Array.isArray(post.tags) ? post.tags : [],
    attachments: Array.isArray(post.attachments) ? post.attachments : [],
    reactionCount: reactions.length,
    commentCount: comments.length,
    score: likes + helpful + comments.length,
  }
}

export function serializeGroup(group: any) {
  if (!group) return group
  const members: any[] = Array.isArray(group.members) ? group.members : []
  return {
    ...group,
    members,
    tags: Array.isArray(group.tags) ? group.tags : [],
    memberCount: members.filter((m) => m?.isActive !== false).length,
  }
}

export const POST_AUTHOR_FIELDS = "name profilePicture role district state village qualification specialization"
export const COMMENT_AUTHOR_FIELDS = "name profilePicture role"
