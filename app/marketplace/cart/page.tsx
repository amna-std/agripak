"use client"

/**
 * Cart.
 *
 * There is no `/api/marketplace/cart` endpoint — the backend goes straight from
 * a product to `POST /api/marketplace/orders`. The cart is therefore a
 * device-local list kept in localStorage (see `../_shared.ts`); prices held
 * there are for display only, because the order route re-reads every price from
 * the database before charging anything.
 *
 * Delivery is charged once per product, exactly as the order route computes it,
 * so the total shown here matches the total the API will record.
 *
 * Chrome (header / nav) belongs to components/AppShell.tsx.
 */

import Link from "next/link"
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useLanguage } from "@/lib/contexts"

import { clearCart, removeFromCart, setCartQuantity, unitLabel, useCart, type CartLine } from "../_shared"

export default function CartPage() {
  const { t, currentLanguage, formatCurrency, formatNumber } = useLanguage()
  const { lines, count, subtotal, delivery, total } = useCart()

  const scriptClass =
    currentLanguage === "ur" || currentLanguage === "pa"
      ? "font-nastaliq"
      : currentLanguage === "sd" || currentLanguage === "ps"
        ? "font-naskh"
        : ""

  return (
    <div className="container-app space-y-5 py-4 md:max-w-3xl md:py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("marketplace.cart")}</h1>
        {count > 0 ? (
          <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
            {count === 1 ? t("marketplace.itemCountOne") : t("marketplace.itemCount", { count: formatNumber(count) })}
          </p>
        ) : null}
      </header>

      {lines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <ShoppingBag className="size-8 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className={`font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.cartEmpty")}</p>
              <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
                {t("marketplace.cartEmptyHint")}
              </p>
            </div>
            <Button asChild className="min-h-tap">
              <Link href="/marketplace">{t("marketplace.continueShopping")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="space-y-2.5">
            {lines.map((line) => (
              <li key={line.productId}>
                <CartRow
                  line={line}
                  scriptClass={scriptClass}
                  t={t}
                  formatCurrency={formatCurrency}
                  formatNumber={formatNumber}
                />
              </li>
            ))}
          </ul>

          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className={`text-lg font-semibold leading-[1.7] ${scriptClass}`}>
                {t("marketplace.orderSummary")}
              </h2>

              <dl className="space-y-2 text-body-sm leading-[1.7]">
                <div className="flex items-center justify-between gap-3">
                  <dt className={`text-muted-foreground ${scriptClass}`}>{t("marketplace.subtotal")}</dt>
                  <dd className="force-ltr font-medium">{formatCurrency(subtotal)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className={`text-muted-foreground ${scriptClass}`}>{t("marketplace.deliveryCharges")}</dt>
                  <dd className="force-ltr font-medium">
                    {delivery === 0 ? (
                      <span className={`text-success ${scriptClass}`}>{t("marketplace.free")}</span>
                    ) : (
                      formatCurrency(delivery)
                    )}
                  </dd>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <dt className={`text-base font-semibold ${scriptClass}`}>{t("marketplace.totalPrice")}</dt>
                  <dd className="force-ltr text-xl font-bold text-primary">{formatCurrency(total)}</dd>
                </div>
              </dl>

              <Button asChild className="min-h-tap w-full gap-2">
                <Link href="/marketplace/checkout">
                  <span className={scriptClass}>{t("marketplace.proceedToCheckout")}</span>
                  <ArrowRight className="size-4 flip-rtl" aria-hidden="true" />
                </Link>
              </Button>

              <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
                <Button asChild variant="outline" className="min-h-tap w-full">
                  <Link href="/marketplace">
                    <span className={scriptClass}>{t("marketplace.continueShopping")}</span>
                  </Link>
                </Button>
                <Button variant="ghost" className="min-h-tap w-full gap-2 text-destructive" onClick={clearCart}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className={scriptClass}>{t("marketplace.clearCart")}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- cart row */

function CartRow({
  line,
  scriptClass,
  t,
  formatCurrency,
  formatNumber,
}: {
  line: CartLine
  scriptClass: string
  t: (key: string, vars?: Record<string, string | number>) => string
  formatCurrency: (amount: number) => string
  formatNumber: (value: number | string) => string
}) {
  const unit = unitLabel(t, line.unit)
  const atMax = line.quantity >= Math.max(line.maxQuantity, 1)

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="line-clamp-2 text-base font-semibold leading-[1.6]">
              <Link href={`/marketplace/product/${line.productId}`} className="hover:underline">
                {line.name}
              </Link>
            </h3>
            {line.brand ? <p className="truncate text-xs leading-[1.8] text-muted-foreground">{line.brand}</p> : null}
            {line.sellerName ? (
              <p className={`truncate text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
                {t("marketplace.soldBy")}: <span className="font-medium text-foreground">{line.sellerName}</span>
              </p>
            ) : null}
            <p className="force-ltr text-xs leading-[1.8] text-muted-foreground">
              {formatCurrency(line.price)}
              {unit ? ` / ${unit}` : ""}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-destructive"
            onClick={() => removeFromCart(line.productId)}
            aria-label={t("marketplace.remove")}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-11"
              onClick={() => setCartQuantity(line.productId, line.quantity - 1)}
              aria-label={t("marketplace.decreaseQuantity")}
            >
              <Minus className="size-4" aria-hidden="true" />
            </Button>
            <span
              className="force-ltr min-w-11 text-center text-base font-semibold tabular-nums"
              aria-label={t("marketplace.quantity")}
            >
              {formatNumber(line.quantity)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-11"
              disabled={atMax}
              onClick={() => setCartQuantity(line.productId, line.quantity + 1)}
              aria-label={t("marketplace.increaseQuantity")}
            >
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <span className="force-ltr text-lg font-bold text-primary">
            {formatCurrency(line.price * line.quantity)}
          </span>
        </div>

        {atMax ? (
          <p className={`text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
            {t("marketplace.maxStock", { count: formatNumber(Math.max(line.maxQuantity, 1)) })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
