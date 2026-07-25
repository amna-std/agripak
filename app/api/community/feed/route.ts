import { connectDB } from "@/lib/db"
import { ok, fail, handler, searchParams } from "@/lib/api-helpers"
import CommunityPost from "@/lib/models/CommunityPost"
import CommunityGroup from "@/lib/models/CommunityGroup"
import {
  COMMENT_AUTHOR_FIELDS,
  EXPERT_ROLES,
  POST_AUTHOR_FIELDS,
  POST_CATEGORIES,
  optionalAuth,
  paginationFrom,
  serializePost,
} from "../_lib/helpers"

export const dynamic = "force-dynamic"

/**
 * GET /api/community/feed — paginated post feed.
 *
 * `?type=trending` ranks by engagement over the last week,
 * `?type=expert` returns tips/experience posts written by experts,
 * `?category=crops` filters by category, otherwise the feed is personalised
 * to the caller's groups and province when a token is supplied.
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const { page, limit, skip } = paginationFrom(params)
  const type = params.get("type")
  const category = params.get("category")

  await connectDB()
  const auth = await optionalAuth(req)

  let posts: any[] = []

  if (type === "trending") {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const aggregated = await CommunityPost.aggregate([
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
      { $skip: skip },
      { $limit: limit },
    ])

    posts = await CommunityPost.populate(aggregated, [
      { path: "author", select: POST_AUTHOR_FIELDS },
      { path: "group", select: "name category" },
    ])
  } else if (type === "expert") {
    const found = await CommunityPost.find({ isActive: true })
      .populate({ path: "author", match: { role: { $in: EXPERT_ROLES } }, select: POST_AUTHOR_FIELDS })
      .populate("group", "name category")
      .sort({ createdAt: -1 })
      .limit(limit * 4)
      .lean()

    posts = found.filter((post: any) => post.author).slice(0, limit)
  } else {
    const query: Record<string, any> = { isActive: true }

    if (category && (POST_CATEGORIES as readonly string[]).includes(category)) {
      query.category = category
    } else if (auth) {
      // Personalised feed: the caller's groups + their province + public posts.
      // $elemMatch, not two dotted keys — those match independently across the
      // array and would pull in groups the caller has already left.
      const groups = await CommunityGroup.find({
        members: { $elemMatch: { user: auth.userId, isActive: true } },
      })
        .select("_id")
        .lean()

      const groupIds = groups.map((g: any) => g._id)
      const or: Record<string, any>[] = [{ group: null }, { group: { $exists: false } }]
      if (groupIds.length) or.push({ group: { $in: groupIds } })
      if (auth.user?.state) or.push({ "location.state": auth.user.state })
      query.$or = or
    }

    posts = await CommunityPost.find(query)
      .populate("author", POST_AUTHOR_FIELDS)
      .populate("group", "name category")
      .populate("comments.author", COMMENT_AUTHOR_FIELDS)
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  }

  return ok({
    data: posts.map(serializePost),
    pagination: { page, limit, hasMore: posts.length === limit },
  })
})
