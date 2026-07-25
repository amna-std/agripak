import { connectDB } from "@/lib/db"
import { ok, fail, handler, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import CommunityGroup from "@/lib/models/CommunityGroup"
import {
  GROUP_CATEGORIES,
  enumValue,
  escapeRegex,
  maybeJson,
  optionalAuth,
  paginationFrom,
  readBody,
  serializeGroup,
  toStringArray,
} from "../_lib/helpers"

export const dynamic = "force-dynamic"

/**
 * GET /api/community/groups
 * `?type=` all | trending | my | recommended, plus category / location / search filters.
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const { page, limit, skip } = paginationFrom(params)
  const type = params.get("type") || "all"
  const category = params.get("category")
  const location = params.get("location")
  const search = params.get("search")

  await connectDB()
  const auth = await optionalAuth(req)

  const visible = { isActive: true, privacy: { $in: ["public", "invite_only"] } }
  let groups: any[] = []

  if (type === "my") {
    if (!auth) return fail("Access denied. No token provided.", 401)
    // $elemMatch is required: two dotted conditions match independently across
    // the array, so a group the caller has left still matches while any *other*
    // member is active.
    groups = await CommunityGroup.find({ members: { $elemMatch: { user: auth.userId, isActive: true } } })
      .populate("createdBy", "name profilePicture")
      .populate("members.user", "name profilePicture")
      .sort({ "stats.lastActivity": -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  } else if (type === "trending") {
    groups = await CommunityGroup.find(visible)
      .populate("createdBy", "name profilePicture")
      .sort({ "stats.weeklyMessages": -1, "stats.activeMembers": -1, createdAt: -1 })
      .limit(limit)
      .lean()
  } else if (type === "recommended") {
    if (!auth) return fail("Access denied. No token provided.", 401)
    // Same province first, then the caller's main crop, then trending — deduped.
    const [byLocation, byCrop, trending] = await Promise.all([
      auth.user?.state
        ? CommunityGroup.find({ ...visible, "location.state": auth.user.state, "members.user": { $ne: auth.userId } })
            .limit(limit)
            .lean()
        : Promise.resolve([]),
      auth.user?.primaryCrop
        ? CommunityGroup.find({ ...visible, subcategory: auth.user.primaryCrop, "members.user": { $ne: auth.userId } })
            .limit(limit)
            .lean()
        : Promise.resolve([]),
      CommunityGroup.find(visible)
        .sort({ "stats.weeklyMessages": -1, createdAt: -1 })
        .limit(limit)
        .lean(),
    ])

    const seen = new Set<string>()
    groups = [...byLocation, ...byCrop, ...trending]
      .filter((g: any) => {
        const id = String(g._id)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      .slice(0, limit)
  } else {
    const query: Record<string, any> = { ...visible }
    if (category && (GROUP_CATEGORIES as readonly string[]).includes(category)) query.category = category
    if (location) query["location.state"] = location
    if (search) query.name = { $regex: escapeRegex(search), $options: "i" }

    groups = await CommunityGroup.find(query)
      .populate("createdBy", "name profilePicture")
      .populate("members.user", "name profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  }

  return ok({
    data: groups.map(serializeGroup),
    pagination: { page, limit, hasMore: groups.length === limit },
  })
})

/** POST /api/community/groups — create a group; the creator becomes its admin. */
export const POST = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readBody(req)

  const name = String(body.name ?? "").trim()
  const description = String(body.description ?? "").trim()
  const category = String(body.category ?? "general")

  if (name.length < 3 || name.length > 100) return fail("Group name must be 3-100 characters")
  if (description.length < 10 || description.length > 500) return fail("Description must be 10-500 characters")
  if (!(GROUP_CATEGORIES as readonly string[]).includes(category)) return fail("Invalid category")

  await connectDB()

  const suppliedLocation = maybeJson(body.location)
  const location = suppliedLocation ?? {
    state: auth.user?.state,
    district: auth.user?.district,
    village: auth.user?.village,
  }

  const created = await CommunityGroup.create({
    name,
    description,
    category,
    subcategory: body.subcategory ? String(body.subcategory) : undefined,
    privacy: ["public", "private", "invite_only"].includes(body.privacy) ? body.privacy : "public",
    location,
    language: enumValue(CommunityGroup, "language", body.language, "mixed"),
    tags: toStringArray(body.tags),
    avatar: body.avatar ? String(body.avatar) : null,
    createdBy: auth.userId,
    members: [{ user: auth.userId, role: "admin", joinedAt: new Date(), isActive: true }],
  })

  const group = await CommunityGroup.findById(created._id)
    .populate("createdBy", "name profilePicture")
    .populate("members.user", "name profilePicture")
    .lean()

  return ok({ data: serializeGroup(group), message: "Group created successfully" }, 201)
})
