"use client"

/**
 * My orders — `GET /api/marketplace/orders`, which answers with the caller's own
 * purchases (`?as=buyer`) or the orders containing their products (`?as=seller`).
 *
 * Nothing is invented: the two tabs show exactly what the API returns, an honest
 * empty state when there is none, and the API's own message when a call fails.
 * Order status is read-only here — there is no status-change endpoint, so no
 * button pretends to move an order along.
 *
 * Chrome (header / nav) belongs to components/AppShell.tsx.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Banknote,
  Loader2,
  Lock,
  MapPin,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { marketplaceApi } from "@/lib/api"
import { useAuth, useLanguage } from "@/lib/contexts"

import { formatDate, orderStatusClasses, orderStatusLabel, personName } from "../_shared"

/* ------------------------------------------------------------------ types */

interface OrderItem {
  quantity: number
  price: number
  status?: string
  product?: { _id?: string; name?: string; seoUrl?: string } | string | null
  seller?: { _id?: string; name?: string; district?: string; state?: string } | string | null
}

interface ApiOrder {
  _id: string
  orderId: string
  items: OrderItem[]
  shippingAddress?: {
    name?: string
    mobile?: string
    address?: string
    village?: string
    district?: string
    state?: string
    pincode?: string
  }
  payment?: { method?: string; status?: string; amount?: number }
  pricing?: { subtotal?: number; shipping?: number; discount?: number; total?: number }
  status?: string
  notes?: string
  createdAt?: string
}

type Role = "buyer" | "seller"

export default function OrdersPage() {
  const { t, currentLanguage, locale, formatCurrency, formatNumber } = useLanguage()
  const { user, loading: authLoading } = useAuth()

  const scriptClass =
    currentLanguage === "ur" || currentLanguage === "pa"
      ? "font-nastaliq"
      : currentLanguage === "sd" || currentLanguage === "ps"
        ? "font-naskh"
        : ""

  const [role, setRole] = useState<Role>("buyer")
  const [orders, setOrders] = useState<ApiOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `t` changes identity on every language-context update; read it through a ref
  // so `load` is not re-created (and re-fired) by a language switch.
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
        const res = await marketplaceApi.getOrders({ as: role, limit: 50 })
        if (id !== requestId.current) return

        if (!res.success) {
          setError(res.message || tRef.current("marketplace.loadFailed"))
          setOrders([])
          return
        }
        setOrders((res.orders ?? []) as ApiOrder[])
      } catch {
        if (id !== requestId.current) return
        setError(tRef.current("validation.networkError"))
        setOrders([])
      } finally {
        if (id === requestId.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [role],
  )

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    load("initial")
  }, [load, user])

  /* -- render ------------------------------------------------------------ */

  return (
    <div className="container-app space-y-5 py-4 md:max-w-3xl md:py-6">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("marketplace.myOrders")}</h1>
          <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
            {t("marketplace.subtitle")}
          </p>
        </div>
        {user ? (
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
        ) : null}
      </header>

      {authLoading ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
              {t("common.loading")}
            </span>
          </CardContent>
        </Card>
      ) : !user ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <Lock className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className={`font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.loginToOrder")}</p>
            <Button asChild className="min-h-tap">
              <Link href="/auth/login">{t("auth.login")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs value={role} onValueChange={(value) => setRole(value === "seller" ? "seller" : "buyer")}>
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger value="buyer" className="min-h-tap gap-1.5 text-body-sm">
                <ShoppingBag className="size-4" aria-hidden="true" />
                <span className={`truncate ${scriptClass}`}>{t("marketplace.boughtByMe")}</span>
              </TabsTrigger>
              <TabsTrigger value="seller" className="min-h-tap gap-1.5 text-body-sm">
                <Store className="size-4" aria-hidden="true" />
                <span className={`truncate ${scriptClass}`}>{t("marketplace.soldByMe")}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 w-full rounded-lg" />
              ))}
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
                <Button className="min-h-tap" onClick={() => load("refresh")}>
                  <RefreshCw className="me-2 size-4" aria-hidden="true" />
                  {t("common.retry")}
                </Button>
              </CardContent>
            </Card>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                <Package className="size-8 text-muted-foreground" aria-hidden="true" />
                <div className="space-y-1">
                  <p className={`font-semibold leading-[1.7] ${scriptClass}`}>
                    {role === "buyer" ? t("marketplace.noOrders") : t("marketplace.noSales")}
                  </p>
                  <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
                    {role === "buyer" ? t("marketplace.noOrdersHint") : t("marketplace.noSalesHint")}
                  </p>
                </div>
                <Button asChild className="min-h-tap">
                  <Link href="/marketplace">{t("marketplace.backToMarketplace")}</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {orders.map((order) => (
                <li key={order._id}>
                  <OrderCard
                    order={order}
                    role={role}
                    locale={locale}
                    scriptClass={scriptClass}
                    t={t}
                    formatCurrency={formatCurrency}
                    formatNumber={formatNumber}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- order card */

function OrderCard({
  order,
  role,
  locale,
  scriptClass,
  t,
  formatCurrency,
  formatNumber,
}: {
  order: ApiOrder
  role: Role
  locale: string
  scriptClass: string
  t: (key: string, vars?: Record<string, string | number>) => string
  formatCurrency: (amount: number) => string
  formatNumber: (value: number | string) => string
}) {
  const placed = formatDate(order.createdAt, locale)
  const address = order.shippingAddress
  const place = [address?.district, address?.state].filter(Boolean).join(", ")

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
              {t("marketplace.orderNumber")}
            </p>
            <p className="force-ltr text-base font-bold">{order.orderId}</p>
            {placed ? (
              <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
                {t("marketplace.placedOn")} <span className="force-ltr">{placed}</span>
              </p>
            ) : null}
          </div>

          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${orderStatusClasses(
              order.status,
            )}`}
          >
            {orderStatusLabel(t, order.status)}
          </span>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className={`text-xs font-semibold uppercase tracking-wide text-muted-foreground ${scriptClass}`}>
            {t("marketplace.items")}
          </p>
          <ul className="space-y-2">
            {order.items.map((item, index) => {
              const product = item.product && typeof item.product === "object" ? item.product : null
              const counterparty = personName(item.seller)
              return (
                <li key={`${order._id}-${index}`} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-body-sm font-medium leading-[1.6]">
                      {product?._id ? (
                        <Link href={`/marketplace/product/${product._id}`} className="hover:underline">
                          {product.name ?? t("marketplace.notFound")}
                        </Link>
                      ) : (
                        (product?.name ?? t("marketplace.notFound"))
                      )}
                    </p>
                    <p className="force-ltr text-xs leading-[1.8] text-muted-foreground">
                      {formatNumber(item.quantity)} × {formatCurrency(item.price)}
                    </p>
                    {role === "buyer" && counterparty ? (
                      <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
                        {t("marketplace.soldBy")}: <span className="text-foreground">{counterparty}</span>
                      </p>
                    ) : null}
                  </div>
                  <span className="force-ltr shrink-0 text-body-sm font-semibold">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <Separator />

        <dl className="space-y-1.5 text-body-sm leading-[1.7]">
          <div className="flex items-center justify-between gap-3">
            <dt className={`text-muted-foreground ${scriptClass}`}>{t("marketplace.subtotal")}</dt>
            <dd className="force-ltr font-medium">{formatCurrency(order.pricing?.subtotal ?? 0)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className={`text-muted-foreground ${scriptClass}`}>{t("marketplace.deliveryCharges")}</dt>
            <dd className="force-ltr font-medium">
              {(order.pricing?.shipping ?? 0) === 0 ? (
                <span className={`text-success ${scriptClass}`}>{t("marketplace.free")}</span>
              ) : (
                formatCurrency(order.pricing?.shipping ?? 0)
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className={`font-semibold ${scriptClass}`}>{t("marketplace.totalPrice")}</dt>
            <dd className="force-ltr text-lg font-bold text-primary">{formatCurrency(order.pricing?.total ?? 0)}</dd>
          </div>
        </dl>

        {order.payment?.method === "cod" ? (
          <p className={`flex items-center gap-1.5 text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
            <Banknote className="size-3.5 shrink-0" aria-hidden="true" />
            {t("marketplace.cashOnDelivery")}
          </p>
        ) : null}

        {address?.name || place ? (
          <div className="rounded-lg bg-muted p-2.5">
            <p className={`flex items-center gap-1.5 text-xs font-semibold leading-[1.8] ${scriptClass}`}>
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {t("marketplace.deliveryAddress")}
            </p>
            <p className="mt-1 text-xs leading-[1.8] text-muted-foreground">
              {[address?.name, address?.address, address?.village, place, address?.pincode]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {address?.mobile ? (
              <p className="force-ltr mt-0.5 text-xs leading-[1.8] text-muted-foreground">{address.mobile}</p>
            ) : null}
          </div>
        ) : null}

        {order.notes ? (
          <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
            {t("marketplace.noteForSeller")}: <span className="text-foreground">{order.notes}</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
