import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import CommunityPost from "@/lib/models/CommunityPost"
import { COMMENT_AUTHOR_FIELDS, isValidId, maybeJson, optionalAuth, readBody } from "../../../_lib/helpers"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ postId: string }> }

/** GET /api/community/posts/:postId/comments — comment thread for a post. */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { postId } = await ctx.params
  if (!isValidId(postId)) return fail("Invalid post id", 400)

  await connectDB()
  await optionalAuth(req)

  const post = await CommunityPost.findById(postId)
    .select("comments")
    .populate("comments.author", COMMENT_AUTHOR_FIELDS)
    .lean<any>()

  if (!post) return fail("Post not found", 404)

  return ok({ data: post.comments || [] })
})

/** POST /api/community/posts/:postId/comments — add a comment. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { postId } = await ctx.params
  if (!isValidId(postId)) return fail("Invalid post id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readBody(req)
  const content = String(body.content ?? "").trim()
  if (content.length < 1 || content.length > 1000) return fail("Comment must be 1-1000 characters")

  await connectDB()

  const post = await CommunityPost.findOne({ _id: postId, isActive: true })
  if (!post) return fail("Post not found", 404)

  // Only already-hosted attachment URLs — serverless has no writable disk.
  const supplied = maybeJson(body.attachments)
  const attachments = (Array.isArray(supplied) ? supplied : [])
    .filter((a: any) => a && a.url)
    .map((a: any) => ({
      url: String(a.url),
      type: ["image", "video", "document"].includes(a.type) ? a.type : "document",
      filename: a.filename ? String(a.filename) : undefined,
    }))

  post.comments.push({ author: auth.userId, content, attachments })
  await post.save()
  await post.populate("comments.author", COMMENT_AUTHOR_FIELDS)

  const newComment = post.comments[post.comments.length - 1]

  return ok({ data: newComment, commentCount: post.comments.length }, 201)
})
