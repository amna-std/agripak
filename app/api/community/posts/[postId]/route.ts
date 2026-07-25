import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import CommunityPost from "@/lib/models/CommunityPost"
import {
  COMMENT_AUTHOR_FIELDS,
  POST_AUTHOR_FIELDS,
  isValidId,
  optionalAuth,
  serializePost,
} from "../../_lib/helpers"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ postId: string }> }

/** GET /api/community/posts/:postId — a single post with its comments. */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { postId } = await ctx.params
  if (!isValidId(postId)) return fail("Invalid post id", 400)

  await connectDB()
  await optionalAuth(req)

  // Bump the view counter and read back in one round trip.
  const post = await CommunityPost.findOneAndUpdate(
    { _id: postId, isActive: true },
    { $inc: { views: 1 } },
    { new: true },
  )
    .populate("author", POST_AUTHOR_FIELDS)
    .populate("group", "name category")
    .populate("comments.author", COMMENT_AUTHOR_FIELDS)
    .populate("reactions.user", "name")
    .lean()

  if (!post) return fail("Post not found", 404)

  return ok({ data: serializePost(post) })
})

/** DELETE /api/community/posts/:postId — soft delete, author or admin only. */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const { postId } = await ctx.params
  if (!isValidId(postId)) return fail("Invalid post id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()
  const post = await CommunityPost.findById(postId).select("author")
  if (!post) return fail("Post not found", 404)

  if (String(post.author) !== auth.userId && auth.role !== "admin") {
    return fail("Only the author can delete this post", 403)
  }

  post.isActive = false
  await post.save()

  return ok({ message: "Post deleted" })
})
