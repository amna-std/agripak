import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import CommunityPost from "@/lib/models/CommunityPost"
import { isValidId } from "../../../../../_lib/helpers"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ postId: string; commentId: string }> }

/**
 * POST /api/community/posts/:postId/comments/:commentId/mark-answer
 * Marks a comment as the accepted answer and resolves the post.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { postId, commentId } = await ctx.params
  if (!isValidId(postId) || !isValidId(commentId)) return fail("Invalid id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const post = await CommunityPost.findOne({ _id: postId, isActive: true })
  if (!post) return fail("Post not found", 404)

  if (String(post.author) !== auth.userId && auth.role !== "admin") {
    return fail("Only post author can mark answers", 403)
  }

  const comment = post.comments.id(commentId)
  if (!comment) return fail("Comment not found", 404)

  post.comments.forEach((c: any) => {
    c.isAnswer = false
  })
  comment.isAnswer = true
  post.isResolved = true
  await post.save()

  return ok({ message: "Comment marked as answer" })
})
