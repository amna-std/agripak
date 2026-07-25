import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import CommunityGroup from "@/lib/models/CommunityGroup"
import { isValidId } from "../../../_lib/helpers"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ groupId: string }> }

/** POST /api/community/groups/:groupId/leave */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { groupId } = await ctx.params
  if (!isValidId(groupId)) return fail("Invalid group id", 400)

  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const group = await CommunityGroup.findOne({ _id: groupId, isActive: true })
  if (!group) return fail("Group not found", 404)

  const member = group.members.find((m: any) => String(m.user) === auth.userId && m.isActive)
  if (!member) return fail("Not a member of this group")

  member.isActive = false
  await group.save()

  return ok({
    message: "Successfully left the group",
    data: { memberCount: group.members.filter((m: any) => m.isActive).length },
  })
})
