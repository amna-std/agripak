import { connectDB } from "@/lib/db"
import { ok, fail, handler, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import Consultation from "@/lib/models/Consultation"
import User from "@/lib/models/User"
import {
  CONSULTATION_STATUSES,
  CONSULTATION_TYPES,
  EXPERT_FIELDS,
  EXPERT_ROLES,
  FARMER_FIELDS,
  PRIORITIES,
  RESOLUTION_TARGET_HOURS,
  escapeRegex,
  findExpert,
  isValidId,
  readBody,
  serializeConsultation,
  toObjectId,
} from "./_lib/helpers"

export const dynamic = "force-dynamic"

/**
 * GET /api/consultations — the caller's consultations.
 *
 * Farmers see their own, experts see the ones assigned to them (plus any they
 * raised themselves), admins see everything. Filters: status, type, priority,
 * search, and — for admins — farmerId / expertId.
 */
export const GET = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const params = searchParams(req)
  const page = Math.max(1, Number(params.get("page")) || 1)
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50))

  await connectDB()

  const query: Record<string, any> = {}

  if (auth.role === "admin") {
    const farmerId = params.get("farmerId")
    const expertId = params.get("expertId")
    if (farmerId && isValidId(farmerId)) query.farmer = toObjectId(farmerId)
    if (expertId && isValidId(expertId)) query.expert = toObjectId(expertId)
  } else {
    // Never trust a farmerId from the querystring — scope to the token.
    const me = toObjectId(auth.userId)
    query.$or = [{ farmer: me }, { expert: me }]
  }

  const status = params.get("status")
  const type = params.get("type")
  const priority = params.get("priority")
  const search = (params.get("search") || "").trim()

  if (status && (CONSULTATION_STATUSES as readonly string[]).includes(status)) query.status = status
  if (type && (CONSULTATION_TYPES as readonly string[]).includes(type)) query.type = type
  if (priority && (PRIORITIES as readonly string[]).includes(priority)) query.priority = priority
  if (search.length >= 2) {
    const pattern = escapeRegex(search)
    query.$and = [
      {
        $or: [
          { subject: { $regex: pattern, $options: "i" } },
          { description: { $regex: pattern, $options: "i" } },
          { "cropDetails.cropName": { $regex: pattern, $options: "i" } },
        ],
      },
    ]
  }

  const [consultations, total, byStatus, byType] = await Promise.all([
    Consultation.find(query)
      .populate("farmer", FARMER_FIELDS)
      .populate("expert", EXPERT_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<any>(),
    Consultation.countDocuments(query),
    Consultation.aggregate([{ $match: query }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Consultation.aggregate([{ $match: query }, { $group: { _id: "$type", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ])

  const data = consultations.map(serializeConsultation)

  return ok({
    data,
    consultations: data,
    aggregates: { byStatus, byType },
    pagination: { page, limit, total, hasMore: page * limit < total },
  })
})

/** POST /api/consultations — book a consultation with an expert. */
export const POST = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readBody(req)

  const type = String(body.type ?? "")
  const subject = String(body.subject ?? "").trim()
  const description = String(body.description ?? "").trim()

  if (!(CONSULTATION_TYPES as readonly string[]).includes(type)) return fail("A valid consultation type is required")
  if (subject.length < 5 || subject.length > 200) return fail("Subject must be 5-200 characters")
  if (description.length < 10) return fail("Description must be at least 10 characters")

  const priority = (PRIORITIES as readonly string[]).includes(body.priority) ? body.priority : "medium"

  await connectDB()

  const location = body.location ?? {
    district: auth.user?.district,
    state: auth.user?.state,
    village: auth.user?.village,
  }

  const crop = body.cropDetails || {}
  const area = Number(crop.area)

  // A requested expert wins; otherwise match on specialisation and province.
  let expert: any = null
  if (body.expertId && isValidId(String(body.expertId))) {
    const requested = await User.findById(body.expertId).select("_id role isActive").lean<any>()
    if (!requested) return fail("Expert not found", 404)
    // The assigned expert gets privileged powers on this consultation (diagnosis,
    // recommendations, resolve), so the requested account must actually be an
    // adviser — otherwise a farmer could hand those powers to any user id.
    if (!EXPERT_ROLES.includes(requested.role) || requested.isActive === false) {
      return fail("That user is not an available expert", 400)
    }
    expert = requested._id
  } else {
    expert = await findExpert(User, type, location?.state)
  }

  const created = await Consultation.create({
    farmer: auth.userId,
    expert,
    type,
    subject,
    description,
    priority,
    isUrgent: priority === "urgent",
    status: expert ? "assigned" : "open",
    estimatedResolutionTime: RESOLUTION_TARGET_HOURS[priority],
    cropDetails: {
      cropName: crop.cropName || undefined,
      variety: crop.variety || undefined,
      stage: crop.stage || undefined,
      area: Number.isFinite(area) && area > 0 ? area : undefined,
      sowingDate: crop.sowingDate || undefined,
      expectedHarvest: crop.expectedHarvest || undefined,
      currentIssues: Array.isArray(crop.currentIssues) ? crop.currentIssues.filter(Boolean) : [],
    },
    location,
    tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : [],
    cost: { consultationFee: Number(body.consultationFee) || 0, currency: "PKR", isPaid: false },
  })

  const consultation = await Consultation.findById(created._id)
    .populate("farmer", FARMER_FIELDS)
    .populate("expert", EXPERT_FIELDS)
    .lean<any>()

  return ok(
    {
      data: serializeConsultation(consultation),
      message: expert
        ? "Consultation created and assigned to an expert"
        : "Consultation created. No expert is available yet — it will be assigned as soon as one is.",
    },
    201,
  )
})
