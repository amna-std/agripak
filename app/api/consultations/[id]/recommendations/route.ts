import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import Consultation from "@/lib/models/Consultation"
import {
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_PRIORITIES,
  canAccess,
  isValidId,
  readBody,
} from "../../_lib/helpers"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/consultations/:id/recommendations */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  if (!isValidId(id)) return fail("Invalid consultation id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const consultation = await Consultation.findById(id).select("farmer expert recommendations").lean<any>()
  if (!consultation) return fail("Consultation not found", 404)
  if (!canAccess(consultation, auth)) return fail("You do not have access to this consultation", 403)

  return ok({ data: consultation.recommendations || [] })
})

/** POST /api/consultations/:id/recommendations — expert adds an advisory item. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  if (!isValidId(id)) return fail("Invalid consultation id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readBody(req)
  const title = String(body.title ?? "").trim()
  const description = String(body.description ?? "").trim()
  const category = String(body.category ?? "treatment")

  if (!title) return fail("Recommendation title is required")
  if (!description) return fail("Recommendation description is required")
  if (!(RECOMMENDATION_CATEGORIES as readonly string[]).includes(category)) return fail("Invalid category")

  const priority = (RECOMMENDATION_PRIORITIES as readonly string[]).includes(body.priority)
    ? body.priority
    : "medium"

  await connectDB()

  const consultation = await Consultation.findById(id)
  if (!consultation) return fail("Consultation not found", 404)
  if (!canAccess(consultation, auth)) return fail("You do not have access to this consultation", 403)

  const isExpert = String(consultation.expert || "") === auth.userId || auth.role === "admin"
  if (!isExpert) return fail("Only the assigned expert can add recommendations", 403)

  const estimated = Number(body.cost?.estimated)

  consultation.recommendations.push({
    category,
    title,
    description,
    priority,
    actionRequired: !!body.actionRequired,
    timeline: body.timeline || undefined,
    cost: {
      estimated: Number.isFinite(estimated) ? estimated : 0,
      // Pakistani rupees — the model still defaults to INR.
      currency: "PKR",
      breakdown: Array.isArray(body.cost?.breakdown) ? body.cost.breakdown : [],
    },
    products: Array.isArray(body.products) ? body.products : [],
    expectedOutcome: body.expectedOutcome || undefined,
    followUpDate: body.followUpDate || undefined,
  })

  consultation.messages.push({
    sender: auth.userId,
    message: `New recommendation added: ${title}`,
    messageType: "recommendation",
  })

  await consultation.save()

  const created = consultation.recommendations[consultation.recommendations.length - 1]

  return ok({ data: created, message: "Recommendation added" }, 201)
})
