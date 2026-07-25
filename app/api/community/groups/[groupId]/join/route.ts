import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import CommunityGroup from "@/lib/models/CommunityGroup"
import { isValidId } from "../../../_lib/helpers"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ groupId: string }> }

/** POST /api/community/groups/:groupId/join */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { groupId } = await ctx.params
  if (!isValidId(groupId)) return fail("Invalid group id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const group = await CommunityGroup.findOne({ _id: groupId, isActive: true })
  if (!group) return fail("Group not found", 404)
  if (group.privacy === "private") return fail("This group is invite only", 403)

  const existing = group.members.find((m: any) => String(m.user) === auth.userId)
  if (existing?.isActive) return fail("Already a member of this group")

  const activeCount = group.members.filter((m: any) => m.isActive).length
  if (activeCount >= (group.maxMembers || 500)) return fail("Group has reached maximum member limit")

  if (existing) {
    existing.isActive = true
    existing.joinedAt = new Date()
  } else {
    group.members.push({ user: auth.userId, role: "member", joinedAt: new Date(), isActive: true })
  }

  await group.save()

  return ok({
    message: "Successfully joined the group",
    data: { memberCount: group.members.filter((m: any) => m.isActive).length },
  })
})
