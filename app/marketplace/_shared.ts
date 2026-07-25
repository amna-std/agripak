"use client"

/**
 * Shared plumbing for the six marketplace pages.
 *
 * Two things live here rather than in `lib/`, because they are only ever used
 * by `app/marketplace/**`:
 *
 *  1. The **cart**. There is no `/api/marketplace/cart` route — the backend goes
 *     straight from a product to `POST /api/marketplace/orders`. So the cart is
 *     a device-local list of product ids and quantities kept in localStorage.
 *     Prices stored alongside are for display only: the order route always
 *     re-reads the price from the database, so a tampered cart cannot discount
 *     anything.
 *
 *  2. Small formatting helpers (unit labels, category labels, status labels)
 *     that every page needs and that must all go through `t()`.
 */

import { useSyncExternalStore } from "react"
import { toast } from "sonner"

/* ------------------------------------------------------------- api shapes */

/** A row from `GET /api/marketplace/products` (the agri-input catalogue). */
export interface ApiProduct {
  _id: string
  name: string
  description?: string
  category: string
  subcategory?: string
  brand?: string
  price: { mrp: number; selling: number; discount?: number }
  stock?: { quantity: number; unit: string }
  ratings?: { average: number; count: number }
  seller?: { _id?: string; name?: string; district?: string; state?: string; role?: string } | string | null
  location?: { district?: string; state?: string; pincode?: string }
  shipping?: { freeShipping?: boolean; shippingCost?: number; deliveryDays?: number }
  specifications?: Record<string, unknown>
  images?: { url: string; caption?: string }[]
  negotiable?: boolean
  tags?: string[]
}

/** A row from `GET /api/marketplace/listings` (farmer produce). */
export interface ApiListing {
  _id: string
  cropName: string
  category: string
  variety?: string
  quantity: { available: number; sold?: number; unit: string }
  pricing: { basePrice: number; negotiable?: boolean; minPrice?: number }
  quality?: { grade?: string; organic?: boolean; harvestDate?: string; shelfLife?: number; certifications?: string[] }
  location?: { farmAddress?: string; village?: string; district?: string; state?: string; pincode?: string }
  availability?: { availableFrom?: string; availableTill?: string; readyForHarvest?: boolean }
  delivery?: { farmPickup?: boolean; homeDelivery?: boolean; deliveryRadius?: number; deliveryCharges?: number }
  farmer?: { _id?: string; name?: string; village?: string; district?: string; state?: string } | string | null
  status?: string
  images?: { url: string; caption?: string }[]
}

/** `seller` / `farmer` come back populated or as a bare id, depending on the query. */
export function personName(value: ApiProduct["seller"] | ApiListing["farmer"]): string {
  return value && typeof value === "object" ? String(value.name ?? "") : ""
}

export function personPlace(value: ApiProduct["seller"] | ApiListing["farmer"]): string {
  if (!value || typeof value !== "object") return ""
  return [value.district, value.state].filter(Boolean).join(", ")
}

/* -------------------------------------------------------------------- cart */

export interface CartLine {
  productId: string
  name: string
  brand?: string
  /** PKR per unit, captured when the item was added. Display only. */
  price: number
  /** The product's stock unit ("bags", "bottles", …) as the API reports it. */
  unit: string
  quantity: number
  /** Stock on hand when the item was added; the stepper never goes past it. */
  maxQuantity: number
  sellerName?: string
  freeShipping: boolean
  /** Flat PKR delivery charge for this product, per the product record. */
  shippingCost: number
}

const CART_KEY = "agripak.cart"
/** Fired on the window so every mounted page re-reads the cart immediately. */
const CART_EVENT = "agripak:cart-changed"

/** Stable identity for the empty cart — `useSyncExternalStore` compares by reference. */
const EMPTY: CartLine[] = []

let cachedRaw: string | null = null
let cachedLines: CartLine[] = EMPTY

function sanitize(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return EMPTY
  const lines: CartLine[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const line = raw as Partial<CartLine>
    const productId = String(line.productId ?? "")
    const quantity = Number(line.quantity)
    if (!/^[a-f\d]{24}$/i.test(productId)) continue
    if (!Number.isInteger(quantity) || quantity < 1) continue
    lines.push({
      productId,
      name: String(line.name ?? ""),
      brand: line.brand ? String(line.brand) : undefined,
      price: Number(line.price) || 0,
      unit: String(line.unit ?? ""),
      quantity,
      maxQuantity: Number(line.maxQuantity) || quantity,
      sellerName: line.sellerName ? String(line.sellerName) : undefined,
      freeShipping: Boolean(line.freeShipping),
      shippingCost: Number(line.shippingCost) || 0,
    })
  }
  return lines
}

function readCart(): CartLine[] {
  if (typeof window === "undefined") return EMPTY

  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(CART_KEY)
  } catch {
    return EMPTY
  }

  // Re-parsing on every render would hand React a new array each time and spin
  // useSyncExternalStore forever, so the parsed value is memoised on the raw text.
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      cachedLines = raw ? sanitize(JSON.parse(raw)) : EMPTY
    } catch {
      cachedLines = EMPTY
    }
  }
  return cachedLines
}

function writeCart(lines: CartLine[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(lines))
  } catch {
    /* private mode — the cart just will not survive a reload */
  }
  window.dispatchEvent(new Event(CART_EVENT))
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CART_EVENT, onChange)
  // `storage` only fires in *other* tabs, which is exactly what we want it for.
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(CART_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

/** Adds `quantity` of a product, clamped to the stock we knew about. */
export function addToCart(item: Omit<CartLine, "quantity">, quantity = 1): void {
  const lines = readCart().slice()
  const index = lines.findIndex((l) => l.productId === item.productId)
  const cap = Math.max(item.maxQuantity, 1)

  if (index >= 0) {
    lines[index] = { ...lines[index], ...item, quantity: Math.min(lines[index].quantity + quantity, cap) }
  } else {
    lines.push({ ...item, quantity: Math.min(Math.max(quantity, 1), cap) })
  }
  writeCart(lines)
}

export function setCartQuantity(productId: string, quantity: number): void {
  const lines = readCart()
  if (quantity < 1) return removeFromCart(productId)
  writeCart(
    lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(quantity, Math.max(l.maxQuantity, 1)) } : l)),
  )
}

export function removeFromCart(productId: string): void {
  writeCart(readCart().filter((l) => l.productId !== productId))
}

export function clearCart(): void {
  writeCart([])
}

export interface CartTotals {
  lines: CartLine[]
  /** Total number of units across every line. */
  count: number
  subtotal: number
  /** Sum of each product's flat delivery charge, matching the order route's maths. */
  delivery: number
  total: number
}

/** Live view of the cart. Safe during SSR (renders as empty, then hydrates). */
export function useCart(): CartTotals {
  const lines = useSyncExternalStore(subscribe, readCart, () => EMPTY)

  let count = 0
  let subtotal = 0
  let delivery = 0
  for (const line of lines) {
    count += line.quantity
    subtotal += line.price * line.quantity
    // The order route charges shipping once per product, not per unit.
    delivery += line.freeShipping ? 0 : line.shippingCost
  }

  return { lines, count, subtotal, delivery, total: subtotal + delivery }
}

/**
 * The "added to cart" confirmation, with a way onward.
 *
 * A bare "Added to your cart" is a dead end — the farmer is told something
 * happened and given nothing to tap. Every add site uses this instead, so the
 * toast always carries a link straight to the cart. `onView` is supplied by the
 * caller because only a component can hold the router.
 */
export function toastAddedToCart(t: Translate, onView: () => void): void {
  toast.success(t("marketplace.addedToCart"), {
    action: {
      label: t("marketplace.cart"),
      onClick: onView,
    },
    classNames: { actionButton: "min-h-tap shrink-0 px-3 font-semibold" },
  })
}

/* ------------------------------------------------------------------ labels */

type Translate = (key: string, vars?: Record<string, string | number>) => string

/**
 * Product stock units and crop-listing units, mapped onto the `units.*` group.
 * Anything unmapped falls through to the raw API string rather than an empty gap.
 */
const UNIT_KEYS: Record<string, string> = {
  kg: "units.kg",
  gm: "units.gram",
  g: "units.gram",
  ltr: "units.litre",
  litre: "units.litre",
  ml: "units.millilitre",
  pieces: "units.piece",
  piece: "units.piece",
  packets: "units.packet",
  packet: "units.packet",
  bags: "units.bag",
  bag: "units.bag",
  bottles: "units.bottle",
  bottle: "units.bottle",
  kits: "units.kit",
  kit: "units.kit",
  maund: "units.maund",
  quintal: "units.quintal",
  ton: "units.ton",
  dozen: "units.dozen",
}

export function unitLabel(t: Translate, unit: string | undefined | null): string {
  if (!unit) return ""
  const key = UNIT_KEYS[unit.toLowerCase()]
  return key ? t(key) : unit
}

/** `category` values of the Product model. */
export const PRODUCT_CATEGORIES = [
  "seeds",
  "fertilizers",
  "pesticides",
  "tools",
  "equipment",
  "organic",
  "irrigation",
] as const

const PRODUCT_CATEGORY_KEYS: Record<string, string> = {
  seeds: "marketplace.seeds",
  fertilizers: "marketplace.fertilizers",
  pesticides: "marketplace.pesticides",
  tools: "marketplace.tools",
  equipment: "marketplace.equipment",
  organic: "marketplace.organicInputs",
  irrigation: "marketplace.irrigation",
}

export function productCategoryLabel(t: Translate, category: string | undefined | null): string {
  if (!category) return ""
  const key = PRODUCT_CATEGORY_KEYS[category]
  return key ? t(key) : category
}

/** `category` values of the CropListing model. */
export const LISTING_CATEGORIES = ["vegetables", "fruits", "grains", "pulses", "spices", "cash_crops"] as const

const LISTING_CATEGORY_KEYS: Record<string, string> = {
  vegetables: "marketplace.vegetables",
  fruits: "marketplace.fruits",
  grains: "marketplace.grains",
  pulses: "marketplace.pulses",
  spices: "marketplace.spices",
  cash_crops: "marketplace.cashCrops",
}

export function listingCategoryLabel(t: Translate, category: string | undefined | null): string {
  if (!category) return ""
  const key = LISTING_CATEGORY_KEYS[category]
  return key ? t(key) : category
}

const ORDER_STATUS_KEYS: Record<string, string> = {
  pending: "marketplace.statusPending",
  confirmed: "marketplace.statusConfirmed",
  processing: "marketplace.statusProcessing",
  shipped: "marketplace.statusShipped",
  delivered: "marketplace.statusDelivered",
  cancelled: "marketplace.statusCancelled",
}

export function orderStatusLabel(t: Translate, status: string | undefined | null): string {
  if (!status) return ""
  const key = ORDER_STATUS_KEYS[status]
  return key ? t(key) : status
}

/** Tailwind classes for an order-status pill, using semantic tokens only. */
export function orderStatusClasses(status: string | undefined | null): string {
  switch (status) {
    case "delivered":
      return "bg-success text-success-foreground"
    case "cancelled":
      return "bg-destructive text-destructive-foreground"
    case "shipped":
    case "processing":
      return "bg-info text-info-foreground"
    case "confirmed":
      return "bg-primary text-primary-foreground"
    default:
      return "bg-warning text-warning-foreground"
  }
}

/* ------------------------------------------------------------------- misc */

/** Pakistani mobile number, `03XXXXXXXXX`. Mirrors the order route's check. */
export const MOBILE_RE = /^03\d{9}$/
/** Pakistani postal codes are 5 digits. */
export const POSTCODE_RE = /^\d{5}$/

/** Formats an ISO date with the active locale, or `""` when it is missing/invalid. */
export function formatDate(value: unknown, locale: string): string {
  if (!value) return ""
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
}

/** `YYYY-MM-DD` for `<input type="date">`. */
export function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10)
}
