import { connectDB } from "@/lib/db"
import { fail, handler, ok, readJson, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import CropListing from "@/lib/models/CropListing"
import { getCrop, resolveCrop } from "@/lib/data/pakistan-crops"

export const dynamic = "force-dynamic"

/**
 * Farmer-to-buyer crop listings — the produce side of the marketplace.
 * All prices are PKR; quantities use mandi units (kg / quintal / ton / bags).
 */

const CATEGORIES = ["vegetables", "fruits", "grains", "pulses", "spices", "cash_crops"] as const
// `maund` (~40 kg) is the unit Pakistani farmers actually trade in and is already
// in the CropListing schema enum — it was missing here, so the sell-crop form's
// default unit was rejected with a 400.
const UNITS = ["kg", "maund", "quintal", "ton", "pieces", "bags"] as const
const GRADES = ["A", "B", "C"] as const
const STATUSES = ["active", "sold_out", "expired", "inactive"] as const

/** Roles allowed to list produce. Experts and doctors have no produce to sell. */
const SELLER_ROLES = ["farmer", "seller", "admin"]

/** Pakistani postal codes are 5 digits. */
const POSTCODE_RE = /^\d{5}$/

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  price_asc: { "pricing.basePrice": 1 },
  price_desc: { "pricing.basePrice": -1 },
  quantity: { "quantity.available": -1 },
  harvest: { "quality.harvestDate": -1 },
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseDate(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * GET /api/marketplace/listings
 *
 * Public. Query: crop, category, district, province, status, grade, organic,
 * minPrice, maxPrice, farmer, sortBy, page, limit
 */
export const GET = handler(async (req: Request) => {
  const params = searchParams(req)

  const page = Math.max(Number.parseInt(params.get("page") ?? "1", 10) || 1, 1)
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "20", 10) || 20, 1), 100)

  const sortKey = params.get("sortBy") ?? "newest"
  const sort = SORTS[sortKey]
  if (!sort) return fail(`\`sortBy\` must be one of: ${Object.keys(SORTS).join(", ")}`)

  const status = params.get("status") ?? "active"
  if (status !== "all" && !STATUSES.includes(status as any)) {
    return fail(`\`status\` must be one of: ${STATUSES.join(", ")}, all`)
  }

  const filter: Record<string, any> = {}
  if (status !== "all") filter.status = status

  const crop = params.get("crop")
  if (crop) {
    // Accept either a canonical crop key ("rice-basmati") or free text.
    const canonical = getCrop(crop)
    const re = new RegExp(escapeRegex(canonical?.en ?? crop), "i")
    filter.$or = [{ cropName: re }, { variety: re }]
  }

  const category = params.get("category")
  if (category) {
    if (!CATEGORIES.includes(category as any)) return fail(`\`category\` must be one of: ${CATEGORIES.join(", ")}`)
    filter.category = category
  }

  const district = params.get("district") ?? params.get("city")
  if (district) filter["location.district"] = new RegExp(escapeRegex(district), "i")

  const province = params.get("province") ?? params.get("state")
  if (province) filter["location.state"] = new RegExp(escapeRegex(province), "i")

  const grade = params.get("grade")
  if (grade) {
    if (!GRADES.includes(grade as any)) return fail(`\`grade\` must be one of: ${GRADES.join(", ")}`)
    filter["quality.grade"] = grade
  }

  if (params.get("organic") === "true") filter["quality.organic"] = true

  const farmer = params.get("farmer")
  if (farmer) {
    if (!/^[a-f\d]{24}$/i.test(farmer)) return fail("`farmer` must be a valid id")
    filter.farmer = farmer
  }

  const minPrice = params.get("minPrice")
  const maxPrice = params.get("maxPrice")
  if (minPrice || maxPrice) {
    filter["pricing.basePrice"] = {}
    if (minPrice) filter["pricing.basePrice"].$gte = Number(minPrice)
    if (maxPrice) filter["pricing.basePrice"].$lte = Number(maxPrice)
  }

  await connectDB()

  const [listings, total] = await Promise.all([
    (CropListing as any)
      .find(filter)
      // Buyer-facing list: the embedded orders/reviews arrays are private.
      .select("-orders -reviews")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("farmer", "name district state village")
      .lean(),
    (CropListing as any).countDocuments(filter),
  ])

  return ok({
    listings,
    currency: "PKR",
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

/**
 * POST /api/marketplace/listings
 *
 * Creates a crop listing for the signed-in farmer. Uses `.save()` so the
 * schema's expiry / sold-out pre-save hook runs.
 */
export const POST = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)
  if (!SELLER_ROLES.includes(auth.role)) {
    return fail("Only farmers and sellers can create crop listings.", 403)
  }

  const body = await readJson(req)

  const cropName = String(body.cropName ?? "").trim()
  if (!cropName) return fail("`cropName` is required")

  const variety = String(body.variety ?? "").trim()
  if (!variety) return fail("`variety` is required")

  // Derive the category from the canonical crop list when the client omits it.
  const canonical = getCrop(String(body.cropKey ?? "")) ?? resolveCrop(cropName)
  const category = String(body.category ?? canonical?.category ?? "").trim()
  if (!CATEGORIES.includes(category as any)) {
    // Only a subset of crop names auto-resolve, so say why the field is needed.
    const why = canonical ? "" : ` ("${cropName}" is not in the canonical crop list, so it cannot be inferred)`
    return fail(`\`category\` must be one of: ${CATEGORIES.join(", ")}${why}`)
  }

  const available = Number(body.quantity?.available)
  const unit = String(body.quantity?.unit ?? "")
  if (!Number.isFinite(available) || available <= 0) return fail("`quantity.available` must be a positive number")
  if (!UNITS.includes(unit as any)) return fail(`\`quantity.unit\` must be one of: ${UNITS.join(", ")}`)

  const basePrice = Number(body.pricing?.basePrice ?? body.price)
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return fail("`pricing.basePrice` must be a positive number (PKR)")
  }
  const minPrice = body.pricing?.minPrice != null ? Number(body.pricing.minPrice) : undefined
  if (minPrice != null && (!Number.isFinite(minPrice) || minPrice <= 0 || minPrice > basePrice)) {
    return fail("`pricing.minPrice` must be positive and no greater than `pricing.basePrice`")
  }

  const grade = String(body.quality?.grade ?? "")
  if (!GRADES.includes(grade as any)) return fail(`\`quality.grade\` must be one of: ${GRADES.join(", ")}`)

  const harvestDate = parseDate(body.quality?.harvestDate)
  if (!harvestDate) return fail("`quality.harvestDate` must be a valid date")

  const location = body.location ?? {}
  const farmAddress = String(location.farmAddress ?? "").trim()
  const village = String(location.village ?? auth.user?.village ?? "").trim()
  const district = String(location.district ?? auth.user?.district ?? "").trim()
  const province = String(location.state ?? location.province ?? auth.user?.state ?? "").trim()
  const pincode = String(location.pincode ?? location.postalCode ?? "").trim()

  if (!farmAddress) return fail("`location.farmAddress` is required")
  if (!village) return fail("`location.village` is required")
  if (!district) return fail("`location.district` is required")
  if (!province) return fail("`location.state` (province) is required")
  if (!POSTCODE_RE.test(pincode)) return fail("`location.pincode` must be a 5-digit Pakistani postal code")

  const availableFrom = parseDate(body.availability?.availableFrom) ?? new Date()
  const availableTill = parseDate(body.availability?.availableTill)
  if (!availableTill) return fail("`availability.availableTill` must be a valid date")
  if (availableTill <= availableFrom) return fail("`availability.availableTill` must be after `availableFrom`")

  await connectDB()

  const listing = new (CropListing as any)({
    farmer: auth.userId,
    cropName: canonical?.en ?? cropName,
    category,
    variety,
    quantity: { available, sold: 0, unit },
    pricing: {
      basePrice,
      negotiable: body.pricing?.negotiable !== false,
      minPrice,
      bulkDiscount: Array.isArray(body.pricing?.bulkDiscount) ? body.pricing.bulkDiscount : [],
    },
    quality: {
      grade,
      organic: Boolean(body.quality?.organic),
      certifications: Array.isArray(body.quality?.certifications) ? body.quality.certifications.map(String) : [],
      harvestDate,
      shelfLife: Number(body.quality?.shelfLife) || undefined,
    },
    location: {
      farmAddress,
      village,
      district,
      state: province,
      pincode,
      coordinates: location.coordinates ?? undefined,
    },
    images: Array.isArray(body.images) ? body.images : [],
    availability: {
      readyForHarvest: Boolean(body.availability?.readyForHarvest),
      availableFrom,
      availableTill,
    },
    delivery: {
      farmPickup: body.delivery?.farmPickup !== false,
      homeDelivery: Boolean(body.delivery?.homeDelivery),
      deliveryRadius: Number(body.delivery?.deliveryRadius) || 50,
      deliveryCharges: Number(body.delivery?.deliveryCharges) || 0,
    },
  })

  await listing.save()

  return ok(
    {
      message: "Crop listing created successfully",
      listing: listing.toObject(),
      currency: "PKR",
      cropKey: canonical?.key ?? null,
    },
    201,
  )
})
