import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import Consultation from "@/lib/models/Consultation"
import {
  CONSULTATION_STATUSES,
  EXPERT_FIELDS,
  FARMER_FIELDS,
  PRIORITIES,
  canAccess,
  isValidId,
  readBody,
  serializeConsultation,
} from "../_lib/helpers"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/consultations/:id */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  if (!isValidId(id)) return fail("Invalid consultation id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const consultation = await Consultation.findById(id)
    .populate("farmer", FARMER_FIELDS)
    .populate("expert", EXPERT_FIELDS)
    .populate("messages.sender", "name role profilePicture")
    .lean()

  if (!consultation) return fail("Consultation not found", 404)
  if (!canAccess(consultation, auth)) return fail("You do not have access to this consultation", 403)

  return ok({ data: serializeConsultation(consultation) })
})

/**
 * PUT /api/consultations/:id
 *
 * Accepts either an action envelope — `{ action, data }` for
 * `add_diagnosis` | `add_market_insights` | `rate` | `resolve` |
 * `schedule_call` — or a plain patch of a small whitelist of fields.
 */
export const PUT = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  if (!isValidId(id)) return fail("Invalid consultation id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const consultation = await Consultation.findById(id)
  if (!consultation) return fail("Consultation not found", 404)
  if (!canAccess(consultation, auth)) return fail("You do not have access to this consultation", 403)

  const isFarmer = String(consultation.farmer) === auth.userId
  const isExpert = String(consultation.expert || "") === auth.userId || auth.role === "admin"

  const body = await readBody(req)
  const action = body.action ? String(body.action) : null
  const payload = body.data ?? {}

  switch (action) {
    case "add_diagnosis": {
      if (!isExpert) return fail("Only the assigned expert can add a diagnosis", 403)
      if (!payload.condition) return fail("Diagnosis condition is required")
      consultation.diagnosis = payload
      consultation.messages.push({
        sender: auth.userId,
        message: `Diagnosis: ${payload.condition}${payload.severity ? ` (${payload.severity} severity)` : ""}`,
        messageType: "diagnosis",
      })
      break
    }

    case "add_market_insights": {
      if (!isExpert) return fail("Only the assigned expert can add market insights", 403)
      consultation.marketInsights = payload
      const trend =
        payload.trend === "rising" ? "rising" : payload.trend === "falling" ? "falling" : "stable"
      consultation.messages.push({
        sender: auth.userId,
        // Pakistani rupees.
        message: `Market update: current price Rs ${payload.currentPrice ?? "n/a"}, trend ${trend}`,
        messageType: "recommendation",
      })
      break
    }

    case "rate": {
      if (!isFarmer) return fail("Only the farmer can rate a consultation", 403)
      const score = Number(payload.score)
      if (!Number.isFinite(score) || score < 1 || score > 5) return fail("Rating must be between 1 and 5")

      const aspects = payload.aspects || {}
      const aspectScores = Object.values(aspects).filter((v) => typeof v === "number") as number[]

      consultation.rating = { score, feedback: payload.feedback || "", ratedAt: new Date(), aspects }
      consultation.analytics.satisfactionScore = aspectScores.length
        ? aspectScores.reduce((a, b) => a + b, 0) / aspectScores.length
        : score
      consultation.status = "closed"
      break
    }

    case "resolve": {
      if (!isExpert) return fail("Only the assigned expert can resolve a consultation", 403)
      consultation.status = "resolved"
      consultation.resolution = {
        summary: payload.summary || "",
        outcome: payload.outcome || "successful",
        followUpRequired: !!payload.followUpRequired,
        followUpDate: payload.followUpDate || undefined,
        resolvedAt: new Date(),
        resolvedBy: auth.userId,
        implementationStatus: "not_started",
      }
      consultation.actualResolutionTime = Math.round(
        (Date.now() - new Date(consultation.createdAt).getTime()) / 3_600_000,
      )
      break
    }

    case "schedule_call": {
      if (!isExpert && !isFarmer) return fail("You cannot schedule a call on this consultation", 403)
      if (!payload.dateTime) return fail("A call date and time is required")
      const platform = ["phone", "video"].includes(payload.platform) ? payload.platform : "phone"
      consultation.scheduledCall = {
        dateTime: new Date(payload.dateTime),
        duration: Number(payload.duration) || 30,
        platform,
        status: "scheduled",
        notes: payload.notes || undefined,
      }
      consultation.messages.push({
        sender: auth.userId,
        message: `Call scheduled for ${new Date(payload.dateTime).toISOString()} via ${platform}`,
        messageType: "text",
      })
      break
    }

    default: {
      // Plain patch — only fields the two sides are actually allowed to change.
      if (body.status !== undefined) {
        if (!isExpert) return fail("Only the assigned expert can change the status", 403)
        if (!(CONSULTATION_STATUSES as readonly string[]).includes(body.status)) return fail("Invalid status")
        consultation.status = body.status
      }
      if (body.priority !== undefined) {
        if (!(PRIORITIES as readonly string[]).includes(body.priority)) return fail("Invalid priority")
        consultation.priority = body.priority
        consultation.isUrgent = body.priority === "urgent"
      }
      if (body.subject !== undefined) {
        if (!isFarmer) return fail("Only the farmer can edit the subject", 403)
        consultation.subject = String(body.subject).trim()
      }
      if (body.description !== undefined) {
        if (!isFarmer) return fail("Only the farmer can edit the description", 403)
        consultation.description = String(body.description).trim()
      }
      if (body.cropDetails !== undefined) consultation.cropDetails = body.cropDetails
      if (body.tags !== undefined && Array.isArray(body.tags)) consultation.tags = body.tags.filter(Boolean)
      if (body.expertId !== undefined) {
        if (auth.role !== "admin") return fail("Only an admin can reassign a consultation", 403)
        if (!isValidId(String(body.expertId))) return fail("Invalid expert id")
        consultation.expert = body.expertId
        if (consultation.status === "open") consultation.status = "assigned"
      }
    }
  }

  await consultation.save()

  const updated = await Consultation.findById(id)
    .populate("farmer", FARMER_FIELDS)
    .populate("expert", EXPERT_FIELDS)
    .populate("messages.sender", "name role profilePicture")
    .lean()

  return ok({ data: serializeConsultation(updated), message: "Consultation updated successfully" })
})

/** DELETE /api/consultations/:id — the farmer withdraws an unanswered request. */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  if (!isValidId(id)) return fail("Invalid consultation id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const consultation = await Consultation.findById(id).select("farmer status")
  if (!consultation) return fail("Consultation not found", 404)
  if (String(consultation.farmer) !== auth.userId && auth.role !== "admin") {
    return fail("Only the farmer can withdraw this consultation", 403)
  }

  consultation.status = "closed"
  await consultation.save()

  return ok({ message: "Consultation closed" })
})
