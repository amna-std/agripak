"use client"

/**
 * Checkout — cash on delivery only.
 *
 * HONESTY NOTE (the project conventions rules 5 and 6): AgriPak has no payment
 * provider integrated. There is deliberately no card form here — a form that
 * looks like it takes money and does not is worse than no checkout at all. The
 * order is recorded with `payment.method = "cod"` and the buyer pays the seller
 * on delivery; the card/bank option is shown disabled so the farmer knows it
 * exists but is not switched on.
 *
 * The order is placed with `POST /api/marketplace/orders`, which re-reads every
 * price from the database, so the totals shown here are an estimate of what the
 * API will record, not an authority over it.
 *
 * Chrome (header / nav) belongs to components/AppShell.tsx.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, Loader2, Lock, MapPin, ShoppingBag } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { marketplaceApi } from "@/lib/api"
import { useAuth, useLanguage } from "@/lib/contexts"
import { PROVINCES, PROVINCE_URDU, locationsByProvince, type Province } from "@/lib/data/pakistan-locations"

import { MOBILE_RE, POSTCODE_RE, clearCart, unitLabel, useCart } from "../_shared"

/** Sentinel for "my district is not in the list" — never submitted as a value. */
const OTHER_DISTRICT = "__other__"

export default function CheckoutPage() {
  const { t, currentLanguage, formatCurrency, formatNumber } = useLanguage()
  const { user, loading: authLoading } = useAuth()
  const { lines, count, subtotal, delivery, total } = useCart()

  const isEnglish = currentLanguage === "en"
  const scriptClass =
    currentLanguage === "ur" || currentLanguage === "pa"
      ? "font-nastaliq"
      : currentLanguage === "sd" || currentLanguage === "ps"
        ? "font-naskh"
        : ""

  /* -- form -------------------------------------------------------------- */

  const [name, setName] = useState("")
  const [mobile, setMobile] = useState("")
  const [address, setAddress] = useState("")
  const [village, setVillage] = useState("")
  const [province, setProvince] = useState<Province | "">("")
  const [district, setDistrict] = useState("")
  const [customDistrict, setCustomDistrict] = useState("")
  const [postcode, setPostcode] = useState("")
  const [notes, setNotes] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set once the API confirms — the cart is emptied, so this drives the view. */
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null)

  /** Prefill from the signed-in farmer's own record; every field stays editable. */
  useEffect(() => {
    if (!user) return
    setName((current) => current || String(user.name ?? ""))
    setMobile((current) => current || String(user.mobile ?? ""))
    setVillage((current) => current || String(user.village ?? ""))
    const savedProvince = String(user.state ?? "")
    if ((PROVINCES as string[]).includes(savedProvince)) {
      setProvince((current) => current || (savedProvince as Province))
    }
    setDistrict((current) => current || String(user.district ?? ""))
  }, [user])

  const districts = useMemo(
    () => (province ? locationsByProvince(province).map((location) => location.name).sort() : []),
    [province],
  )

  /** A saved district that is not one of the listed headquarters still counts. */
  const districtValue = useMemo(() => {
    if (!district) return ""
    return districts.includes(district) ? district : OTHER_DISTRICT
  }, [district, districts])

  const resolvedDistrict = districtValue === OTHER_DISTRICT ? customDistrict.trim() : district

  // Carry a saved-but-unlisted district into the free-text box rather than
  // silently dropping it.
  useEffect(() => {
    if (districtValue === OTHER_DISTRICT && !customDistrict && district && district !== OTHER_DISTRICT) {
      setCustomDistrict(district)
    }
  }, [districtValue, customDistrict, district])

  /* -- submit ------------------------------------------------------------ */

  async function placeOrder() {
    setError(null)

    if (!name.trim()) return setError(t("validation.required"))
    if (!MOBILE_RE.test(mobile.trim())) return setError(t("validation.invalidMobile"))
    if (!address.trim()) return setError(t("validation.required"))
    if (!province) return setError(t("validation.selectProvince"))
    if (!resolvedDistrict) return setError(t("validation.selectDistrict"))
    if (postcode.trim() && !POSTCODE_RE.test(postcode.trim())) return setError(t("marketplace.postalCodeHint"))

    setSubmitting(true)
    try {
      const res = await marketplaceApi.createOrder({
        items: lines.map((line) => ({ product: line.productId, quantity: line.quantity })),
        payment: { method: "cod" },
        shippingAddress: {
          name: name.trim(),
          mobile: mobile.trim(),
          address: address.trim(),
          village: village.trim(),
          district: resolvedDistrict,
          // The Order model calls this field `state`; in Pakistan it holds a province.
          state: province,
          pincode: postcode.trim(),
        },
        notes: notes.trim() || undefined,
      })

      if (!res.success) {
        setError(res.message || t("validation.somethingWentWrong"))
        return
      }

      const order = (res.order ?? {}) as { orderId?: string }
      setPlacedOrderId(order.orderId ?? "")
      clearCart()
      toast.success(t("marketplace.orderPlaced"))
    } catch {
      setError(t("validation.networkError"))
    } finally {
      setSubmitting(false)
    }
  }

  /* -- render ------------------------------------------------------------ */

  if (placedOrderId !== null) {
    return (
      <div className="container-app space-y-5 py-4 md:max-w-3xl md:py-6">
        <Card className="border-success/40">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
            <h1 className={`text-xl font-bold leading-[1.7] ${scriptClass}`}>{t("marketplace.orderPlaced")}</h1>
            {placedOrderId ? (
              <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
                {t("marketplace.orderNumber")}:{" "}
                <span className="force-ltr font-bold text-foreground">{placedOrderId}</span>
              </p>
            ) : null}
            <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
              {t("marketplace.orderConfirmedHint")}
            </p>
            {/* Two-up only from 640px: "Back to the marketplace" does not fit a
                half-width button at 360px. */}
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              <Button asChild className="min-h-tap w-full">
                <Link href="/marketplace/orders">
                  <span className={scriptClass}>{t("marketplace.viewMyOrders")}</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-tap w-full">
                <Link href="/marketplace">
                  <span className={scriptClass}>{t("marketplace.backToMarketplace")}</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container-app space-y-5 py-4 md:max-w-3xl md:py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("marketplace.checkout")}</h1>
        {count > 0 ? (
          <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
            {count === 1 ? t("marketplace.itemCountOne") : t("marketplace.itemCount", { count: formatNumber(count) })}
          </p>
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
      ) : lines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <ShoppingBag className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className={`font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.cartEmpty")}</p>
            <Button asChild className="min-h-tap">
              <Link href="/marketplace">{t("marketplace.continueShopping")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* -- summary --------------------------------------------------- */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className={`text-lg font-semibold leading-[1.7] ${scriptClass}`}>
                {t("marketplace.orderSummary")}
              </h2>

              <ul className="space-y-2">
                {lines.map((line) => (
                  <li key={line.productId} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-body-sm font-medium leading-[1.6]">{line.name}</p>
                      <p className="force-ltr text-xs leading-[1.8] text-muted-foreground">
                        {formatNumber(line.quantity)} {unitLabel(t, line.unit)} × {formatCurrency(line.price)}
                      </p>
                    </div>
                    <span className="force-ltr shrink-0 text-body-sm font-semibold">
                      {formatCurrency(line.price * line.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <Separator />

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
            </CardContent>
          </Card>

          {/* -- address --------------------------------------------------- */}
          <Card>
            <CardContent className="space-y-4 p-4">
              <h2 className={`flex items-center gap-2 text-lg font-semibold leading-[1.7] ${scriptClass}`}>
                <MapPin className="size-5 text-primary" aria-hidden="true" />
                {t("marketplace.deliveryAddress")}
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="checkout-name" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.fullName")}
                  </Label>
                  <Input
                    id="checkout-name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-2 min-h-tap text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="checkout-mobile" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.mobileNumber")}
                  </Label>
                  <Input
                    id="checkout-mobile"
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    autoComplete="tel"
                    placeholder={t("auth.mobilePlaceholder")}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    className="mt-2 min-h-tap text-start text-base"
                  />
                  <p className={`mt-1 text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
                    {t("auth.mobileHint")}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="checkout-address" className="text-sm font-semibold leading-[1.7]">
                  {t("marketplace.addressLine")}
                </Label>
                <Textarea
                  id="checkout-address"
                  rows={2}
                  autoComplete="street-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-2 text-base"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="checkout-province" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.province")}
                  </Label>
                  <Select
                    value={province}
                    onValueChange={(value) => {
                      setProvince(value as Province)
                      setDistrict("")
                      setCustomDistrict("")
                    }}
                  >
                    <SelectTrigger id="checkout-province" className="mt-2 min-h-tap text-base">
                      <SelectValue placeholder={t("auth.selectProvince")} />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVINCES.map((option) => (
                        <SelectItem key={option} value={option} className="min-h-tap">
                          {isEnglish ? option : PROVINCE_URDU[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="checkout-district" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.district")}
                  </Label>
                  <Select value={districtValue} onValueChange={setDistrict} disabled={!province}>
                    <SelectTrigger id="checkout-district" className="mt-2 min-h-tap text-base">
                      <SelectValue placeholder={t("auth.selectDistrict")} />
                    </SelectTrigger>
                    <SelectContent>
                      {districts.map((option) => (
                        <SelectItem key={option} value={option} className="min-h-tap">
                          {option}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_DISTRICT} className="min-h-tap">
                        {t("auth.districtOther")}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {districtValue === OTHER_DISTRICT ? (
                    <Input
                      aria-label={t("auth.districtManual")}
                      placeholder={t("auth.districtManual")}
                      value={customDistrict}
                      onChange={(e) => setCustomDistrict(e.target.value)}
                      className="mt-2 min-h-tap text-base"
                    />
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="checkout-village" className="text-sm font-semibold leading-[1.7]">
                    {t("auth.villageOrTown")}
                  </Label>
                  <Input
                    id="checkout-village"
                    autoComplete="address-level3"
                    placeholder={t("auth.villagePlaceholder")}
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    className="mt-2 min-h-tap text-base"
                  />
                </div>

                <div>
                  <Label htmlFor="checkout-postcode" className="text-sm font-semibold leading-[1.7]">
                    {t("marketplace.postalCode")}{" "}
                    <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                  </Label>
                  <Input
                    id="checkout-postcode"
                    inputMode="numeric"
                    dir="ltr"
                    autoComplete="postal-code"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    className="mt-2 min-h-tap text-start text-base"
                  />
                  <p className={`mt-1 text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
                    {t("marketplace.postalCodeHint")}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="checkout-notes" className="text-sm font-semibold leading-[1.7]">
                  {t("marketplace.noteForSeller")}{" "}
                  <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
                </Label>
                <Textarea
                  id="checkout-notes"
                  rows={2}
                  maxLength={1000}
                  placeholder={t("marketplace.notePlaceholder")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-2 text-base"
                />
              </div>
            </CardContent>
          </Card>

          {/* -- payment --------------------------------------------------- */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className={`text-lg font-semibold leading-[1.7] ${scriptClass}`}>
                {t("marketplace.paymentMethod")}
              </h2>

              <div className="flex items-start gap-3 rounded-lg border border-primary bg-primary/10 p-3">
                <Banknote className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <p className={`font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.cashOnDelivery")}</p>
                  <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
                    {t("marketplace.codHint")}
                  </p>
                </div>
              </div>

              {/* Shown, but plainly switched off — no payment provider is wired up. */}
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-3 opacity-70">
                <CreditCard className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <p className={`font-semibold leading-[1.7] text-muted-foreground ${scriptClass}`}>
                    {t("marketplace.onlinePayment")}
                  </p>
                  <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
                    {t("marketplace.onlineUnavailable")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <p className={`text-body-sm leading-[1.7] text-foreground ${scriptClass}`}>{error}</p>
            </div>
          ) : null}

          <Button className="min-h-tap w-full gap-2" disabled={submitting} onClick={placeOrder}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            <span className={scriptClass}>
              {submitting ? t("marketplace.placingOrder") : t("marketplace.placeOrder")}
            </span>
          </Button>
        </>
      )}
    </div>
  )
}
