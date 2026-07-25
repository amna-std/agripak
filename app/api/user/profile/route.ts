import { connectDB } from "@/lib/db"
import { ok, fail, handler, readJson } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import User from "@/lib/models/User"
import {
  COUNTRY,
  EMAIL_REGEX,
  LANGUAGE_ERROR,
  MOBILE_ERROR,
  PK_POSTCODE_REGEX,
  POSTCODE_ERROR,
  PROVINCE_ERROR,
  isExpertRole,
  isLanguage,
  mongoErrorMessage,
  normalizeMobile,
  normalizeProvince,
  syncVoiceLanguage,
} from "../../auth/_lib/pakistan"

export const dynamic = "force-dynamic"

/** Fields any signed-in user may change on their own profile. */
const COMMON_FIELDS = [
  "name",
  "email",
  "mobile",
  "village",
  "district",
  "state",
  "pincode",
  "preferredLanguage",
  "voiceEnabled",
  "theme",
  "notifications",
  "education",
  "coordinates",
  "whatsappNumber",
  "socialMedia",
  "privacy",
] as const

const FARMER_FIELDS = [
  ...COMMON_FIELDS,
  "landSize",
  "soilType",
  "irrigationType",
  "farmingType",
  "experience",
  "annualIncome",
  "familyMembers",
  "dependents",
  "farmEquipment",
  "preferredCrops",
  "bankDetails",
] as const

const EXPERT_FIELDS = [...COMMON_FIELDS, "qualification", "experience", "specialization", "license"] as const

function allowedFields(role: string): readonly string[] {
  if (role === "farmer") return FARMER_FIELDS
  if (isExpertRole(role)) return EXPERT_FIELDS
  return COMMON_FIELDS
}

/** GET /api/user/profile — the caller's own profile. */
export const GET = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const user = await User.findById(auth.userId).select("-password -verificationOTP")
  if (!user) return fail("User not found", 404)

  return ok({ user, country: COUNTRY, province: user.state })
})

/** PUT /api/user/profile — update the caller's own profile. */
export const PUT = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readJson(req)

  await connectDB()

  const user = await User.findById(auth.userId)
  if (!user) return fail("User not found", 404)

  // `province` is the Pakistani name for the model's `state` field.
  if (body.province !== undefined && body.state === undefined) {
    body.state = body.province
  }
  delete body.province

  const permitted = allowedFields(user.role)
  const updates: Record<string, any> = {}
  for (const key of Object.keys(body)) {
    if (permitted.includes(key)) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return fail("No updatable fields were provided")
  }

  /* ---- validate the identity- and locale-sensitive fields explicitly ---- */

  if ("name" in updates) {
    const name = String(updates.name ?? "").trim()
    if (name.length < 2) return fail("Name must be at least 2 characters")
    updates.name = name
  }

  if ("mobile" in updates) {
    const mobile = normalizeMobile(updates.mobile)
    if (!mobile) return fail(MOBILE_ERROR)
    if (mobile !== user.mobile) {
      const taken = await User.exists({ mobile, _id: { $ne: user._id } })
      if (taken) return fail("An account with this mobile number already exists", 409)
    }
    updates.mobile = mobile
  }

  if ("whatsappNumber" in updates && updates.whatsappNumber) {
    const whatsapp = normalizeMobile(updates.whatsappNumber)
    if (!whatsapp) return fail(MOBILE_ERROR)
    updates.whatsappNumber = whatsapp
  }

  if ("email" in updates) {
    if (!updates.email) {
      updates.email = undefined
    } else {
      const email = String(updates.email).trim().toLowerCase()
      if (!EMAIL_REGEX.test(email)) return fail("Please enter a valid email address")
      if (email !== user.email) {
        const taken = await User.exists({ email, _id: { $ne: user._id } })
        if (taken) return fail("An account with this email already exists", 409)
      }
      updates.email = email
    }
  }

  if ("state" in updates) {
    const province = normalizeProvince(updates.state)
    if (!province) return fail(PROVINCE_ERROR)
    updates.state = province
  }

  if ("pincode" in updates && updates.pincode) {
    const postalCode = String(updates.pincode).trim()
    if (!PK_POSTCODE_REGEX.test(postalCode)) return fail(POSTCODE_ERROR)
    updates.pincode = postalCode
  }

  if ("preferredLanguage" in updates && !isLanguage(updates.preferredLanguage)) {
    return fail(LANGUAGE_ERROR)
  }

  for (const field of ["village", "district"] as const) {
    if (field in updates) {
      const value = String(updates[field] ?? "").trim()
      if (value.length < 2) return fail(`${field === "village" ? "Village or town" : "District"} is required`)
      updates[field] = value
    }
  }

  /* ------------------------------- apply ------------------------------- */

  for (const [key, value] of Object.entries(updates)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // Shallow-merge nested groups (notifications, privacy, coordinates…) so a
      // partial patch never wipes the sibling keys.
      for (const [subKey, subValue] of Object.entries(value)) {
        user.set(`${key}.${subKey}`, subValue)
      }
    } else {
      user.set(key, value)
    }
  }

  try {
    // Only re-validate what changed: an untouched legacy field must not block
    // the user from fixing the rest of their profile.
    await user.save({ validateModifiedOnly: true })
    await syncVoiceLanguage(user)
  } catch (error: any) {
    const message = mongoErrorMessage(error)
    if (message) return fail(message, error?.code === 11000 ? 409 : 400)
    throw error
  }

  const fresh = await User.findById(user._id).select("-password -verificationOTP")

  return ok({ message: "Profile updated successfully", user: fresh, country: COUNTRY })
})
