import { connectDB } from "@/lib/db"
import { fail, handler, ok, readJson, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import Product from "@/lib/models/Product"

export const dynamic = "force-dynamic"

/**
 * Agri-input catalogue (seeds, fertiliser, tools…). All money is PKR.
 *
 * Crop produce sold by farmers lives at /api/marketplace/listings instead.
 */

const CATEGORIES = ["seeds", "fertilizers", "pesticides", "tools", "equipment", "organic", "irrigation"] as const
const STOCK_UNITS = ["kg", "gm", "ltr", "ml", "pieces", "packets", "bags", "bottles", "kits"] as const

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  price_asc: { "price.selling": 1 },
  price_desc: { "price.selling": -1 },
  rating: { "ratings.average": -1 },
  popular: { sales: -1 },
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * GET /api/marketplace/products
 *
 * Public. Query: q, category, subcategory, brand, seller, district, province,
 * minPrice, maxPrice, inStock, sortBy, page, limit
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)

  const page = Math.max(Number.parseInt(params.get("page") ?? "1", 10) || 1, 1)
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "20", 10) || 20, 1), 100)

  const sortKey = params.get("sortBy") ?? "newest"
  const sort = SORTS[sortKey]
  if (!sort) return fail(`\`sortBy\` must be one of: ${Object.keys(SORTS).join(", ")}`)

  const filter: Record<string, any> = { isActive: true }

  const category = params.get("category")
  if (category) {
    if (!CATEGORIES.includes(category as any)) {
      return fail(`\`category\` must be one of: ${CATEGORIES.join(", ")}`)
    }
    filter.category = category
  }

  const subcategory = params.get("subcategory")
  if (subcategory) filter.subcategory = new RegExp(escapeRegex(subcategory), "i")

  const brand = params.get("brand")
  if (brand) filter.brand = new RegExp(escapeRegex(brand), "i")

  const seller = params.get("seller")
  if (seller) {
    if (!/^[a-f\d]{24}$/i.test(seller)) return fail("`seller` must be a valid id")
    filter.seller = seller
  }

  const district = params.get("district")
  if (district) filter["location.district"] = new RegExp(escapeRegex(district), "i")

  const province = params.get("province") ?? params.get("state")
  if (province) filter["location.state"] = new RegExp(escapeRegex(province), "i")

  const minPrice = params.get("minPrice")
  const maxPrice = params.get("maxPrice")
  if (minPrice || maxPrice) {
    filter["price.selling"] = {}
    if (minPrice) filter["price.selling"].$gte = Number(minPrice)
    if (maxPrice) filter["price.selling"].$lte = Number(maxPrice)
  }

  if (params.get("inStock") === "true") filter["stock.quantity"] = { $gt: 0 }

  const q = params.get("q")
  if (q) {
    const re = new RegExp(escapeRegex(q), "i")
    filter.$or = [{ name: re }, { description: re }, { brand: re }, { tags: re }]
  }

  await connectDB()

  const [products, total] = await Promise.all([
    (Product as any)
      .find(filter)
      .select("-reviews")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("seller", "name district state role")
      .lean(),
    (Product as any).countDocuments(filter),
  ])

  return ok({
    products,
    currency: "PKR",
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

/**
 * POST /api/marketplace/products
 *
 * Creates a product owned by the signed-in user. Uses `.save()` so the schema's
 * discount-calculation and `seoUrl` slug hooks run — `insertMany` would skip
 * them and collide on the unique `seoUrl` index.
 */
export const POST = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readJson(req)

  const name = String(body.name ?? "").trim()
  const description = String(body.description ?? "").trim()
  const category = String(body.category ?? "").trim()
  const subcategory = String(body.subcategory ?? "").trim()
  const brand = String(body.brand ?? "").trim()

  if (!name) return fail("`name` is required")
  if (!description) return fail("`description` is required")
  if (description.length > 2000) return fail("`description` must be 2000 characters or fewer")
  if (!CATEGORIES.includes(category as any)) return fail(`\`category\` must be one of: ${CATEGORIES.join(", ")}`)
  if (!subcategory) return fail("`subcategory` is required")
  if (!brand) return fail("`brand` is required")

  const selling = Number(body.price?.selling ?? body.price)
  const mrp = Number(body.price?.mrp ?? selling)
  if (!Number.isFinite(selling) || selling <= 0) return fail("`price.selling` must be a positive number (PKR)")
  if (!Number.isFinite(mrp) || mrp <= 0) return fail("`price.mrp` must be a positive number (PKR)")
  if (selling > mrp) return fail("`price.selling` cannot exceed `price.mrp`")

  const stockQuantity = Number(body.stock?.quantity)
  const stockUnit = String(body.stock?.unit ?? "")
  if (!Number.isFinite(stockQuantity) || stockQuantity < 0) return fail("`stock.quantity` must be zero or more")
  if (!STOCK_UNITS.includes(stockUnit as any)) return fail(`\`stock.unit\` must be one of: ${STOCK_UNITS.join(", ")}`)

  await connectDB()

  const product = new (Product as any)({
    name,
    description,
    category,
    subcategory,
    brand,
    images: Array.isArray(body.images) ? body.images : [],
    price: { mrp, selling },
    specifications: body.specifications ?? {},
    seller: auth.userId,
    stock: {
      quantity: stockQuantity,
      unit: stockUnit,
      lowStockAlert: Number(body.stock?.lowStockAlert) || 10,
    },
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    location: {
      state: body.location?.state ?? body.location?.province ?? auth.user?.state,
      district: body.location?.district ?? auth.user?.district,
      pincode: body.location?.pincode ?? "",
    },
    shipping: {
      freeShipping: Boolean(body.shipping?.freeShipping),
      shippingCost: Number(body.shipping?.shippingCost) || 0,
      deliveryDays: Number(body.shipping?.deliveryDays) || 7,
    },
    negotiable: Boolean(body.negotiable),
    bulkDiscount: Array.isArray(body.bulkDiscount) ? body.bulkDiscount : [],
  })

  await product.save()

  return ok({ message: "Product listed successfully", product: product.toObject(), currency: "PKR" }, 201)
})
