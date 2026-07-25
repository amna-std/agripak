import { connectDB } from "@/lib/db"
import { ok, handler, searchParams } from "@/lib/api-helpers"
import Expert from "@/lib/models/Expert"
import User from "@/lib/models/User"
import { SAMPLE_EXPERTS } from "./_lib/samples"

export const dynamic = "force-dynamic"

/** Roles on the User document that make somebody an adviser. */
const EXPERT_ROLES = ["expert", "agriculture_expert", "agri_doctor"]

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Province / district / name filters, applied in memory. These fields live on
 * the populated `user` document (or on a sample), so they cannot be expressed
 * in the Expert collection's own query.
 */
function applyPostFilters<T extends { province: string | null; district: string | null; name: string }>(
  rows: T[],
  opts: { province?: string | null; district?: string | null; search: string },
): T[] {
  let out = rows
  if (opts.province) out = out.filter((e) => e.province === opts.province)
  if (opts.district) out = out.filter((e) => e.district === opts.district)
  if (opts.search.length >= 2) {
    const needle = opts.search.toLowerCase()
    out = out.filter((e) => e.name.toLowerCase().includes(needle))
  }
  return out
}

/** One directory shape regardless of which collection an adviser came from. */
function fromExpertProfile(profile: any) {
  const user = profile.user || {}
  return {
    _id: String(profile._id),
    userId: user._id ? String(user._id) : null,
    name: user.name || "Agricultural expert",
    profilePicture: user.profilePicture || null,
    qualification: profile.education?.[0]?.degree || user.qualification || null,
    specialization: profile.specialization || [],
    experience: profile.experience ?? user.experience ?? 0,
    languages: profile.languages || [],
    district: user.district || null,
    province: user.state || null,
    rating: profile.rating || { average: 0, count: 0 },
    consultationFee: profile.consultationFee ?? profile.hourlyRate ?? 0,
    currency: "PKR",
    responseTime: profile.responseTime ?? 24,
    consultationMethods: profile.consultationMethods || {},
    isVerified: !!profile.isVerified,
    isAvailable: profile.isAvailable !== false,
    bio: profile.bio || null,
    source: "expert-profile" as const,
  }
}

function fromUser(user: any) {
  return {
    _id: String(user._id),
    userId: String(user._id),
    name: user.name,
    profilePicture: user.profilePicture || null,
    qualification: user.qualification || null,
    specialization: user.specialization || [],
    experience: user.experience ?? 0,
    languages: user.preferredLanguage ? [user.preferredLanguage] : [],
    district: user.district || null,
    province: user.state || null,
    rating: user.rating || { average: 0, count: 0 },
    consultationFee: 0,
    currency: "PKR",
    responseTime: 24,
    consultationMethods: {},
    isVerified: !!user.isVerified,
    isAvailable: user.isActive !== false,
    bio: null,
    source: "user-profile" as const,
  }
}

function fromSample(sample: (typeof SAMPLE_EXPERTS)[number]) {
  return {
    _id: sample._id,
    userId: null,
    name: sample.name,
    profilePicture: null,
    qualification: sample.qualification,
    specialization: sample.specialization,
    crops: sample.crops,
    experience: sample.experience,
    languages: sample.languages,
    district: sample.district,
    province: sample.province,
    rating: { average: 0, count: 0 },
    consultationFee: sample.consultationFee,
    currency: "PKR",
    responseTime: 24,
    consultationMethods: {},
    isVerified: false,
    isAvailable: false,
    bio: sample.bio,
    // Illustrative only — not a real adviser and not bookable.
    isSample: true,
    source: "sample" as const,
  }
}

/**
 * GET /api/expert — the expert directory.
 *
 * Reads registered Expert profiles first, falls back to users holding an
 * adviser role, and only if the platform has nobody on record returns a set of
 * clearly-labelled sample profiles (`source: "sample"`) so the page is not blank.
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const page = Math.max(1, Number(params.get("page")) || 1)
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 10))
  const specialization = params.get("specialization")
  const province = params.get("province") || params.get("state")
  const district = params.get("district")
  const minRating = Number(params.get("minRating"))
  const search = (params.get("search") || "").trim()

  await connectDB()

  const expertQuery: Record<string, any> = { status: "active" }
  if (specialization) expertQuery.specialization = { $in: [specialization] }
  if (Number.isFinite(minRating) && minRating > 0) expertQuery["rating.average"] = { $gte: minRating }

  // Province / district / search live on the populated user, so they cannot go
  // into the Expert query. When one is supplied the whole (small) directory is
  // read and filtered before paging — filtering *after* .limit() would both
  // report a wrong total and blank out pages that do have matches.
  const needsPostFilter = !!(province || district || search.length >= 2)

  const profileCursor = Expert.find(expertQuery)
    .populate("user", "name profilePicture district state qualification experience")
    .sort({ "rating.average": -1, experience: -1 })

  let experts: any[]
  let total: number
  let source: "expert-profile" | "user-profile" | "sample" = "expert-profile"

  if (needsPostFilter) {
    const all = (await profileCursor.limit(500).lean()).map(fromExpertProfile)
    const filtered = applyPostFilters(all, { province, district, search })
    total = filtered.length
    experts = filtered.slice((page - 1) * limit, page * limit)
  } else {
    const [profiles, profileTotal] = await Promise.all([
      profileCursor.skip((page - 1) * limit).limit(limit).lean(),
      Expert.countDocuments(expertQuery),
    ])
    experts = profiles.map(fromExpertProfile)
    total = profileTotal
  }

  if (total === 0) {
    // Nobody has completed an expert profile yet — fall back to the users who
    // signed up with an adviser role.
    const userQuery: Record<string, any> = { role: { $in: EXPERT_ROLES }, isActive: { $ne: false } }
    if (specialization) userQuery.specialization = { $in: [specialization] }
    if (province) userQuery.state = province
    if (district) userQuery.district = district
    if (Number.isFinite(minRating) && minRating > 0) userQuery["rating.average"] = { $gte: minRating }
    if (search.length >= 2) userQuery.name = { $regex: escapeRegex(search), $options: "i" }

    const [users, userTotal] = await Promise.all([
      User.find(userQuery)
        .select("name profilePicture district state qualification experience specialization rating isActive isVerified preferredLanguage")
        .sort({ "rating.average": -1, experience: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(userQuery),
    ])

    experts = users.map(fromUser)
    total = userTotal
    source = "user-profile"
  }

  if (total === 0) {
    // Illustrative profiles are served only when the platform genuinely has
    // nobody on record. If advisers exist but this filter excluded them, an
    // empty list is the honest answer — samples would otherwise read as real
    // matches for a province or search the platform has no adviser for.
    const [anyProfile, anyUser] = await Promise.all([
      Expert.countDocuments({ status: "active" }),
      User.countDocuments({ role: { $in: EXPERT_ROLES }, isActive: { $ne: false } }),
    ])

    if (anyProfile === 0 && anyUser === 0) {
      let samples = applyPostFilters(SAMPLE_EXPERTS.map(fromSample), { province, district, search })
      if (specialization) samples = samples.filter((e) => e.specialization.includes(specialization))

      return ok({
        data: samples,
        source: "sample",
        isSample: true,
        message: "No experts are registered yet — showing example profiles. These are not real advisers.",
        pagination: { page: 1, limit: samples.length, total: samples.length, pages: 1 },
      })
    }
  }

  return ok({
    data: experts,
    source,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  })
})
