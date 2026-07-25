import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import CommunityPost from "@/lib/models/CommunityPost"
import { REACTION_TYPES, isValidId, readBody } from "../../../_lib/helpers"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ postId: string }> }

/**
 * POST /api/community/posts/:postId/react — like / love / helpful / thanks.
 *
 * Re-sending the same reaction removes it (toggle), a different type replaces it.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { postId } = await ctx.params
  if (!isValidId(postId)) return fail("Invalid post id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readBody(req)
  const type = String(body.type ?? "like")
  if (!(REACTION_TYPES as readonly string[]).includes(type)) return fail("Invalid reaction type")

  await connectDB()

  const post = await CommunityPost.findOne({ _id: postId, isActive: true })
  if (!post) return fail("Post not found", 404)

  const existing = post.reactions.find((r: any) => String(r.user) === auth.userId)
  if (existing) {
    if (existing.type === type) post.reactions.pull(existing._id)
    else existing.type = type
  } else {
    post.reactions.push({ user: auth.userId, type })
  }

  await post.save()

  const userReaction = post.reactions.find((r: any) => String(r.user) === auth.userId)?.type || null

  return ok({ data: { reactionCount: post.reactions.length, userReaction } })
})
