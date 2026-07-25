import { connectDB } from "@/lib/db"
import { ok, fail, handler, readJson } from "@/lib/api-helpers"
import { signToken } from "@/lib/auth-helpers"
import User from "@/lib/models/User"
import { EMAIL_REGEX, MOBILE_ERROR, normalizeMobile } from "../_lib/pakistan"

export const dynamic = "force-dynamic"

const DAILY_LOGIN_POINTS = 10

/**
 * POST /api/auth/login — sign in with a Pakistani mobile number or an email.
 *
 * Credential problems always answer with the same generic message so the
 * endpoint cannot be used to enumerate registered accounts.
 */
export const POST = handler(async (req: Request) => {
  const body = await readJson(req)

  const password = typeof body.password === "string" ? body.password : ""
  if (!password) return fail("Password is required")

  const rawMobile = body.mobile ?? body.phone
  const rawEmail = body.email

  if (!rawMobile && !rawEmail) {
    return fail("Enter your mobile number or email")
  }

  let mobile: string | null = null
  if (rawMobile) {
    mobile = normalizeMobile(rawMobile)
    if (!mobile) return fail(MOBILE_ERROR)
  }

  let email: string | null = null
  if (rawEmail) {
    email = String(rawEmail).trim().toLowerCase()
    if (!EMAIL_REGEX.test(email)) return fail("Please enter a valid email address")
  }

  await connectDB()

  const user = await User.findOne({
    $or: [...(mobile ? [{ mobile }] : []), ...(email ? [{ email }] : [])],
    isActive: { $ne: false },
  })

  if (!user) return fail("Invalid credentials", 401)

  const passwordMatches = await user.comparePassword(password)
  if (!passwordMatches) return fail("Invalid credentials", 401)

  const now = new Date()
  const lastLoginDay = user.lastLogin ? new Date(user.lastLogin).toDateString() : null
  const isFirstLoginToday = lastLoginDay !== now.toDateString()

  const points = (user.points ?? 0) + (isFirstLoginToday ? DAILY_LOGIN_POINTS : 0)
  const level = Math.min(100, Math.floor(points / 1000) + 1)

  // A targeted update rather than `save()`: login must not fail because an
  // unrelated legacy field on an old document no longer passes validation.
  await User.updateOne(
    { _id: user._id },
    { $set: { lastLogin: now, lastSeen: now, points, level }, $inc: { loginCount: 1 } },
  )

  user.lastLogin = now
  user.lastSeen = now
  user.points = points
  user.level = level
  user.loginCount = (user.loginCount ?? 0) + 1

  const token = signToken({ userId: String(user._id), role: user.role })

  return ok({ message: "Login successful", token, user })
})
