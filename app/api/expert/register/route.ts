import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import Expert from "@/lib/models/Expert"

export const dynamic = "force-dynamic"

/**
 * POST /api/expert/register — the signed-in user creates an expert profile.
 *
 * Fees are stored in PKR. The profile starts unverified; an admin verifies it
 * before it carries a verified badge in the directory.
 */
export const POST = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  let body: Record<string, any>
  try {
    body = (await req.json()) ?? {}
  } catch {
    body = {}
  }

  const specialization = Array.isArray(body.specialization)
    ? body.specialization.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean)
    : []
  const experience = Number(body.experience)
  const consultationFee = Number(body.consultationFee ?? body.hourlyRate)
  const bio = String(body.bio ?? "").trim()

  if (specialization.length === 0) return fail("At least one specialization is required")
  if (!Number.isFinite(experience) || experience < 0 || experience > 60) {
    return fail("Experience must be a number of years between 0 and 60")
  }
  if (!Number.isFinite(consultationFee) || consultationFee < 0) {
    return fail("A consultation fee in PKR is required (0 for free advice)")
  }
  if (bio.length < 50 || bio.length > 2000) return fail("Bio must be 50-2000 characters")

  await connectDB()

  const existing = await Expert.findOne({ user: auth.userId }).select("_id").lean()
  if (existing) return fail("You already have an expert profile", 409)

  const created = await Expert.create({
    user: auth.userId,
    specialization,
    experience,
    hourlyRate: consultationFee,
    consultationFee,
    bio,
    languages: Array.isArray(body.languages) ? body.languages.map((l: any) => String(l).toLowerCase()) : [],
    availability: Array.isArray(body.availability) ? body.availability : [],
    education: Array.isArray(body.education) ? body.education : [],
    certifications: Array.isArray(body.certifications) ? body.certifications : [],
    consultationMethods: {
      video: !!body.consultationMethods?.video,
      chat: body.consultationMethods?.chat !== false,
      inPerson: !!body.consultationMethods?.inPerson,
    },
    responseTime: Number(body.responseTime) || 24,
    isAvailable: true,
    isVerified: false,
    status: "active",
  })

  const profile = await Expert.findById(created._id)
    .populate("user", "name profilePicture district state qualification")
    .lean()

  return ok({ data: profile, currency: "PKR", message: "Expert profile created. It will show in the directory once verified." }, 201)
})
