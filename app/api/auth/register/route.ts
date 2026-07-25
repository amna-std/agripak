import { connectDB } from "@/lib/db"
import { ok, fail, handler, readJson } from "@/lib/api-helpers"
import { signToken } from "@/lib/auth-helpers"
import User from "@/lib/models/User"
import {
  COUNTRY,
  EMAIL_REGEX,
  LANGUAGE_ERROR,
  MOBILE_ERROR,
  PK_POSTCODE_REGEX,
  POSTCODE_ERROR,
  PROVINCE_ERROR,
  ROLE_ERROR,
  isExpertRole,
  isLanguage,
  mongoErrorMessage,
  normalizeMobile,
  normalizeProvince,
  normalizeRole,
  syncVoiceLanguage,
} from "../_lib/pakistan"

export const dynamic = "force-dynamic"

/** Irrigation vocabulary Pakistani farmers actually use -> the model's enum. */
const IRRIGATION_ALIASES: Record<string, string> = {
  tubewell: "borewell",
  tube_well: "borewell",
  "tube well": "borewell",
  borewell: "borewell",
  canal: "canal",
  rainfed: "rainfed",
  barani: "rainfed",
  drip: "drip",
  sprinkler: "sprinkler",
  flood: "flood",
  furrow: "furrow",
}

/**
 * POST /api/auth/register — create an account and return a session token.
 *
 * The password is hashed by the User model's pre-save hook, so it is passed
 * through in the clear here and never hashed manually.
 */
export const POST = handler(async (req: Request) => {
  const body = await readJson(req)

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (name.length < 2) return fail("Name must be at least 2 characters")

  const mobile = normalizeMobile(body.mobile ?? body.phone)
  if (!mobile) return fail(MOBILE_ERROR)

  const password = typeof body.password === "string" ? body.password : ""
  if (password.length < 6) return fail("Password must be at least 6 characters")

  let email: string | undefined
  if (body.email) {
    email = String(body.email).trim().toLowerCase()
    if (!EMAIL_REGEX.test(email)) return fail("Please enter a valid email address")
  }

  const role = normalizeRole(body.role)
  if (!role) return fail(ROLE_ERROR)

  const village = typeof body.village === "string" ? body.village.trim() : ""
  if (village.length < 2) return fail("Village or town name is required")

  const district = typeof body.district === "string" ? body.district.trim() : ""
  if (district.length < 2) return fail("District is required")

  // The User model calls this field `state`; in Pakistan it holds a province.
  const province = normalizeProvince(body.province ?? body.state)
  if (!province) return fail(PROVINCE_ERROR)

  let postalCode: string | undefined
  if (body.pincode || body.postalCode) {
    postalCode = String(body.pincode ?? body.postalCode).trim()
    if (!PK_POSTCODE_REGEX.test(postalCode)) return fail(POSTCODE_ERROR)
  }

  const preferredLanguage = body.preferredLanguage ?? body.language ?? "en"
  if (!isLanguage(preferredLanguage)) return fail(LANGUAGE_ERROR)

  await connectDB()

  const clash = await User.findOne({ $or: [{ mobile }, ...(email ? [{ email }] : [])] })
    .select("_id mobile email")
    .lean()

  if (clash) {
    const sameMobile = (clash as any).mobile === mobile
    return fail(
      sameMobile
        ? "An account with this mobile number already exists"
        : "An account with this email already exists",
      409,
    )
  }

  const userData: Record<string, any> = {
    name,
    mobile,
    email,
    password,
    role,
    village,
    district,
    state: province,
    pincode: postalCode,
    preferredLanguage,
    // Welcome bonus, matching the old API's 100-point grant on signup.
    points: 100,
  }

  if (body.education) userData.education = body.education
  if (isFiniteNumber(body.coordinates?.latitude) && isFiniteNumber(body.coordinates?.longitude)) {
    userData.coordinates = {
      latitude: Number(body.coordinates.latitude),
      longitude: Number(body.coordinates.longitude),
    }
  }

  if (role === "farmer") {
    const landSize = readLandSize(body)
    if (landSize) userData.landSize = landSize
    if (body.soilType) userData.soilType = String(body.soilType).toLowerCase()
    if (body.irrigationType) {
      const irrigation = IRRIGATION_ALIASES[String(body.irrigationType).toLowerCase()]
      if (irrigation) userData.irrigationType = irrigation
    }
    if (body.farmingType) userData.farmingType = String(body.farmingType).toLowerCase()
    if (isFiniteNumber(body.experience)) userData.experience = Number(body.experience)
    if (Array.isArray(body.preferredCrops)) userData.preferredCrops = body.preferredCrops
    else if (body.primaryCrop) userData.preferredCrops = [String(body.primaryCrop)]
  } else if (isExpertRole(role)) {
    if (body.qualification) userData.qualification = String(body.qualification).trim()
    if (isFiniteNumber(body.experience)) userData.experience = Number(body.experience)
    if (Array.isArray(body.specialization)) userData.specialization = body.specialization
  }

  try {
    const user = new User(userData)
    await user.save()
    await syncVoiceLanguage(user)

    const token = signToken({ userId: String(user._id), role: user.role })

    return ok(
      {
        message: "Registration successful",
        token,
        user,
        country: COUNTRY,
      },
      201,
    )
  } catch (error: any) {
    const message = mongoErrorMessage(error)
    if (message) return fail(message, error?.code === 11000 ? 409 : 400)
    throw error
  }
})

function isFiniteNumber(value: unknown): boolean {
  return value !== null && value !== "" && value !== undefined && Number.isFinite(Number(value))
}

/** Accepts `landSize: { value, unit }` or a bare `farmSize: "5"` from the form. */
function readLandSize(body: Record<string, any>): { value: number; unit: string } | null {
  const raw = body.landSize?.value ?? body.landSize ?? body.farmSize
  if (!isFiniteNumber(raw)) return null

  const value = Number(raw)
  if (value < 0.1) return null

  const unit = body.landSize?.unit === "hectares" ? "hectares" : "acres"
  return { value, unit }
}
