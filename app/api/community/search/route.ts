import { connectDB } from "@/lib/db"
import { ok, fail, handler, searchParams } from "@/lib/api-helpers"
import CommunityPost from "@/lib/models/CommunityPost"
import {
  POST_AUTHOR_FIELDS,
  POST_CATEGORIES,
  POST_TYPES,
  escapeRegex,
  optionalAuth,
  paginationFrom,
  serializePost,
} from "../_lib/helpers"

export const dynamic = "force-dynamic"

/** GET /api/community/search?q=…&category=&type=&location= */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const q = (params.get("q") || "").trim()
  if (q.length < 2) return fail("Search query must be at least 2 characters")

  const { page, limit, skip } = paginationFrom(params)
  const category = params.get("category")
  const type = params.get("type")
  const location = params.get("location")

  await connectDB()
  await optionalAuth(req)

  const pattern = escapeRegex(q)
  const query: Record<string, any> = {
    isActive: true,
    $or: [
      { title: { $regex: pattern, $options: "i" } },
      { content: { $regex: pattern, $options: "i" } },
      { tags: { $regex: pattern, $options: "i" } },
    ],
  }

  if (category && (POST_CATEGORIES as readonly string[]).includes(category)) query.category = category
  if (type && (POST_TYPES as readonly string[]).includes(type)) query.type = type
  if (location) query["location.state"] = location

  const posts = await CommunityPost.find(query)
    .populate("author", POST_AUTHOR_FIELDS)
    .populate("group", "name category")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()

  return ok({
    data: posts.map(serializePost),
    pagination: { page, limit, hasMore: posts.length === limit },
  })
})
