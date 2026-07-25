import { connectDB } from "@/lib/db"
import { ok, fail, handler } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import User from "@/lib/models/User"
import Notification from "@/lib/models/Notification"
import { COUNTRY, currentSeason } from "../../auth/_lib/pakistan"

export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * GET /api/user/dashboard — everything the dashboard header needs, derived
 * entirely from the caller's own record. Nothing here is synthesised.
 */
export const GET = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  await connectDB()

  const user = await User.findById(auth.userId).select("-password -verificationOTP").lean<any>()
  if (!user) return fail("User not found", 404)

  const unreadNotifications = await Notification.countDocuments({ user: user._id, isRead: false })

  const cropHistory: any[] = Array.isArray(user.cropHistory) ? user.cropHistory : []
  const currentCrops: any[] = Array.isArray(user.currentCrops) ? user.currentCrops : []
  const createdAt = user.createdAt ? new Date(user.createdAt) : null

  const season = currentSeason()

  const data = {
    profile: {
      name: user.name,
      role: user.role,
      mobile: user.mobile,
      village: user.village,
      district: user.district,
      province: user.state,
      country: COUNTRY,
      landSize: user.landSize ?? null,
      soilType: user.soilType ?? null,
      irrigationType: user.irrigationType ?? null,
      farmingType: user.farmingType ?? null,
      experience: user.experience ?? null,
      profileCompleteness: user.profileCompleteness ?? 0,
      isVerified: Boolean(user.isVerified),
      points: user.points ?? 0,
      level: user.level ?? 1,
    },
    farming: {
      season,
      currentCrops,
      recentCropHistory: cropHistory.slice(-5).reverse(),
      totalSeasons: cropHistory.length,
      uniqueCrops: new Set(cropHistory.map((crop) => crop.cropName).filter(Boolean)).size,
      averageYield: average(cropHistory.map((crop) => crop.yield)),
      yieldUnit: "quintals",
      totalProfit: sum(cropHistory.map((crop) => crop.profit)),
      totalLoss: sum(cropHistory.map((crop) => crop.loss)),
      currency: "PKR",
      seasonCrops: cropHistory.filter((crop) => crop.season === season),
    },
    activity: {
      loginCount: user.loginCount ?? 0,
      lastLogin: user.lastLogin ?? null,
      memberSince: createdAt,
      accountAgeDays: createdAt ? Math.floor((Date.now() - createdAt.getTime()) / DAY_MS) : 0,
      loginsPerWeek: loginsPerWeek(user.loginCount ?? 0, createdAt),
      unreadNotifications,
    },
    preferences: {
      language: user.preferredLanguage ?? "en",
      voiceEnabled: user.voiceEnabled ?? true,
      theme: user.theme ?? "light",
      notifications: user.notifications ?? {},
    },
  }

  return ok({ data })
})

function sum(values: any[]): number {
  return values.reduce<number>((total, value) => total + (Number(value) || 0), 0)
}

function average(values: any[]): number {
  const numeric = values.map(Number).filter((value) => Number.isFinite(value))
  if (numeric.length === 0) return 0
  return Math.round(numeric.reduce((total, value) => total + value, 0) / numeric.length)
}

function loginsPerWeek(loginCount: number, createdAt: Date | null): number {
  if (!createdAt) return 0
  const days = Math.floor((Date.now() - createdAt.getTime()) / DAY_MS)
  if (days < 7) return loginCount
  return Math.round((loginCount / days) * 7)
}
