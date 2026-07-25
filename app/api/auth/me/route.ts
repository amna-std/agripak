import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import User from "@/lib/models/User"
// Imported for their side effect: `populate()` below needs these models
// registered on the mongoose instance, which only happens on import.
import "@/lib/models/CommunityGroup"
import "@/lib/models/GovernmentScheme"
import { COUNTRY, currentSeason } from "../_lib/pakistan"

export const dynamic = "force-dynamic"

/** GET /api/auth/me — the signed-in user, used by the client to restore a session. */
export const GET = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const user = await User.findById(auth.userId)
    .select("-password -verificationOTP")
    .populate("communityGroups.groupId", "name category memberCount")
    .populate("following", "name role village district state")
    .populate("bookmarkedSchemes", "name category")

  if (!user) return fail("User not found", 404)

  // Fire-and-track presence with a targeted write so a legacy document that
  // fails full-document validation can still sign in.
  await User.updateOne({ _id: user._id }, { $set: { lastSeen: new Date() } })

  return ok({ user, country: COUNTRY, season: currentSeason() })
})
