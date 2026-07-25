import { connectDB } from "@/lib/db"
import { fail, handler, ok, readJson, searchParams } from "@/lib/api-helpers"
import { authenticate } from "@/lib/auth-helpers"
import Order from "@/lib/models/Order"
import Product from "@/lib/models/Product"

export const dynamic = "force-dynamic"

/**
 * Marketplace orders. Money is PKR throughout.
 *
 * Item prices are always taken from the database, never from the request body —
 * a client-supplied price is a discount coupon for anyone with curl.
 */

/** `upi` exists in the legacy schema enum but is a foreign rail; not offered here. */
const PAYMENT_METHODS = ["cod", "online"] as const
const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"] as const

/** Pakistani mobile numbers: 03XXXXXXXXX. */
const MOBILE_RE = /^03\d{9}$/
const POSTCODE_RE = /^\d{5}$/
const OBJECT_ID_RE = /^[a-f\d]{24}$/i

function newOrderId(): string {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.floor(Math.random() * 46_656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0")
  return `AP${stamp}${rand}`
}

/**
 * GET /api/marketplace/orders
 *
 * Orders placed by the signed-in user, or — with `?as=seller` — orders
 * containing that user's products.
 *
 * Query: as (buyer|seller), status, page, limit
 */
export const GET = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const params = searchParams(req)
  const as = params.get("as") ?? "buyer"
  if (as !== "buyer" && as !== "seller") return fail("`as` must be either buyer or seller")

  const page = Math.max(Number.parseInt(params.get("page") ?? "1", 10) || 1, 1)
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "20", 10) || 20, 1), 100)

  const filter: Record<string, any> =
    as === "seller" ? { "items.seller": auth.userId } : { buyer: auth.userId }

  const status = params.get("status")
  if (status) {
    if (!ORDER_STATUSES.includes(status as any)) {
      return fail(`\`status\` must be one of: ${ORDER_STATUSES.join(", ")}`)
    }
    filter.status = status
  }

  await connectDB()

  const [orders, total] = await Promise.all([
    (Order as any)
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("items.product", "name images price.selling seoUrl")
      .populate("items.seller", "name district state")
      .lean(),
    (Order as any).countDocuments(filter),
  ])

  return ok({
    orders,
    role: as,
    currency: "PKR",
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

/**
 * POST /api/marketplace/orders
 *
 * Places an order for one or more products.
 *
 * Stock is reserved with a conditional `$inc` per product, so two concurrent
 * buyers can never oversell the same item. If a later item fails, the already
 * reserved ones are released — a poor man's transaction that works on any
 * Atlas tier without requiring a session.
 */
export const POST = handler(async (req: Request) => {
  const auth = await authenticate(req)
  if (!auth.ok) return fail(auth.message, auth.status)

  const body = await readJson(req)

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (!rawItems.length) return fail("`items` must contain at least one product")
  if (rawItems.length > 50) return fail("`items` may contain at most 50 products")

  // Collapse duplicate product ids so stock is reserved once per product.
  const wanted = new Map<string, number>()
  for (const item of rawItems) {
    const id = String(item?.product ?? item?.productId ?? "")
    if (!OBJECT_ID_RE.test(id)) return fail(`\`items.product\` must be a valid product id (got "${id}")`)
    const quantity = Number(item?.quantity ?? 1)
    if (!Number.isInteger(quantity) || quantity < 1) return fail("`items.quantity` must be a positive whole number")
    wanted.set(id, (wanted.get(id) ?? 0) + quantity)
  }

  const method = String(body.payment?.method ?? body.paymentMethod ?? "cod")
  if (!PAYMENT_METHODS.includes(method as any)) {
    return fail(`\`payment.method\` must be one of: ${PAYMENT_METHODS.join(", ")}`)
  }

  const address = body.shippingAddress ?? {}
  const shippingAddress = {
    name: String(address.name ?? auth.user?.name ?? "").trim(),
    mobile: String(address.mobile ?? auth.user?.mobile ?? "").trim(),
    address: String(address.address ?? "").trim(),
    village: String(address.village ?? auth.user?.village ?? "").trim(),
    district: String(address.district ?? auth.user?.district ?? "").trim(),
    state: String(address.state ?? address.province ?? auth.user?.state ?? "").trim(),
    pincode: String(address.pincode ?? address.postalCode ?? "").trim(),
  }

  if (!shippingAddress.name) return fail("`shippingAddress.name` is required")
  if (!MOBILE_RE.test(shippingAddress.mobile)) {
    return fail("`shippingAddress.mobile` must be a Pakistani mobile number in the format 03XXXXXXXXX")
  }
  if (!shippingAddress.address) return fail("`shippingAddress.address` is required")
  if (!shippingAddress.district) return fail("`shippingAddress.district` is required")
  if (!shippingAddress.state) return fail("`shippingAddress.state` (province) is required")
  if (shippingAddress.pincode && !POSTCODE_RE.test(shippingAddress.pincode)) {
    return fail("`shippingAddress.pincode` must be a 5-digit Pakistani postal code")
  }

  await connectDB()

  const ids = Array.from(wanted.keys())
  const products: any[] = await (Product as any)
    .find({ _id: { $in: ids }, isActive: true })
    .select("name price.selling stock seller shipping")
    .lean()

  if (products.length !== ids.length) {
    const found = new Set(products.map((p) => String(p._id)))
    return fail(`Product not available: ${ids.filter((id) => !found.has(id)).join(", ")}`, 404)
  }

  const byId = new Map(products.map((p) => [String(p._id), p]))

  // Pre-flight check for a clean error message before touching any stock.
  for (const [id, quantity] of wanted) {
    const product = byId.get(id)!
    if ((product.stock?.quantity ?? 0) < quantity) {
      return fail(
        `Only ${product.stock?.quantity ?? 0} ${product.stock?.unit ?? "units"} of "${product.name}" left in stock`,
        409,
      )
    }
  }

  const reserved: Array<{ id: string; quantity: number }> = []

  async function release() {
    await Promise.all(
      reserved.map((r) =>
        (Product as any).updateOne({ _id: r.id }, { $inc: { "stock.quantity": r.quantity, sales: -r.quantity } }),
      ),
    )
  }

  try {
    for (const [id, quantity] of wanted) {
      const res = await (Product as any).updateOne(
        { _id: id, isActive: true, "stock.quantity": { $gte: quantity } },
        { $inc: { "stock.quantity": -quantity, sales: quantity } },
      )
      if (!res.modifiedCount) {
        await release()
        return fail(`"${byId.get(id)!.name}" went out of stock while you were checking out`, 409)
      }
      reserved.push({ id, quantity })
    }

    const items = Array.from(wanted, ([id, quantity]) => {
      const product = byId.get(id)!
      return { product: id, seller: product.seller, quantity, price: product.price.selling, status: "pending" }
    })

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
    const shipping = Array.from(wanted.keys()).reduce((sum, id) => {
      const s = byId.get(id)!.shipping ?? {}
      return sum + (s.freeShipping ? 0 : Number(s.shippingCost) || 0)
    }, 0)
    const total = subtotal + shipping

    const order = new (Order as any)({
      // Set explicitly rather than relying on the schema's pre-save hook, so the
      // required+unique `orderId` is present no matter the hook ordering.
      orderId: newOrderId(),
      buyer: auth.userId,
      items,
      shippingAddress,
      payment: { method, status: "pending", amount: total },
      pricing: { subtotal, shipping, discount: 0, total },
      status: "pending",
      notes: body.notes ? String(body.notes).slice(0, 1000) : undefined,
    })

    await order.save()

    return ok(
      {
        message: "Order placed successfully",
        order: order.toObject(),
        currency: "PKR",
      },
      201,
    )
  } catch (error) {
    await release()
    throw error
  }
})
