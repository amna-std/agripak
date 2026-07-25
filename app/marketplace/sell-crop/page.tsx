"use client"

/**
 * Sell your crop — creates a real row with `POST /api/marketplace/listings`.
 *
 * The form mirrors the CropListing model exactly (crop, quantity, pricing,
 * quality, location, availability, delivery); every field the API marks
 * required is validated here first so the farmer gets a translated message
 * instead of a raw backend string.
 *
 * The default trading unit is the **maund** (~40 kg) — what Pakistani farmers
 * actually deal in — not the kilogram.
 *
 * Crops come from lib/data/pakistan-crops.ts and provinces/districts from
 * lib/data/pakistan-locations.ts, so the values submitted are ones the backend
 * already recognises. `cropKey` is sent whenever the crop is a canonical one, so
 * the API can normalise the name and infer the category.
 *
 * Chrome (header / nav) belongs to components/AppShell.tsx.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Loader2, Lock, MapPin, Package, Sprout } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { marketplaceApi } from "@/lib/api"
import { useAuth, useLanguage } from "@/lib/contexts"
import { ALL_CROPS } from "@/lib/data/pakistan-crops"
import { PROVINCES, PROVINCE_URDU, locationsByProvince, type Province } from "@/lib/data/pakistan-locations"

import { LISTING_CATEGORIES, POSTCODE_RE, listingCategoryLabel, toDateInput, unitLabel } from "../_shared"

/** Sentinels — never submitted as values. */
const OTHER_CROP = "__other__"
const OTHER_DISTRICT = "__other_district__"

/** Roles `POST /api/marketplace/listings` accepts. */
const SELLER_ROLES = ["farmer", "seller", "admin"]

/** `quantity.unit` values the listings route accepts. Maund is the default. */
const UNITS = ["maund", "kg", "quintal", "ton", "bags", "pieces"] as const

const GRADES = ["A", "B", "C"] as const

/** Default selling window: from today, for two months. */
const DEFAULT_WINDOW_DAYS = 60

const CROPS = [...ALL_CROPS].sort((a, b) => a.en.localeCompare(b.en))

export default function SellCropPage() {
  const { t, currentLanguage, formatCurrency } = useLanguage()
  const { user, loading: authLoading } = useAuth()

  const isEnglish = currentLanguage === "en"
  const scriptClass =
    currentLanguage === "ur" || currentLanguage === "pa"
      ? "font-nastaliq"
      : currentLanguage === "sd" || currentLanguage === "ps"
        ? "font-naskh"
        : ""

  const canSell = Boolean(user) && SELLER_ROLES.includes(String(user?.role ?? "farmer"))

  /* -- form state -------------------------------------------------------- */

  const today = useMemo(() => toDateInput(new Date()), [])
  const defaultTill = useMemo(
    () => toDateInput(new Date(Date.now() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)),
    [],
  )

  const [cropKey, setCropKey] = useState("")
  const [customCrop, setCustomCrop] = useState("")
  const [category, setCategory] = useState("")
  const [variety, setVariety] = useState("")

  const [available, setAvailable] = useState("")
  const [unit, setUnit] = useState<string>("maund")
  const [basePrice, setBasePrice] = useState("")
  const [negotiable, setNegotiable] = useState(true)
  const [minPrice, setMinPrice] = useState("")

  const [grade, setGrade] = useState<string>("A")
  const [organic, setOrganic] = useState(false)
  const [harvestDate, setHarvestDate] = useState(today)

  const [farmAddress, setFarmAddress] = useState("")
  const [village, setVillage] = useState("")
  const [province, setProvince] = useState<Province | "">("")
  const [district, setDistrict] = useState("")
  const [customDistrict, setCustomDistrict] = useState("")
  const [postcode, setPostcode] = useState("")

  const [availableFrom, setAvailableFrom] = useState(today)
  const [availableTill, setAvailableTill] = useState(defaultTill)

  const [farmPickup, setFarmPickup] = useState(true)
  const [homeDelivery, setHomeDelivery] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [published, setPublished] = useState(false)

  /** Prefill the farm's location from the signed-in farmer's own record. */
  useEffect(() => {
    if (!user) return
    setVillage((current) => current || String(user.village ?? ""))
    const savedProvince = String(user.state ?? "")
    if ((PROVINCES as string[]).includes(savedProvince)) {
      setProvince((current) => current || (savedProvince as Province))
    }
    setDistrict((current) => current || String(user.district ?? ""))
  }, [user])

  const selectedCrop = useMemo(() => CROPS.find((crop) => crop.key === cropKey) ?? null, [cropKey])

  /** Picking a canonical crop fills the category; "other" leaves it to the user. */
  useEffect(() => {
    if (selectedCrop) setCategory(selectedCrop.category)
  }, [selectedCrop])

  const districts = useMemo(
    () => (province ? locationsByProvince(province).map((location) => location.name).sort() : []),
    [province],
  )

  const districtValue = useMemo(() => {
    if (!district) return ""
    return districts.includes(district) ? district : OTHER_DISTRICT
  }, [district, districts])

  const resolvedDistrict = districtValue === OTHER_DISTRICT ? customDistrict.trim() : district

  useEffect(() => {
    if (districtValue === OTHER_DISTRICT && !customDistrict && district && district !== OTHER_DISTRICT) {
      setCustomDistrict(district)
    }
  }, [districtValue, customDistrict, district])

  const cropName = selectedCrop ? selectedCrop.en : customCrop.trim()
  const unitLabelText = unitLabel(t, unit)

  /* -- submit ------------------------------------------------------------ */

  function resetForm() {
    setCropKey("")
    setCustomCrop("")
    setCategory("")
    setVariety("")
    setAvailable("")
    setUnit("maund")
    setBasePrice("")
    setNegotiable(true)
    setMinPrice("")
    setGrade("A")
    setOrganic(false)
    setHarvestDate(today)
    setFarmAddress("")
    setPostcode("")
    setAvailableFrom(today)
    setAvailableTill(defaultTill)
    setFarmPickup(true)
    setHomeDelivery(false)
    setError(null)
    setPublished(false)
  }

  async function publish() {
    setError(null)

    if (!cropName) return setError(t("validation.selectCrop"))
    if (!(LISTING_CATEGORIES as readonly string[]).includes(category)) return setError(t("validation.required"))
    if (!variety.trim()) return setError(t("validation.required"))

    const quantityValue = Number(available)
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) return setError(t("validation.invalidQuantity"))

    const priceValue = Number(basePrice)
    if (!Number.isFinite(priceValue) || priceValue <= 0) return setError(t("validation.invalidPrice"))

    const minValue = minPrice.trim() ? Number(minPrice) : undefined
    if (minValue !== undefined && (!Number.isFinite(minValue) || minValue <= 0 || minValue > priceValue)) {
      return setError(t("validation.invalidPrice"))
    }

    if (!harvestDate) return setError(t("validation.required"))
    if (!farmAddress.trim()) return setError(t("validation.required"))
    if (!village.trim()) return setError(t("validation.required"))
    if (!province) return setError(t("validation.selectProvince"))
    if (!resolvedDistrict) return setError(t("validation.selectDistrict"))
    if (!POSTCODE_RE.test(postcode.trim())) return setError(t("marketplace.postalCodeHint"))
    if (!availableFrom || !availableTill) return setError(t("validation.required"))
    if (new Date(availableTill) <= new Date(availableFrom)) return setError(t("validation.required"))

    setSubmitting(true)
    try {
      const res = await marketplaceApi.createListing({
        cropKey: selectedCrop?.key,
        cropName,
        category,
        variety: variety.trim(),
        quantity: { available: quantityValue, unit },
        pricing: { basePrice: priceValue, negotiable, minPrice: minValue },
        quality: {
          grade,
          organic,
          harvestDate: new Date(harvestDate).toISOString(),
        },
        location: {
          farmAddress: farmAddress.trim(),
          village: village.trim(),
          district: resolvedDistrict,
          // The CropListing model calls this field `state`; it holds a province.
          state: province,
          pincode: postcode.trim(),
        },
        availability: {
          availableFrom: new Date(availableFrom).toISOString(),
          availableTill: new Date(availableTill).toISOString(),
        },
        delivery: { farmPickup, homeDelivery },
      })

      if (!res.success) {
        setError(res.message || t("validation.somethingWentWrong"))
        return
      }

      setPublished(true)
      toast.success(t("marketplace.listingLive"))
    } catch {
      setError(t("validation.networkError"))
    } finally {
      setSubmitting(false)
    }
  }

  /* -- gates ------------------------------------------------------------- */

  if (authLoading) {
    return (
      <div className="container-app py-4 md:max-w-3xl md:py-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
              {t("common.loading")}
            </span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container-app py-4 md:max-w-3xl md:py-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <Lock className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className={`font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.loginToSell")}</p>
            <Button asChild className="min-h-tap">
              <Link href="/auth/login">{t("auth.login")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!canSell) {
    return (
      <div className="container-app py-4 md:max-w-3xl md:py-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <AlertTriangle className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className={`font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.sellersOnly")}</p>
            <Button asChild variant="outline" className="min-h-tap">
              <Link href="/marketplace">{t("marketplace.backToMarketplace")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (published) {
    return (
      <div className="container-app py-4 md:max-w-3xl md:py-6">
        <Card className="border-success/40">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
            <h1 className={`text-xl font-bold leading-[1.7] ${scriptClass}`}>{t("marketplace.listingLive")}</h1>
            <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
              {t("marketplace.listingLiveHint")}
            </p>
            <div className="grid w-full grid-cols-1 gap-2 xs:grid-cols-2">
              <Button className="min-h-tap w-full" onClick={resetForm}>
                <span className={scriptClass}>{t("marketplace.listAnother")}</span>
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

  /* -- form -------------------------------------------------------------- */

  return (
    <div className="container-app space-y-5 py-4 md:max-w-3xl md:py-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <Sprout className="size-6 shrink-0 text-primary" aria-hidden="true" />
          {t("marketplace.sellCrop")}
        </h1>
        <p className={`text-body-sm leading-[1.7] text-muted-foreground ${scriptClass}`}>
          {t("marketplace.sellCropSubtitle")}
        </p>
      </header>

      {/* -- crop ----------------------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className={`flex items-center gap-2 text-lg font-semibold leading-[1.7] ${scriptClass}`}>
            <Sprout className="size-5 text-primary" aria-hidden="true" />
            {t("marketplace.cropDetails")}
          </h2>

          <div>
            <Label htmlFor="sell-crop" className="text-sm font-semibold leading-[1.7]">
              {t("marketplace.cropName")}
            </Label>
            <Select
              value={cropKey || (customCrop ? OTHER_CROP : "")}
              onValueChange={(value) => {
                if (value === OTHER_CROP) {
                  setCropKey("")
                  setCategory("")
                } else {
                  setCropKey(value)
                  setCustomCrop("")
                }
              }}
            >
              <SelectTrigger id="sell-crop" className="mt-2 min-h-tap text-base">
                <SelectValue placeholder={t("marketplace.cropNamePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {CROPS.map((crop) => (
                  <SelectItem key={crop.key} value={crop.key} className="min-h-tap">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="leading-[1.8]">{crop.en}</span>
                      {!isEnglish ? (
                        <span
                          className="font-nastaliq text-xs leading-[1.9] text-muted-foreground"
                          lang="ur"
                          dir="rtl"
                        >
                          {crop.ur}
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_CROP} className="min-h-tap">
                  {t("marketplace.cropOther")}
                </SelectItem>
              </SelectContent>
            </Select>

            {!cropKey ? (
              <Input
                aria-label={t("marketplace.cropName")}
                placeholder={t("marketplace.cropNamePlaceholder")}
                value={customCrop}
                onChange={(e) => setCustomCrop(e.target.value)}
                className="mt-2 min-h-tap text-base"
              />
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sell-category" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.category")}
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="sell-category" className="mt-2 min-h-tap text-base">
                  <SelectValue placeholder={t("common.selectOption")} />
                </SelectTrigger>
                <SelectContent>
                  {LISTING_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value} className="min-h-tap">
                      {listingCategoryLabel(t, value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sell-variety" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.variety")}
              </Label>
              <Input
                id="sell-variety"
                placeholder={t("marketplace.varietyPlaceholder")}
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                className="mt-2 min-h-tap text-base"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* -- quantity + price ----------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className={`flex items-center gap-2 text-lg font-semibold leading-[1.7] ${scriptClass}`}>
            <Package className="size-5 text-primary" aria-hidden="true" />
            {t("marketplace.quantityAndPrice")}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sell-quantity" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.quantityAvailable")}
              </Label>
              <Input
                id="sell-quantity"
                inputMode="decimal"
                dir="ltr"
                value={available}
                onChange={(e) => setAvailable(e.target.value.replace(/[^\d.]/g, ""))}
                className="mt-2 min-h-tap text-start text-base"
              />
            </div>

            <div>
              <Label htmlFor="sell-unit" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.unit")}
              </Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="sell-unit" className="mt-2 min-h-tap text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((value) => (
                    <SelectItem key={value} value={value} className="min-h-tap">
                      {unitLabel(t, value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sell-price" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.basePrice", { unit: unitLabelText })}
              </Label>
              <Input
                id="sell-price"
                inputMode="decimal"
                dir="ltr"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value.replace(/[^\d.]/g, ""))}
                className="mt-2 min-h-tap text-start text-base"
              />
              {Number(basePrice) > 0 ? (
                <p className="force-ltr mt-1 text-xs leading-[1.8] text-muted-foreground">
                  {formatCurrency(Number(basePrice))} / {unitLabelText}
                </p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="sell-min-price" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.minPrice")}{" "}
                <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
              </Label>
              <Input
                id="sell-min-price"
                inputMode="decimal"
                dir="ltr"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value.replace(/[^\d.]/g, ""))}
                className="mt-2 min-h-tap text-start text-base"
              />
            </div>
          </div>

          <label className="flex min-h-tap items-center gap-3">
            <Checkbox checked={negotiable} onCheckedChange={(value) => setNegotiable(value === true)} />
            <span className={`text-body-sm leading-[1.7] ${scriptClass}`}>{t("marketplace.negotiable")}</span>
          </label>
        </CardContent>
      </Card>

      {/* -- quality --------------------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className={`text-lg font-semibold leading-[1.7] ${scriptClass}`}>{t("marketplace.quality")}</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sell-grade" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.grade")}
              </Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger id="sell-grade" className="mt-2 min-h-tap text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADES.map((value) => (
                    <SelectItem key={value} value={value} className="min-h-tap">
                      {t("marketplace.gradeValue", { grade: value })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sell-harvest" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.harvestDate")}
              </Label>
              <Input
                id="sell-harvest"
                type="date"
                dir="ltr"
                max={today}
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
                className="mt-2 min-h-tap text-start text-base"
              />
            </div>
          </div>

          <label className="flex min-h-tap items-center gap-3">
            <Checkbox checked={organic} onCheckedChange={(value) => setOrganic(value === true)} />
            <span className={`text-body-sm leading-[1.7] ${scriptClass}`}>{t("marketplace.organicCertified")}</span>
          </label>
        </CardContent>
      </Card>

      {/* -- location -------------------------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className={`flex items-center gap-2 text-lg font-semibold leading-[1.7] ${scriptClass}`}>
            <MapPin className="size-5 text-primary" aria-hidden="true" />
            {t("marketplace.location")}
          </h2>

          <div>
            <Label htmlFor="sell-address" className="text-sm font-semibold leading-[1.7]">
              {t("marketplace.farmAddress")}
            </Label>
            <Input
              id="sell-address"
              placeholder={t("marketplace.farmAddressPlaceholder")}
              value={farmAddress}
              onChange={(e) => setFarmAddress(e.target.value)}
              className="mt-2 min-h-tap text-base"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sell-province" className="text-sm font-semibold leading-[1.7]">
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
                <SelectTrigger id="sell-province" className="mt-2 min-h-tap text-base">
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
              <Label htmlFor="sell-district" className="text-sm font-semibold leading-[1.7]">
                {t("auth.district")}
              </Label>
              <Select value={districtValue} onValueChange={setDistrict} disabled={!province}>
                <SelectTrigger id="sell-district" className="mt-2 min-h-tap text-base">
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
              <Label htmlFor="sell-village" className="text-sm font-semibold leading-[1.7]">
                {t("auth.villageOrTown")}
              </Label>
              <Input
                id="sell-village"
                placeholder={t("auth.villagePlaceholder")}
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                className="mt-2 min-h-tap text-base"
              />
            </div>

            <div>
              <Label htmlFor="sell-postcode" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.postalCode")}
              </Label>
              <Input
                id="sell-postcode"
                inputMode="numeric"
                dir="ltr"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                className="mt-2 min-h-tap text-start text-base"
              />
              <p className={`mt-1 text-xs leading-[1.8] text-muted-foreground ${scriptClass}`}>
                {t("marketplace.postalCodeHint")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* -- availability + delivery ----------------------------------------- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className={`text-lg font-semibold leading-[1.7] ${scriptClass}`}>
            {t("marketplace.availableWindow")}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sell-from" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.availableFrom")}
              </Label>
              <Input
                id="sell-from"
                type="date"
                dir="ltr"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="mt-2 min-h-tap text-start text-base"
              />
            </div>

            <div>
              <Label htmlFor="sell-till" className="text-sm font-semibold leading-[1.7]">
                {t("marketplace.availableTill")}
              </Label>
              <Input
                id="sell-till"
                type="date"
                dir="ltr"
                min={availableFrom}
                value={availableTill}
                onChange={(e) => setAvailableTill(e.target.value)}
                className="mt-2 min-h-tap text-start text-base"
              />
            </div>
          </div>

          <h3 className={`text-body-sm font-semibold leading-[1.7] ${scriptClass}`}>
            {t("marketplace.deliveryOptions")}
          </h3>
          <label className="flex min-h-tap items-center gap-3">
            <Checkbox checked={farmPickup} onCheckedChange={(value) => setFarmPickup(value === true)} />
            <span className={`text-body-sm leading-[1.7] ${scriptClass}`}>{t("marketplace.farmPickup")}</span>
          </label>
          <label className="flex min-h-tap items-center gap-3">
            <Checkbox checked={homeDelivery} onCheckedChange={(value) => setHomeDelivery(value === true)} />
            <span className={`text-body-sm leading-[1.7] ${scriptClass}`}>{t("marketplace.homeDelivery")}</span>
          </label>
        </CardContent>
      </Card>

      {error ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className={`text-body-sm leading-[1.7] text-foreground ${scriptClass}`}>{error}</p>
        </div>
      ) : null}

      <Button className="min-h-tap w-full gap-2" disabled={submitting} onClick={publish}>
        {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        <span className={scriptClass}>
          {submitting ? t("marketplace.publishing") : t("marketplace.publishListing")}
        </span>
      </Button>
    </div>
  )
}
