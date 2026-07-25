import { connectDB } from "@/lib/db"
import { ok, fail, handler, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import CommunityPost from "@/lib/models/CommunityPost"
import CommunityGroup from "@/lib/models/CommunityGroup"
import {
  COMMENT_AUTHOR_FIELDS,
  POST_AUTHOR_FIELDS,
  POST_CATEGORIES,
  POST_TYPES,
  enumValue,
  isValidId,
  maybeJson,
  optionalAuth,
  paginationFrom,
  readBody,
  serializePost,
  toStringArray,
} from "../_lib/helpers"

export const dynamic = "force-dynamic"

/** GET /api/community/posts — flat post list (feed without personalisation). */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const { page, limit, skip } = paginationFrom(params)
  const category = params.get("category")
  const type = params.get("type")
  const groupId = params.get("groupId")

  await connectDB()
  await optionalAuth(req)

  const query: Record<string, any> = { isActive: true }
  if (category && (POST_CATEGORIES as readonly string[]).includes(category)) query.category = category
  if (type && (POST_TYPES as readonly string[]).includes(type)) query.type = type
  if (groupId && isValidId(groupId)) query.group = groupId

  const posts = await CommunityPost.find(query)
    .populate("author", POST_AUTHOR_FIELDS)
    .populate("group", "name category")
    .populate("comments.author", COMMENT_AUTHOR_FIELDS)
    .sort({ isPinned: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean<any>()

  return ok({
    data: posts.map(serializePost),
    pagination: { page, limit, hasMore: posts.length === limit },
  })
})

/** POST /api/community/posts — create a post. */
export const POST = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readBody(req)

  const title = String(body.title ?? "").trim()
  const content = String(body.content ?? "").trim()
  const type = String(body.type ?? "discussion")
  const category = String(body.category ?? "general")

  if (title.length < 5 || title.length > 200) return fail("Title must be 5-200 characters")
  if (content.length < 10 || content.length > 5000) return fail("Content must be 10-5000 characters")
  if (!(POST_TYPES as readonly string[]).includes(type)) return fail("Invalid post type")
  if (!(POST_CATEGORIES as readonly string[]).includes(category)) return fail("Invalid category")

  await connectDB()

  const groupId = body.groupId || body.group
  if (groupId && !isValidId(String(groupId))) return fail("Invalid group id")

  if (groupId) {
    const group = await CommunityGroup.findById(groupId).select("_id privacy members").lean<any>()
    if (!group) return fail("Group not found", 404)
    const isMember = (group.members || []).some(
      (m: any) => String(m.user) === auth.userId && m.isActive !== false,
    )
    if (!isMember && group.privacy !== "public") return fail("Join the group before posting in it", 403)
  }

  // Default the post's location to the author's own so nationwide feeds work
  // without every farmer having to re-enter their district.
  const suppliedLocation = maybeJson(body.location)
  const location = suppliedLocation ?? {
    state: auth.user?.state,
    district: auth.user?.district,
    village: auth.user?.village,
  }

  // Vercel lambdas cannot write to disk, so only already-hosted attachment
  // URLs are accepted — raw file parts in a multipart body are ignored.
  const suppliedAttachments = maybeJson(body.attachments)
  const attachments = (Array.isArray(suppliedAttachments) ? suppliedAttachments : [])
    .filter((a: any) => a && a.url)
    .map((a: any) => ({
      url: String(a.url),
      type: ["image", "video", "document"].includes(a.type) ? a.type : "document",
      filename: a.filename ? String(a.filename) : undefined,
      size: typeof a.size === "number" ? a.size : undefined,
    }))

  const created = await CommunityPost.create({
    title,
    content,
    type,
    category,
    author: auth.userId,
    group: groupId || null,
    tags: toStringArray(body.tags).map((tag) => tag.toLowerCase()),
    location,
    metadata: maybeJson(body.metadata) ?? {},
    attachments,
    priority: ["low", "medium", "high", "urgent"].includes(body.priority) ? body.priority : "medium",
    language: enumValue(CommunityPost, "language", body.language, "en"),
  })

  const post = await CommunityPost.findById(created._id)
    .populate("author", POST_AUTHOR_FIELDS)
    .populate("group", "name category")
    .lean<any>()

  return ok({ data: serializePost(post), message: "Post created successfully" }, 201)
})
