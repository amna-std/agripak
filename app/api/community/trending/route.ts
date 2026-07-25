import { connectDB } from "@/lib/db"
import { ok, handler, searchParams } from "@/lib/api-helpers"
import CommunityPost from "@/lib/models/CommunityPost"
import { POST_AUTHOR_FIELDS, optionalAuth, serializePost } from "../_lib/helpers"

export const dynamic = "force-dynamic"

/**
 * GET /api/community/trending — top posts and hashtags from the last 7 days.
 * Everything here is derived from real posts; there is no filler content.
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const limit = Math.min(25, Math.max(1, Number(params.get("limit")) || 10))
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  await connectDB()
  await optionalAuth(req)

  const [rankedPosts, tags] = await Promise.all([
    CommunityPost.aggregate([
      { $match: { createdAt: { $gte: since }, isActive: true } },
      {
        $addFields: {
          engagement: {
            $add: [
              { $size: { $ifNull: ["$reactions", []] } },
              { $multiply: [{ $size: { $ifNull: ["$comments", []] } }, 2] },
              { $divide: [{ $ifNull: ["$views", 0] }, 10] },
            ],
          },
        },
      },
      { $sort: { engagement: -1, createdAt: -1 } },
      { $limit: limit },
    ]),
    CommunityPost.aggregate([
      { $match: { createdAt: { $gte: since }, isActive: true } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ])

  const posts = await CommunityPost.populate(rankedPosts, [
    { path: "author", select: POST_AUTHOR_FIELDS },
    { path: "group", select: "name category" },
  ])

  return ok({ data: { posts: posts.map(serializePost), tags } })
})
