import { connectDB } from "@/lib/db"
import { ok, fail, handler, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import ForumModels from "@/lib/models/Forum"
import { escapeRegex, isValidId, optionalAuth, paginationFrom, readBody, toStringArray } from "../_lib/helpers"

export const dynamic = "force-dynamic"

const { ForumCategory, ForumTopic } = ForumModels as any

/**
 * Default forum board structure for Pakistani farming.
 *
 * These are navigation categories (the board's table of contents), not
 * user-facing data — they are created once so the forum is usable on a fresh
 * database. No posts, replies or authors are ever fabricated.
 */
const DEFAULT_CATEGORIES = [
  {
    name: "Crop Production",
    description: "Wheat, Basmati & IRRI rice, cotton, sugarcane, maize — sowing to harvest.",
    icon: "wheat",
    color: "bg-green-500",
  },
  {
    name: "Pests & Diseases",
    description: "Pink bollworm, wheat rust, sugarcane borer, locusts and how to treat them.",
    icon: "bug",
    color: "bg-red-500",
  },
  {
    name: "Irrigation & Water",
    description: "Canal turns (warabandi), tubewells, solar pumps, drip and laser levelling.",
    icon: "droplet",
    color: "bg-blue-500",
  },
  {
    name: "Soil & Fertiliser",
    description: "Soil testing, urea and DAP rates, gypsum for saline land, organic matter.",
    icon: "layers",
    color: "bg-amber-600",
  },
  {
    name: "Mandi & Prices",
    description: "Rates across Pakistani mandis, support price news and when to sell.",
    icon: "trending-up",
    color: "bg-yellow-500",
  },
  {
    name: "Government Schemes",
    description: "Kissan Card, Green Tractor Scheme, ZTBL loans, Benazir Hari Card and subsidies.",
    icon: "landmark",
    color: "bg-emerald-600",
  },
  {
    name: "Machinery & Equipment",
    description: "Tractors, harvesters, rental services and repairs.",
    icon: "tractor",
    color: "bg-slate-600",
  },
  {
    name: "Livestock & Dairy",
    description: "Buffalo and cattle care, fodder crops (berseem, maize), milk marketing.",
    icon: "cow",
    color: "bg-orange-500",
  },
  {
    name: "Horticulture",
    description: "Mango, kinnow, dates, apples and vegetable tunnel farming.",
    icon: "apple",
    color: "bg-lime-600",
  },
  {
    name: "Weather & Climate",
    description: "Monsoon, heatwaves, frost, hailstorms and Rabi/Kharif planning.",
    icon: "cloud-sun",
    color: "bg-sky-500",
  },
]

/** Creates the default board structure once, on an empty forum. */
async function ensureCategories() {
  const count = await ForumCategory.estimatedDocumentCount()
  if (count > 0) return

  await ForumCategory.bulkWrite(
    DEFAULT_CATEGORIES.map((category) => ({
      updateOne: {
        filter: { name: category.name },
        update: { $setOnInsert: { ...category, isActive: true } },
        upsert: true,
      },
    })),
    { ordered: false },
  )
}

/**
 * GET /api/community/topics
 *
 * `?type=categories` returns the category list, otherwise the topic list,
 * optionally narrowed by `categoryId` and `search`.
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)
  const type = params.get("type")
  const categoryId = params.get("categoryId")
  const search = (params.get("search") || "").trim()
  const { page, limit, skip } = paginationFrom(params)

  await connectDB()
  await optionalAuth(req)
  await ensureCategories()

  if (type === "categories") {
    const categories = await ForumCategory.find({ isActive: true }).sort({ name: 1 }).lean()
    return ok({ data: categories })
  }

  const query: Record<string, any> = { isActive: true }
  if (categoryId) {
    if (!isValidId(categoryId)) return fail("Invalid category id", 400)
    query.category = categoryId
  }
  if (search.length >= 2) {
    const pattern = escapeRegex(search)
    query.$or = [
      { title: { $regex: pattern, $options: "i" } },
      { content: { $regex: pattern, $options: "i" } },
      { tags: { $regex: pattern, $options: "i" } },
    ]
  }

  const topics = await ForumTopic.find(query)
    .populate("author", "name profilePicture role district state")
    .populate("category", "name color icon")
    .populate("lastReply.author", "name")
    .sort({ isPinned: -1, updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()

  return ok({
    data: topics,
    pagination: { page, limit, hasMore: topics.length === limit },
  })
})

/** POST /api/community/topics — start a new forum topic. */
export const POST = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readBody(req)
  const title = String(body.title ?? "").trim()
  const content = String(body.content ?? "").trim()
  const categoryId = String(body.categoryId ?? body.category ?? "")

  if (title.length < 5 || title.length > 200) return fail("Title must be 5-200 characters")
  if (content.length < 10 || content.length > 5000) return fail("Content must be 10-5000 characters")
  if (!isValidId(categoryId)) return fail("A valid category is required")

  await connectDB()
  await ensureCategories()

  const category = await ForumCategory.findOne({ _id: categoryId, isActive: true }).select("_id")
  if (!category) return fail("Category not found", 404)

  const created = await ForumTopic.create({
    title,
    content,
    author: auth.userId,
    category: category._id,
    tags: toStringArray(body.tags),
    lastReply: { author: auth.userId, createdAt: new Date() },
  })

  await ForumCategory.updateOne(
    { _id: category._id },
    { $inc: { postCount: 1 }, $set: { lastActivity: new Date() } },
  )

  const topic = await ForumTopic.findById(created._id)
    .populate("author", "name profilePicture role district state")
    .populate("category", "name color icon")
    .lean()

  return ok({ data: topic, message: "Topic created successfully" }, 201)
})
