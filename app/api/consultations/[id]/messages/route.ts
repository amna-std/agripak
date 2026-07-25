import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import Consultation from "@/lib/models/Consultation"
import { canAccess, isValidId, readBody } from "../../_lib/helpers"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const SENDER_FIELDS = "name role profilePicture"

/** GET /api/consultations/:id/messages */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  if (!isValidId(id)) return fail("Invalid consultation id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const consultation = await Consultation.findById(id)
    .select("farmer expert messages")
    .populate("messages.sender", SENDER_FIELDS)
    .lean<any>()

  if (!consultation) return fail("Consultation not found", 404)
  if (!canAccess(consultation, auth)) return fail("You do not have access to this consultation", 403)

  return ok({ data: consultation.messages || [] })
})

/** POST /api/consultations/:id/messages — send a message in the thread. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params
  if (!isValidId(id)) return fail("Invalid consultation id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readBody(req)
  const message = String(body.message ?? body.content ?? "").trim()
  if (!message) return fail("Message cannot be empty")
  if (message.length > 2000) return fail("Message must be 2000 characters or fewer")

  await connectDB()

  const consultation = await Consultation.findById(id)
  if (!consultation) return fail("Consultation not found", 404)
  if (!canAccess(consultation, auth)) return fail("You do not have access to this consultation", 403)

  const isFirstReply = consultation.messages.length === 0

  consultation.messages.push({ sender: auth.userId, message, messageType: "text" })
  if (consultation.status === "open" || consultation.status === "assigned") {
    consultation.status = "in_progress"
  }
  if (isFirstReply) {
    consultation.analytics.responseTime = Math.round(
      (Date.now() - new Date(consultation.createdAt).getTime()) / 60_000,
    )
  }

  await consultation.save()
  await consultation.populate("messages.sender", SENDER_FIELDS)

  const created = consultation.messages[consultation.messages.length - 1]

  return ok({ data: created, messages: consultation.messages, message: "Message sent" }, 201)
})
