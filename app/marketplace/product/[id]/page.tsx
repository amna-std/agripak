"use client"

/**
 * One marketplace item — either an agri-input product or a farmer's crop listing.
 * The same route serves both because both catalogues are addressed by Mongo id.
 *
 * LOOKUP: the API has no `GET /api/marketplace/products/:id`, only the paged
 * collection endpoints. So the id is resolved by walking `GET .../products` and
 * then `GET .../listings` a page at a time until it is found (a handful of
 * requests at worst, one in practice). When neither catalogue has it, the page
 * says so honestly instead of rendering an empty template.
 *
 * PRODUCE: there is no order route for crop listings — `POST /orders` only takes
 * `Product` ids. So a listing shows the farm's details and says plainly that the
 * deal is settled directly with the farmer. No fake "buy" button.
 *
 * Chrome (header / nav) belongs to components/AppShell.tsx.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  Info,
  Leaf,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw,
  ShoppingCart,
  Star,
  Tag,
  Truck,
  User,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { marketplaceApi } from "@/lib/api"
import { useLanguage } from "@/lib/contexts"

import {
  addToCart,
  formatDate,
  listingCategoryLabel,
  personName,
  personPlace,
  productCategoryLabel,
  toastAddedToCart,
  unitLabel,
  type ApiListing,
  type ApiProduct,
} from "../../_shared"

/** Page size for the id sweep. 100 is the API's maximum. */
const SWEEP_LIMIT = 100
/** Hard stop so a large catalogue can never turn one page view into 50 requests. */
const SWEEP_MAX_PAGES = 5

type Found =
  | { kind: "product"; product: ApiProduct }
  | { kind: "listing"; listing: ApiListing }
  | { kind: "missing" }

export default function MarketplaceItemPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : ""

  const { t, currentLanguage, locale, formatCurrency, formatNumber } = useLanguage()

  const scriptClass =
    currentLanguage === "ur" || currentLanguage === "pa"
      ? "font-nastaliq"
      : currentLanguage === "sd" || currentLanguage === "ps"
        ? "font-naskh"
        : ""

  const [found, setFound] = useState<Found | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  const tRef = useRef(t)
  tRef.current = t

  const requestId = useRef(0)

  const load = useCallback(async () => {
    const requestNumber = ++requestId.current
    setLoading(true)
    setError(null)

    if (!/^[a-f\d]{24}$/i.test(id)) {
      setFound({ kind: "missing" })
      setLoading(false)
      return
    }

    try {
      for (let page = 1; page <= SWEEP_MAX_PAGES; page += 1) {
        const res = await marketplaceApi.getProducts({ page, limit: SWEEP_LIMIT })
        if (requestNumber !== requestId.current) return
        if (!res.success) {
          setError(res.message || tRef.current("marketplace.loadFailed"))
          setLoading(false)
          return
        }
        const rows = (res.products ?? []) as ApiProduct[]
        const hit = rows.find((row) => row._id === id)
        if (hit) {
          setFound({ kind: "product", product: hit })
          setQuantity(1)
          setLoading(false)
          return
        }
        if (page >= Number(res.pagination?.pages ?? 1)) break
      }

      for (let page = 1; page <= SWEEP_MAX_PAGES; page += 1) {
        const res = await marketplaceApi.getListings({ page, limit: SWEEP_LIMIT, status: "all" })
        if (requestNumber !== requestId.current) return
        if (!res.success) {
          setError(res.message || tRef.current("marketplace.loadFailed"))
          setLoading(false)
          return
        }
        const rows = (res.listings ?? []) as ApiListing[]
        const hit = rows.find((row) => row._id === id)
        if (hit) {
          setFound({ kind: "listing", listing: hit })
          setLoading(false)
          return
        }
        if (page >= Number(res.pagination?.pages ?? 1)) break
      }

      setFound({ kind: "missing" })
    } catch {
      if (requestNumber !== requestId.current) return
      setError(tRef.current("validation.networkError"))
    } finally {
      if (requestNumber === requestId.current) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  /* -- render ------------------------------------------------------------ */

  return (
    <div className="container-app space-y-4 py-4 md:max-w-3xl md:py-6">
      <Button asChild variant="ghost" size="sm" className="min-h-tap -ms-2 gap-1.5">
        <Link href="/marketplace">
          <ArrowLeft className="size-4 flip-rtl" aria-hidden="true" />
          <span className={scriptClass}>{t("marketplace.backToMarketplace")}</span>
        </Link>
      </Button>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <p className={`font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.loadFailed")}</p>
                <p className="text-body-sm leading-[1.7] text-muted-foreground">{error}</p>
              </div>
            </div>
            <Button className="min-h-tap" onClick={load}>
              <RefreshCw className="me-2 size-4" aria-hidden="true" />
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : found?.kind === "product" ? (
        <ProductView
          product={found.product}
          quantity={quantity}
          setQuantity={setQuantity}
          scriptClass={scriptClass}
          t={t}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
        />
      ) : found?.kind === "listing" ? (
        <ListingView
          listing={found.listing}
          scriptClass={scriptClass}
          locale={locale}
          t={t}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <Package className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className={`font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.notFound")}</p>
            <Button asChild className="min-h-tap">
              <Link href="/marketplace">{t("marketplace.backToMarketplace")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ shared bits */

type Translate = (key: string, vars?: Record<string, string | number>) => string

function DetailRow({
  label,
  value,
  scriptClass,
  ltr,
}: {
  label: string
  value: string
  scriptClass: string
  ltr?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <dt className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>{label}</dt>
      <dd className={`text-body-sm font-medium leading-[1.7] ${ltr ? "force-ltr" : ""}`}>{value}</dd>
    </div>
  )
}

/* ------------------------------------------------------------ product view */

function ProductView({
  product,
  quantity,
  setQuantity,
  scriptClass,
  t,
  formatCurrency,
  formatNumber,
}: {
  product: ApiProduct
  quantity: number
  setQuantity: (next: number) => void
  scriptClass: string
  t: Translate
  formatCurrency: (amount: number) => string
  formatNumber: (value: number | string) => string
}) {
  const router = useRouter()
  const stock = product.stock?.quantity ?? 0
  const inStock = stock > 0
  const unit = unitLabel(t, product.stock?.unit)
  const discount = product.price?.discount ?? 0
  const sellerName = personName(product.seller)
  const sellerPlace =
    personPlace(product.seller) || [product.location?.district, product.location?.state].filter(Boolean).join(", ")
  const ratingCount = product.ratings?.count ?? 0

  const specs = useMemo(() => {
    const raw = product.specifications
    if (!raw || typeof raw !== "object") return [] as Array<[string, string]>
    return Object.entries(raw)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)] as [string, string])
  }, [product.specifications])

  return (
    <>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="leading-[1.7]">
            {productCategoryLabel(t, product.category)}
          </Badge>
          {product.subcategory ? (
            <Badge variant="outline" className="leading-[1.7]">
              {product.subcategory}
            </Badge>
          ) : null}
          {discount > 0 ? (
            <Badge className="bg-gold text-gold-foreground leading-[1.7]">
              {t("marketplace.discountOff", { percent: discount })}
            </Badge>
          ) : null}
          {inStock ? (
            <Badge className="bg-success text-success-foreground leading-[1.7]">{t("marketplace.inStock")}</Badge>
          ) : (
            <Badge variant="destructive" className="leading-[1.7]">
              {t("marketplace.outOfStock")}
            </Badge>
          )}
        </div>

        <h1 className="text-2xl font-bold leading-[1.4] tracking-tight md:text-3xl">{product.name}</h1>

        {product.brand ? (
          <p className={`flex items-center gap-1.5 text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
            <Tag className="size-4 shrink-0" aria-hidden="true" />
            {t("marketplace.brand")}: <span className="font-medium text-foreground">{product.brand}</span>
          </p>
        ) : null}

        {ratingCount > 0 ? (
          <p className="flex items-center gap-1.5 text-body-sm leading-[1.7] text-muted-foreground">
            <Star className="size-4 shrink-0 fill-gold text-gold" aria-hidden="true" />
            <span className="force-ltr font-semibold text-foreground">
              {(product.ratings?.average ?? 0).toFixed(1)}
            </span>
            <span className={scriptClass}>{t("marketplace.ratingsCount", { count: formatNumber(ratingCount) })}</span>
          </p>
        ) : null}
      </header>

      {/* -- price + buy ---------------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="force-ltr text-3xl font-bold leading-none text-primary">
              {formatCurrency(product.price.selling)}
            </span>
            {product.price.mrp > product.price.selling ? (
              <span className="force-ltr text-body-sm text-muted-foreground line-through">
                {formatCurrency(product.price.mrp)}
              </span>
            ) : null}
            {unit ? <span className="text-body-sm text-muted-foreground">/ {unit}</span> : null}
          </div>

          {inStock ? (
            <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
              {t("marketplace.stockLeft", { count: formatNumber(stock), unit })}
            </p>
          ) : null}

          {product.negotiable ? (
            <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
              {t("marketplace.negotiable")}
            </p>
          ) : null}

          {inStock ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-body-sm font-semibold leading-[1.7] ${scriptClass}`}>
                  {t("marketplace.quantity")}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    aria-label={t("marketplace.decreaseQuantity")}
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </Button>
                  <span className="force-ltr min-w-11 text-center text-base font-semibold tabular-nums">
                    {formatNumber(quantity)}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11"
                    disabled={quantity >= stock}
                    onClick={() => setQuantity(Math.min(stock, quantity + 1))}
                    aria-label={t("marketplace.increaseQuantity")}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
                <Button
                  className="min-h-tap w-full gap-2"
                  onClick={() => {
                    addToCart(
                      {
                        productId: product._id,
                        name: product.name,
                        brand: product.brand,
                        price: product.price.selling,
                        unit: product.stock?.unit ?? "",
                        maxQuantity: stock,
                        sellerName,
                        freeShipping: Boolean(product.shipping?.freeShipping),
                        shippingCost: Number(product.shipping?.shippingCost) || 0,
                      },
                      quantity,
                    )
                    toastAddedToCart(t, () => router.push("/marketplace/cart"))
                  }}
                >
                  <ShoppingCart className="size-4" aria-hidden="true" />
                  <span className={`truncate ${scriptClass}`}>{t("marketplace.addToCart")}</span>
                </Button>
                <Button asChild variant="outline" className="min-h-tap w-full">
                  <Link href="/marketplace/cart">
                    <span className={`truncate ${scriptClass}`}>{t("marketplace.cart")}</span>
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <Button className="min-h-tap w-full" disabled>
              <span className={scriptClass}>{t("marketplace.outOfStockCta")}</span>
            </Button>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body-sm leading-[1.7] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Truck className="size-4 shrink-0" aria-hidden="true" />
              <span className={scriptClass}>
                {product.shipping?.freeShipping
                  ? t("marketplace.freeDelivery")
                  : `${t("marketplace.deliveryCharges")}: ${formatCurrency(Number(product.shipping?.shippingCost) || 0)}`}
              </span>
            </span>
            {product.shipping?.deliveryDays ? (
              <span className={scriptClass}>
                {t("marketplace.deliveryInDays", { days: product.shipping.deliveryDays })}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Banknote className="size-4 shrink-0" aria-hidden="true" />
              <span className={scriptClass}>{t("marketplace.cashOnDelivery")}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* -- description ---------------------------------------------------- */}
      {product.description ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className={`text-lg font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.description")}</h2>
            <p className="whitespace-pre-line text-body-sm leading-[1.8] text-muted-foreground">
              {product.description}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* -- specifications ------------------------------------------------- */}
      {specs.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className={`text-lg font-semibold leading-[1.7] ${scriptClass}`}>
              {t("marketplace.specifications")}
            </h2>
            <dl className="divide-y divide-border">
              {specs.map(([key, value]) => (
                <DetailRow key={key} label={key} value={value} scriptClass={scriptClass} />
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {/* -- seller --------------------------------------------------------- */}
      {sellerName || sellerPlace ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className={`text-lg font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.soldBy")}</h2>
            {sellerName ? (
              <p className="flex items-center gap-2 text-body-sm font-medium leading-[1.7]">
                <User className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {sellerName}
              </p>
            ) : null}
            {sellerPlace ? (
              <p className="flex items-center gap-2 text-body-sm leading-[1.7] text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                {sellerPlace}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------ listing view */

function ListingView({
  listing,
  scriptClass,
  locale,
  t,
  formatCurrency,
  formatNumber,
}: {
  listing: ApiListing
  scriptClass: string
  locale: string
  t: Translate
  formatCurrency: (amount: number) => string
  formatNumber: (value: number | string) => string
}) {
  const unit = unitLabel(t, listing.quantity?.unit)
  const farmerName = personName(listing.farmer)
  const place = [listing.location?.village, listing.location?.district, listing.location?.state]
    .filter(Boolean)
    .join(", ")
  const harvest = formatDate(listing.quality?.harvestDate, locale)
  const from = formatDate(listing.availability?.availableFrom, locale)
  const till = formatDate(listing.availability?.availableTill, locale)

  return (
    <>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="leading-[1.7]">
            {listingCategoryLabel(t, listing.category)}
          </Badge>
          {listing.quality?.grade ? (
            <Badge variant="outline" className="leading-[1.7]">
              {t("marketplace.gradeValue", { grade: listing.quality.grade })}
            </Badge>
          ) : null}
          {listing.quality?.organic ? (
            <Badge className="bg-success text-success-foreground leading-[1.7]">{t("marketplace.organic")}</Badge>
          ) : null}
        </div>

        <h1 className="text-2xl font-bold leading-[1.4] tracking-tight md:text-3xl">{listing.cropName}</h1>
        {listing.variety ? (
          <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
            {t("marketplace.variety")}: <span className="font-medium text-foreground">{listing.variety}</span>
          </p>
        ) : null}
      </header>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="force-ltr text-3xl font-bold leading-none text-primary">
              {formatCurrency(listing.pricing.basePrice)}
            </span>
            {unit ? <span className="text-body-sm text-muted-foreground">/ {unit}</span> : null}
          </div>

          <dl className="divide-y divide-border">
            <DetailRow
              label={t("marketplace.quantityAvailable")}
              value={`${formatNumber(listing.quantity?.available ?? 0)} ${unit}`}
              scriptClass={scriptClass}
              ltr
            />
            {listing.pricing?.negotiable ? (
              <DetailRow label={t("marketplace.negotiable")} value={t("common.yes")} scriptClass={scriptClass} />
            ) : null}
            {listing.pricing?.minPrice ? (
              <DetailRow
                label={t("marketplace.minPrice")}
                value={formatCurrency(listing.pricing.minPrice)}
                scriptClass={scriptClass}
                ltr
              />
            ) : null}
            {harvest ? (
              <DetailRow label={t("marketplace.harvestDate")} value={harvest} scriptClass={scriptClass} ltr />
            ) : null}
            {from && till ? (
              <DetailRow
                label={t("marketplace.availableWindow")}
                value={`${from} – ${till}`}
                scriptClass={scriptClass}
                ltr
              />
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {/* Ordering produce online is not built — say so rather than fake a button. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-gold/50 bg-gold-surface p-3">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
        <p className={`text-body-sm leading-[1.7] text-foreground ${scriptClass}`}>
          {t("marketplace.produceOrderingUnavailable")}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4">
          <h2 className={`text-lg font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.listedBy")}</h2>
          {farmerName ? (
            <p className="flex items-center gap-2 text-body-sm font-medium leading-[1.7]">
              <User className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {farmerName}
            </p>
          ) : null}
          {listing.location?.farmAddress ? (
            <p className={`flex items-start gap-2 text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {listing.location.farmAddress}
            </p>
          ) : null}
          {place ? (
            <p className="flex items-center gap-2 text-body-sm leading-[1.7] text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {place}
              {listing.location?.pincode ? <span className="force-ltr">· {listing.location.pincode}</span> : null}
            </p>
          ) : null}

          {listing.delivery ? (
            <>
              <Separator className="my-2" />
              <h3 className={`text-body-sm font-semibold leading-[1.7] ${scriptClass}`}>
                {t("marketplace.deliveryOptions")}
              </h3>
              <ul className="space-y-1 text-body-sm leading-[1.7] text-muted-foreground">
                {listing.delivery.farmPickup ? (
                  <li className={`flex items-center gap-2 ${scriptClass}`}>
                    <Leaf className="size-4 shrink-0" aria-hidden="true" />
                    {t("marketplace.farmPickup")}
                  </li>
                ) : null}
                {listing.delivery.homeDelivery ? (
                  <li className={`flex items-center gap-2 ${scriptClass}`}>
                    <Truck className="size-4 shrink-0" aria-hidden="true" />
                    {t("marketplace.homeDelivery")}
                    {listing.delivery.deliveryCharges ? (
                      <span className="force-ltr">· {formatCurrency(listing.delivery.deliveryCharges)}</span>
                    ) : null}
                  </li>
                ) : null}
              </ul>
            </>
          ) : null}
        </CardContent>
      </Card>

      {listing.availability?.availableTill ? (
        <p className={`flex items-center gap-1.5 text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
          <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
          {t("marketplace.availableTill")}: <span className="force-ltr">{till}</span>
        </p>
      ) : null}
    </>
  )
}
