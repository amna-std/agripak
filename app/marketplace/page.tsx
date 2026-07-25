"use client"

/**
 * Marketplace — two real catalogues, no invented rows.
 *
 *   "Farm inputs"  -> GET /api/marketplace/products  (seeds, fertiliser, tools…)
 *   "Farm produce" -> GET /api/marketplace/listings  (crops farmers are selling)
 *
 * Both are server-filtered: the search box, category, province and sort all go
 * to the API as query parameters, so the counts shown are the API's own counts.
 * When a call fails we show its message and a retry — never placeholder cards.
 *
 * Money is PKR via `formatCurrency`. Cart state is device-local (see _shared.ts);
 * there is no cart endpoint, orders go straight to POST /api/marketplace/orders.
 *
 * Chrome (header / nav / bottom bar) belongs to components/AppShell.tsx.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  Leaf,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Sprout,
  Star,
  Store,
  Tag,
  Truck,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { marketplaceApi } from "@/lib/api"
import { useLanguage } from "@/lib/contexts"
import { PROVINCES, PROVINCE_URDU, type Province } from "@/lib/data/pakistan-locations"

import {
  LISTING_CATEGORIES,
  PRODUCT_CATEGORIES,
  addToCart,
  listingCategoryLabel,
  personName,
  personPlace,
  productCategoryLabel,
  toastAddedToCart,
  unitLabel,
  useCart,
  type ApiListing,
  type ApiProduct,
} from "./_shared"

/** Sentinel for the "no filter" option — Radix Select rejects an empty value. */
const ALL = "__all__"
const PAGE_SIZE = 24

type Tab = "inputs" | "produce"

/** What both catalogue endpoints have in common, as this page reads them. */
interface CatalogueResponse {
  success: boolean
  message?: string
  products?: unknown[]
  listings?: unknown[]
  pagination?: Record<string, number>
}

/** Sort keys both endpoints accept. Listings also support quantity/harvest. */
const SORTS = [
  { value: "newest", labelKey: "marketplace.sortNewest" },
  { value: "price_asc", labelKey: "marketplace.sortPriceLow" },
  { value: "price_desc", labelKey: "marketplace.sortPriceHigh" },
] as const

export default function MarketplacePage() {
  const { t, currentLanguage, formatCurrency, formatNumber } = useLanguage()
  const cart = useCart()

  const isEnglish = currentLanguage === "en"
  const scriptClass =
    currentLanguage === "ur" || currentLanguage === "pa"
      ? "font-nastaliq"
      : currentLanguage === "sd" || currentLanguage === "ps"
        ? "font-naskh"
        : ""

  const [tab, setTab] = useState<Tab>("inputs")

  /* -- filters ----------------------------------------------------------- */

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string>(ALL)
  const [province, setProvince] = useState<string>("")
  const [sortBy, setSortBy] = useState<string>("newest")

  /** Debounced copy of `search` — one request per pause, not per keystroke. */
  const [query, setQuery] = useState("")
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(search.trim()), 350)
    return () => window.clearTimeout(id)
  }, [search])

  /* -- data -------------------------------------------------------------- */

  const [products, setProducts] = useState<ApiProduct[]>([])
  const [listings, setListings] = useState<ApiListing[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `t` gets a new identity on every language-context update, so it is read
  // through a ref instead of being a dependency of `load` (see the market page).
  const tRef = useRef(t)
  tRef.current = t

  const requestId = useRef(0)

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      const id = ++requestId.current
      if (mode === "refresh") setRefreshing(true)
      else setLoading(true)
      setError(null)

      try {
        // The two helpers return differently-shaped payloads; widen to the union
        // both tabs read from rather than branching the whole request block.
        const res: CatalogueResponse =
          tab === "inputs"
            ? await marketplaceApi.getProducts({
                q: query || undefined,
                category: category === ALL ? undefined : category,
                province: province || undefined,
                sortBy,
                limit: PAGE_SIZE,
              })
            : await marketplaceApi.getListings({
                crop: query || undefined,
                category: category === ALL ? undefined : category,
                province: province || undefined,
                sortBy,
                limit: PAGE_SIZE,
              })

        if (id !== requestId.current) return

        if (!res.success) {
          setError(res.message || tRef.current("marketplace.loadFailed"))
          setProducts([])
          setListings([])
          setTotal(0)
          return
        }

        if (tab === "inputs") {
          setProducts((res.products ?? []) as ApiProduct[])
          setListings([])
        } else {
          setListings((res.listings ?? []) as ApiListing[])
          setProducts([])
        }
        setTotal(Number(res.pagination?.total ?? 0))
      } catch {
        if (id !== requestId.current) return
        setError(tRef.current("validation.networkError"))
        setProducts([])
        setListings([])
        setTotal(0)
      } finally {
        if (id === requestId.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [tab, query, category, province, sortBy],
  )

  useEffect(() => {
    load("initial")
  }, [load])

  /* -- derived ----------------------------------------------------------- */

  const categories = tab === "inputs" ? PRODUCT_CATEGORIES : LISTING_CATEGORIES
  const categoryLabel = tab === "inputs" ? productCategoryLabel : listingCategoryLabel

  const filtersActive = query !== "" || category !== ALL || province !== "" || sortBy !== "newest"

  const clearFilters = useCallback(() => {
    setSearch("")
    setQuery("")
    setCategory(ALL)
    setProvince("")
    setSortBy("newest")
  }, [])

  const switchTab = useCallback(
    (next: string) => {
      // Categories are disjoint between the two catalogues, so a carried-over
      // value would silently return nothing.
      setTab(next === "produce" ? "produce" : "inputs")
      setCategory(ALL)
    },
    [],
  )

  const provinceLabel = useMemo(
    () => (option: Province) => (isEnglish ? option : PROVINCE_URDU[option]),
    [isEnglish],
  )

  /* -- render ------------------------------------------------------------ */

  return (
    <div className="container-app space-y-5 py-4 md:max-w-5xl md:py-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("marketplace.title")}</h1>
            <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
              {t("marketplace.subtitle")}
            </p>
          </div>

          {/* The cart itself lives in the app header (components/AppShell.tsx),
              reachable from every screen, so it is not repeated here. */}
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={() => load("refresh")}
            disabled={loading || refreshing}
            aria-label={t("common.refresh")}
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>

        {/* A standing reminder that something is waiting, for anyone who missed
            the toast. Hidden entirely while the cart is empty. */}
        {cart.count > 0 ? (
          <Link
            href="/marketplace/cart"
            className="flex min-h-tap items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 transition-colors hover:bg-primary/15"
          >
            <ShoppingCart className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-body-sm font-semibold leading-[1.7] ${scriptClass}`}>
                {cart.count === 1 ? t("marketplace.itemCountOne") : t("marketplace.itemCount", { count: formatNumber(cart.count) })}
              </span>
              <span className="force-ltr block text-xs leading-[1.8] text-muted-foreground">
                {formatCurrency(cart.total)}
              </span>
            </span>
            <span className={`shrink-0 text-body-sm font-semibold text-primary ${scriptClass}`}>
              {t("marketplace.cart")}
            </span>
            <ArrowRight className="size-4 shrink-0 flip-rtl text-primary" aria-hidden="true" />
          </Link>
        ) : null}

        <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
          <Button asChild className="min-h-tap w-full gap-2">
            <Link href="/marketplace/sell-crop">
              <Sprout className="size-4" aria-hidden="true" />
              <span className={scriptClass}>{t("marketplace.sellCrop")}</span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-tap w-full gap-2">
            <Link href="/marketplace/orders">
              <Package className="size-4" aria-hidden="true" />
              <span className={scriptClass}>{t("marketplace.myOrders")}</span>
            </Link>
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="inputs" className="min-h-tap gap-1.5 text-body-sm">
            <Store className="size-4" aria-hidden="true" />
            <span className={`truncate ${scriptClass}`}>{t("marketplace.inputs")}</span>
          </TabsTrigger>
          <TabsTrigger value="produce" className="min-h-tap gap-1.5 text-body-sm">
            <Leaf className="size-4" aria-hidden="true" />
            <span className={`truncate ${scriptClass}`}>{t("marketplace.produce")}</span>
          </TabsTrigger>
        </TabsList>

        {/* -- filters (shared by both tabs) -------------------------------- */}
        <section aria-label={t("common.filter")} className="mt-4 space-y-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "inputs" ? t("marketplace.searchInputs") : t("marketplace.searchProduce")}
              aria-label={tab === "inputs" ? t("marketplace.searchInputs") : t("marketplace.searchProduce")}
              className="h-11 ps-9 pe-9 text-base"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t("common.reset")}
                className="absolute end-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 xs:grid-cols-3">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-11 text-base" aria-label={t("marketplace.category")}>
                <SelectValue placeholder={t("marketplace.allCategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="min-h-tap">
                  {t("marketplace.allCategories")}
                </SelectItem>
                {categories.map((value) => (
                  <SelectItem key={value} value={value} className="min-h-tap">
                    {categoryLabel(t, value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={province || ALL} onValueChange={(value) => setProvince(value === ALL ? "" : value)}>
              <SelectTrigger className="h-11 text-base" aria-label={t("auth.province")}>
                <SelectValue placeholder={t("auth.selectProvince")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="min-h-tap">
                  {t("market.allProvinces")}
                </SelectItem>
                {PROVINCES.map((option) => (
                  <SelectItem key={option} value={option} className="min-h-tap">
                    {provinceLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-11 text-base" aria-label={t("marketplace.sortBy")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="min-h-tap">
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtersActive ? (
            <Button variant="ghost" size="sm" className="min-h-tap gap-1.5" onClick={clearFilters}>
              <X className="size-4" aria-hidden="true" />
              <span className={scriptClass}>{t("market.clearFilters")}</span>
            </Button>
          ) : null}
        </section>

        {/* -- results ------------------------------------------------------ */}
        <TabsContent value="inputs" className="mt-4 focus-visible:outline-none">
          <Results
            loading={loading}
            error={error}
            total={total}
            count={products.length}
            onRetry={() => load("refresh")}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
            emptyMessage={t("marketplace.noProducts")}
            scriptClass={scriptClass}
            t={t}
            formatNumber={formatNumber}
          >
            <ul className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <li key={product._id}>
                  <ProductCard
                    product={product}
                    scriptClass={scriptClass}
                    t={t}
                    formatCurrency={formatCurrency}
                    formatNumber={formatNumber}
                  />
                </li>
              ))}
            </ul>
          </Results>
        </TabsContent>

        <TabsContent value="produce" className="mt-4 focus-visible:outline-none">
          <Results
            loading={loading}
            error={error}
            total={total}
            count={listings.length}
            onRetry={() => load("refresh")}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
            emptyMessage={t("marketplace.noListings")}
            scriptClass={scriptClass}
            t={t}
            formatNumber={formatNumber}
          >
            <ul className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <li key={listing._id}>
                  <ListingCard
                    listing={listing}
                    scriptClass={scriptClass}
                    t={t}
                    formatCurrency={formatCurrency}
                    formatNumber={formatNumber}
                  />
                </li>
              ))}
            </ul>
          </Results>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* --------------------------------------------------------------- results */

type Translate = (key: string, vars?: Record<string, string | number>) => string

function Results({
  loading,
  error,
  total,
  count,
  onRetry,
  filtersActive,
  onClearFilters,
  emptyMessage,
  scriptClass,
  t,
  formatNumber,
  children,
}: {
  loading: boolean
  error: string | null
  total: number
  count: number
  onRetry: () => void
  filtersActive: boolean
  onClearFilters: () => void
  emptyMessage: string
  scriptClass: string
  t: Translate
  formatNumber: (value: number | string) => string
  children: ReactNode
}) {
  if (loading) return <CatalogueSkeleton />

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <p className={`font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.loadFailed")}</p>
              <p className="text-body-sm leading-[1.7] text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button className="min-h-tap" onClick={onRetry}>
            <RefreshCw className="me-2 size-4" aria-hidden="true" />
            {t("common.retry")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (count === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <Package className="size-7 text-muted-foreground" aria-hidden="true" />
          <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>{emptyMessage}</p>
          {filtersActive ? (
            <Button variant="outline" className="min-h-tap" onClick={onClearFilters}>
              {t("market.clearFilters")}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
        {t("marketplace.resultsShown", { count: formatNumber(total || count) })}
      </p>
      {children}
    </div>
  )
}

function CatalogueSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-56 w-full rounded-lg" />
      ))}
    </div>
  )
}

/* ----------------------------------------------------------- product card */

function ProductCard({
  product,
  scriptClass,
  t,
  formatCurrency,
  formatNumber,
}: {
  product: ApiProduct
  scriptClass: string
  t: Translate
  formatCurrency: (amount: number) => string
  formatNumber: (value: number | string) => string
}) {
  const router = useRouter()
  const stock = product.stock?.quantity ?? 0
  const inStock = stock > 0
  const discount = product.price?.discount ?? 0
  const sellerName = personName(product.seller)
  const place = personPlace(product.seller) || [product.location?.district, product.location?.state].filter(Boolean).join(", ")
  const ratingCount = product.ratings?.count ?? 0

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardContent className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="leading-[1.7]">
            {productCategoryLabel(t, product.category)}
          </Badge>
          {discount > 0 ? (
            <Badge className="bg-gold text-gold-foreground leading-[1.7]">
              {t("marketplace.discountOff", { percent: discount })}
            </Badge>
          ) : null}
          {!inStock ? (
            <Badge variant="destructive" className="leading-[1.7]">
              {t("marketplace.outOfStock")}
            </Badge>
          ) : null}
        </div>

        <div className="min-w-0 space-y-1">
          <h3 className="line-clamp-2 text-base font-semibold leading-[1.6]">
            <Link href={`/marketplace/product/${product._id}`} className="hover:underline">
              {product.name}
            </Link>
          </h3>
          {product.brand ? (
            <p className="flex items-center gap-1 text-xs leading-[1.8] text-muted-foreground">
              <Tag className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{product.brand}</span>
            </p>
          ) : null}
          {place ? (
            <p className="flex items-center gap-1 text-xs leading-[1.8] text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{sellerName ? `${sellerName} · ${place}` : place}</span>
            </p>
          ) : null}
          {ratingCount > 0 ? (
            <p className="flex items-center gap-1 text-xs leading-[1.8] text-muted-foreground">
              <Star className="size-3.5 shrink-0 fill-gold text-gold" aria-hidden="true" />
              <span className="force-ltr">{(product.ratings?.average ?? 0).toFixed(1)}</span>
              <span>{t("marketplace.ratingsCount", { count: formatNumber(ratingCount) })}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-auto space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="force-ltr text-xl font-bold text-primary">{formatCurrency(product.price.selling)}</span>
            {product.price.mrp > product.price.selling ? (
              <span className="force-ltr text-xs text-muted-foreground line-through">
                {formatCurrency(product.price.mrp)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-[1.8] text-muted-foreground">
            {inStock ? (
              <span className={scriptClass}>
                {t("marketplace.stockLeft", {
                  count: formatNumber(stock),
                  unit: unitLabel(t, product.stock?.unit),
                })}
              </span>
            ) : null}
            {product.shipping?.freeShipping ? (
              <span className="inline-flex items-center gap-1">
                <Truck className="size-3.5" aria-hidden="true" />
                <span className={scriptClass}>{t("marketplace.freeDelivery")}</span>
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Button
              className="min-h-tap w-full gap-2"
              disabled={!inStock}
              onClick={() => {
                addToCart({
                  productId: product._id,
                  name: product.name,
                  brand: product.brand,
                  price: product.price.selling,
                  unit: product.stock?.unit ?? "",
                  maxQuantity: stock,
                  sellerName,
                  freeShipping: Boolean(product.shipping?.freeShipping),
                  shippingCost: Number(product.shipping?.shippingCost) || 0,
                })
                toastAddedToCart(t, () => router.push("/marketplace/cart"))
              }}
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              <span className={`truncate ${scriptClass}`}>
                {inStock ? t("marketplace.addToCart") : t("marketplace.outOfStockCta")}
              </span>
            </Button>
            <Button asChild variant="outline" className="min-h-tap w-full">
              <Link href={`/marketplace/product/${product._id}`}>
                <span className={`truncate ${scriptClass}`}>{t("marketplace.viewDetails")}</span>
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ----------------------------------------------------------- listing card */

function ListingCard({
  listing,
  scriptClass,
  t,
  formatCurrency,
  formatNumber,
}: {
  listing: ApiListing
  scriptClass: string
  t: Translate
  formatCurrency: (amount: number) => string
  formatNumber: (value: number | string) => string
}) {
  const unit = unitLabel(t, listing.quantity?.unit)
  const farmerName = personName(listing.farmer)
  const place = [listing.location?.district, listing.location?.state].filter(Boolean).join(", ")

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardContent className="flex flex-1 flex-col gap-2.5 p-3">
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

        <div className="min-w-0 space-y-1">
          <h3 className="line-clamp-2 text-base font-semibold leading-[1.6]">
            <Link href={`/marketplace/product/${listing._id}`} className="hover:underline">
              {listing.cropName}
            </Link>
          </h3>
          {listing.variety ? (
            <p className="truncate text-xs leading-[1.8] text-muted-foreground">{listing.variety}</p>
          ) : null}
          {place || farmerName ? (
            <p className="flex items-center gap-1 text-xs leading-[1.8] text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{farmerName ? `${farmerName} · ${place}` : place}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-auto space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="force-ltr text-xl font-bold text-primary">
              {formatCurrency(listing.pricing.basePrice)}
            </span>
            {unit ? <span className="text-xs text-muted-foreground">/ {unit}</span> : null}
          </div>

          <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
            {t("marketplace.quantityAvailable")}:{" "}
            <span className="force-ltr font-medium text-foreground">
              {formatNumber(listing.quantity?.available ?? 0)} {unit}
            </span>
          </p>

          {listing.pricing?.negotiable ? (
            <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
              {t("marketplace.negotiable")}
            </p>
          ) : null}

          <Button asChild variant="outline" className="min-h-tap w-full">
            <Link href={`/marketplace/product/${listing._id}`}>
              <span className={`truncate ${scriptClass}`}>{t("marketplace.viewDetails")}</span>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
