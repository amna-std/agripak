"use client"

/**
 * The global cart button.
 *
 * Lives next to the bell in the app header (components/AppShell.tsx), so the
 * cart is reachable from every screen — a farmer who taps "Add to cart" on a
 * product card must never have to guess where the items went.
 *
 * It reads the same localStorage-backed store as the cart page (`./_shared`),
 * through `useCart()`, so the badge updates the instant something is added
 * anywhere in the app, in this tab and in any other one.
 *
 * The badge is hidden during SSR and the first paint (the store's server
 * snapshot is an empty cart) and appears as soon as React hydrates — that is
 * deliberate, since localStorage does not exist on the server.
 */

import Link from "next/link"
import { ShoppingCart } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/contexts"

import { useCart } from "./_shared"

export function CartButton({ className }: { className?: string }) {
  const { t, formatNumber } = useLanguage()
  const { count } = useCart()

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className={`relative min-h-tap min-w-tap ${className ?? ""}`}
    >
      <Link
        href="/marketplace/cart"
        aria-label={
          count > 0
            ? `${t("marketplace.cart")} — ${count === 1 ? t("marketplace.itemCountOne") : t("marketplace.itemCount", { count: formatNumber(count) })}`
            : t("marketplace.cart")
        }
      >
        <ShoppingCart className="h-5 w-5" aria-hidden />
        {count > 0 ? (
          // `force-ltr` sets `direction: ltr`, which would make `end-0.5` resolve
          // against the badge's own direction and pin it to the right even in
          // RTL. So the positioning stays on the outer span and only the digits
          // are forced LTR.
          <span
            className="absolute -top-0.5 end-0.5 min-w-[1.15rem] rounded-full bg-primary px-1 text-center text-[0.6875rem] font-bold leading-[1.15rem] text-primary-foreground"
            aria-hidden
          >
            <span className="force-ltr">{count > 99 ? "99+" : formatNumber(count)}</span>
          </span>
        ) : null}
      </Link>
    </Button>
  )
}

export default CartButton
