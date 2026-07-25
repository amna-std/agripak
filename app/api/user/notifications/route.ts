import { connectDB } from "@/lib/db"
import { ok, fail, handler, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import User from "@/lib/models/User"
import Notification from "@/lib/models/Notification"
import { currentSeason } from "../../auth/_lib/pakistan"

export const dynamic = "force-dynamic"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const PRIORITY_RANK: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }

interface Item {
  id: string
  type: string
  title: string
  message: string
  priority: string
  isRead: boolean
  actionUrl?: string
  createdAt: Date | string
  /** `db` = a stored notification, `derived` = computed from this user's own record. */
  source: "db" | "derived"
}

/**
 * GET /api/user/notifications
 *
 * Merges stored notifications with advisories derived from the caller's own
 * profile and crop records. Derived items are tagged `source: "derived"` and
 * are never persisted, so nothing invented is presented as a stored alert.
 *
 * Query: `?unreadOnly=true`, `?limit=50`
 */
export const GET = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const params = searchParams(req)
  const unreadOnly = params.get("unreadOnly") === "true"
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 100)

  await connectDB()

  const user = await User.findById(auth.userId)
    .select("name profileCompleteness currentCrops loginCount createdAt role")
    .lean<any>()

  if (!user) return fail("User not found", 404)

  const stored = await Notification.find({ user: user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<any[]>()

  const unreadCount = await Notification.countDocuments({ user: user._id, isRead: false })

  const items: Item[] = stored.map((doc) => ({
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    message: doc.message,
    priority: doc.priority ?? "medium",
    isRead: Boolean(doc.isRead),
    actionUrl: doc.actionUrl,
    createdAt: doc.createdAt,
    source: "db",
  }))

  items.push(...derive(user))

  const visible = unreadOnly ? items.filter((item) => !item.isRead) : items

  visible.sort((a, b) => {
    const byPriority = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
    if (byPriority !== 0) return byPriority
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return ok({
    data: visible.slice(0, limit),
    // Only stored notifications can be marked read, so the badge count covers
    // those alone; `total` includes the derived advisories as well.
    unreadCount,
    total: visible.length,
    season: currentSeason(),
  })
})

/** Advisories computed from the user's own record — no external data involved. */
function derive(user: any): Item[] {
  const now = new Date()
  const items: Item[] = []

  const completeness = user.profileCompleteness ?? 0
  if (completeness < 80) {
    items.push({
      id: "profile-incomplete",
      type: "account",
      title: "Complete your profile",
      message: `Your profile is ${completeness}% complete. Add your land, soil and crop details for sharper advice.`,
      priority: "medium",
      isRead: false,
      actionUrl: "/profile",
      createdAt: now,
      source: "derived",
    })
  }

  for (const crop of Array.isArray(user.currentCrops) ? user.currentCrops : []) {
    if (!crop?.expectedHarvest) continue
    const due = new Date(crop.expectedHarvest).getTime() - now.getTime()
    if (due > 0 && due < WEEK_MS) {
      items.push({
        id: `harvest-${crop.cropName}`,
        type: "crop",
        title: "Harvest window approaching",
        message: `Your ${crop.cropName} is due for harvest within a week. Check mandi rates before you cut.`,
        priority: "high",
        isRead: false,
        actionUrl: "/market",
        createdAt: now,
        source: "derived",
      })
    }
  }

  const seasonal = seasonalAdvisory(now)
  if (seasonal) items.push(seasonal)

  if ((user.loginCount ?? 0) <= 3) {
    items.push({
      id: "welcome",
      type: "account",
      title: "Welcome to AgriPak",
      message: "Check the weather, mandi prices and government schemes for your district to get started.",
      priority: "low",
      isRead: false,
      actionUrl: "/dashboard",
      createdAt: user.createdAt ?? now,
      source: "derived",
    })
  }

  return items
}

/** Pakistan's calendar: Rabi sows Oct–Nov, Kharif sows Apr–May, monsoon peaks Jul–Aug. */
function seasonalAdvisory(now: Date): Item | null {
  const month = now.getMonth() + 1

  if (month === 10 || month === 11) {
    return {
      id: "season-rabi",
      type: "crop",
      title: "Rabi sowing season",
      message: "Rabi sowing is underway — wheat, chickpea (chana), mustard and potato. Prepare seedbeds and arrange certified seed.",
      priority: "medium",
      isRead: false,
      actionUrl: "/crop-advisor",
      createdAt: now,
      source: "derived",
    }
  }

  if (month === 4 || month === 5) {
    return {
      id: "season-kharif",
      type: "crop",
      title: "Kharif sowing season",
      message: "Kharif sowing is underway — cotton, rice, maize and sugarcane. Confirm your canal turn (warabandi) before sowing.",
      priority: "medium",
      isRead: false,
      actionUrl: "/crop-advisor",
      createdAt: now,
      source: "derived",
    }
  }

  if (month === 7 || month === 8) {
    return {
      id: "season-monsoon",
      type: "weather",
      title: "Monsoon precautions",
      message: "Monsoon rains are at their peak. Clear field drains and check the forecast before spraying or applying fertiliser.",
      priority: "high",
      isRead: false,
      actionUrl: "/weather",
      createdAt: now,
      source: "derived",
    }
  }

  // Off-peak months carry no calendar advisory.
  return null
}
