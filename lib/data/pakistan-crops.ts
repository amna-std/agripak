/**
 * Canonical Pakistani crop list.
 *
 * Single source of truth for crop keys used across the market, marketplace and
 * advisory APIs. Keys are stable slugs — never rename one without a migration.
 *
 * Seasons follow the Pakistani cropping calendar:
 *   rabi      — sown Oct/Nov, harvested Mar/Apr (wheat, chickpea, mustard, potato)
 *   kharif    — sown Apr/Jun, harvested Sep/Nov (rice, cotton, maize, sugarcane)
 *   perennial — orchards / year-round (mango, kinnow, dates, sugarcane ratoon)
 */

export type CropSeason = "rabi" | "kharif" | "perennial"

/** Trading unit. `quintal` = 100 kg, which is exactly how AMIS quotes mandi prices. */
export type CropUnit = "quintal" | "kg" | "ton" | "maund" | "pieces" | "dozen"

export interface PakistanCrop {
  /** Stable slug used as the primary key everywhere. */
  key: string
  /** English display name. */
  en: string
  /** Urdu display name. */
  ur: string
  season: CropSeason
  /** Default trading unit for price quotes. */
  unit: CropUnit
  /** Broad grouping, aligned with the CropListing `category` enum. */
  category: "grains" | "pulses" | "cash_crops" | "vegetables" | "fruits" | "spices"
  /**
   * Lower-cased substrings that identify this crop in an AMIS commodity label.
   * Matched longest-first, so more specific aliases win.
   */
  amisAliases: string[]
  /**
   * Labels that contain an alias but are a *different* commodity — "Wheat Straw"
   * is fodder, not wheat; "Gram Flour" is besan, not chickpea. Without these the
   * by-product would be filed (and priced) as the crop itself.
   */
  excludeAliases?: string[]
}

export const PAKISTAN_CROPS: PakistanCrop[] = [
  {
    key: "wheat",
    en: "Wheat",
    ur: "گندم",
    season: "rabi",
    unit: "quintal",
    category: "grains",
    amisAliases: ["wheat"],
    // Wheat straw (toori) is fodder and trades at a fraction of grain prices.
    excludeAliases: ["wheat straw"],
  },
  {
    key: "rice-basmati",
    en: "Rice (Basmati)",
    ur: "باسمتی چاول",
    season: "kharif",
    unit: "quintal",
    category: "grains",
    // Paddy is unhusked and trades separately — see the `paddy-*` keys below.
    amisAliases: ["rice basmati", "rice kainat", "basmati"],
  },
  {
    key: "rice-irri",
    en: "Rice (IRRI)",
    ur: "اری چاول",
    season: "kharif",
    unit: "quintal",
    category: "grains",
    amisAliases: ["rice (irri)", "irri"],
  },
  {
    key: "cotton",
    en: "Cotton",
    ur: "کپاس",
    season: "kharif",
    unit: "maund",
    category: "cash_crops",
    amisAliases: ["seed cotton", "phutti", "cotton"],
    // Banola (cottonseed) and banola cake are by-products, not lint.
    excludeAliases: ["banola"],
  },
  {
    key: "sugarcane",
    en: "Sugarcane",
    ur: "گنا",
    season: "perennial",
    unit: "ton",
    category: "cash_crops",
    // Gur/shakar (jaggery, brown sugar) and refined sugar are processed goods
    // with their own price series; they stay unmapped rather than distorting
    // the cane price.
    amisAliases: ["sugarcane"],
  },
  {
    key: "maize",
    en: "Maize",
    ur: "مکئی",
    season: "kharif",
    unit: "quintal",
    category: "grains",
    amisAliases: ["maize"],
  },
  {
    key: "potato",
    en: "Potato",
    ur: "آلو",
    season: "rabi",
    unit: "quintal",
    category: "vegetables",
    amisAliases: ["potato"],
    // Shakarqandi is a different tuber with its own price line.
    excludeAliases: ["sweet potato"],
  },
  {
    key: "onion",
    en: "Onion",
    ur: "پیاز",
    season: "rabi",
    unit: "quintal",
    category: "vegetables",
    amisAliases: ["onion"],
    // Scallions are sold by the bunch, not as bulb onions.
    excludeAliases: ["green onion"],
  },
  {
    key: "tomato",
    en: "Tomato",
    ur: "ٹماٹر",
    season: "kharif",
    unit: "quintal",
    category: "vegetables",
    amisAliases: ["tomato"],
  },
  {
    key: "chickpea",
    en: "Chickpea (Chana)",
    ur: "چنا",
    season: "rabi",
    unit: "quintal",
    category: "pulses",
    // "Gram" is the everyday Pakistani/AMIS word for chickpea, so it has to
    // resolve on its own — otherwise a farmer searching "gram" matches only
    // "Gram Flour" (besan) and never sees the pulse itself.
    amisAliases: ["gram white", "gram black", "gram pulse", "green chickpeas", "chickpea", "chana", "gram"],
    // Besan (gram flour) is milled, not the pulse.
    excludeAliases: ["gram flour"],
  },
  {
    key: "mustard",
    en: "Mustard",
    ur: "سرسوں",
    season: "rabi",
    unit: "quintal",
    category: "cash_crops",
    amisAliases: ["mustard seed", "rapeseed", "torya"],
    // Saag sarson is a leaf vegetable sold by the bunch.
    excludeAliases: ["mustard greens"],
  },
  {
    key: "mango",
    en: "Mango",
    ur: "آم",
    season: "perennial",
    unit: "quintal",
    category: "fruits",
    amisAliases: ["mango"],
  },
  {
    key: "kinnow",
    en: "Kinnow",
    ur: "کینو",
    season: "perennial",
    unit: "pieces",
    category: "fruits",
    // Musambi, malta and grapefruit are separate citrus lines with their own
    // prices, so they are deliberately not folded into kinnow.
    amisAliases: ["kinnow"],
  },
  {
    key: "dates",
    en: "Dates",
    ur: "کھجور",
    season: "perennial",
    unit: "kg",
    category: "fruits",
    amisAliases: ["dates"],
  },
]

/** Extra crops AMIS quotes that are not headline crops but are worth resolving. */
export const SECONDARY_CROPS: PakistanCrop[] = [
  {
    key: "moong",
    en: "Moong",
    ur: "مونگ",
    season: "kharif",
    unit: "quintal",
    category: "pulses",
    amisAliases: ["moong"],
  },
  {
    key: "mash",
    en: "Mash",
    ur: "ماش",
    season: "kharif",
    unit: "quintal",
    category: "pulses",
    amisAliases: ["mash"],
  },
  {
    key: "masoor",
    en: "Masoor",
    ur: "مسور",
    season: "rabi",
    unit: "quintal",
    category: "pulses",
    amisAliases: ["masoor"],
  },
  {
    key: "garlic",
    en: "Garlic",
    ur: "لہسن",
    season: "rabi",
    unit: "quintal",
    category: "vegetables",
    amisAliases: ["garlic"],
  },
  {
    key: "red-chilli",
    en: "Red Chilli",
    ur: "لال مرچ",
    season: "kharif",
    unit: "quintal",
    category: "spices",
    amisAliases: ["red chilli"],
  },
  {
    key: "green-chilli",
    en: "Green Chilli",
    ur: "ہری مرچ",
    season: "kharif",
    unit: "quintal",
    category: "vegetables",
    amisAliases: ["green chilli"],
  },
  {
    key: "paddy-basmati",
    en: "Paddy (Basmati)",
    ur: "باسمتی دھان",
    season: "kharif",
    unit: "quintal",
    category: "grains",
    amisAliases: ["paddy basmati", "paddy kainat"],
  },
  {
    key: "paddy-irri",
    en: "Paddy (IRRI)",
    ur: "اری دھان",
    season: "kharif",
    unit: "quintal",
    category: "grains",
    amisAliases: ["paddy (irri)"],
  },
  {
    key: "cottonseed",
    en: "Cottonseed (Banola)",
    ur: "بنولہ",
    season: "kharif",
    unit: "quintal",
    category: "cash_crops",
    amisAliases: ["banola"],
    // Banola cake (khal) is a pressed feed by-product, not the seed.
    excludeAliases: ["banola cake"],
  },
  {
    key: "sweet-potato",
    en: "Sweet Potato",
    ur: "شکر قندی",
    season: "kharif",
    unit: "quintal",
    category: "vegetables",
    amisAliases: ["sweet potato"],
  },
  {
    key: "green-onion",
    en: "Green Onion",
    ur: "ہرا پیاز",
    season: "rabi",
    unit: "quintal",
    category: "vegetables",
    amisAliases: ["green onion"],
  },
  {
    key: "canola",
    en: "Canola",
    ur: "کینولا",
    season: "rabi",
    unit: "quintal",
    category: "cash_crops",
    amisAliases: ["canola"],
  },
  {
    key: "jaggery",
    en: "Jaggery (Gur)",
    ur: "گڑ",
    season: "perennial",
    unit: "quintal",
    category: "cash_crops",
    amisAliases: ["jaggery", "brown sugar"],
  },
  {
    key: "sunflower",
    en: "Sunflower",
    ur: "سورج مکھی",
    season: "rabi",
    unit: "quintal",
    category: "cash_crops",
    amisAliases: ["sunflower"],
  },
  {
    key: "millet",
    en: "Millet (Bajra)",
    ur: "باجرہ",
    season: "kharif",
    unit: "quintal",
    category: "grains",
    amisAliases: ["millet"],
  },
  {
    key: "sorghum",
    en: "Sorghum (Jowar)",
    ur: "جوار",
    season: "kharif",
    unit: "quintal",
    category: "grains",
    amisAliases: ["sorghum"],
  },
  {
    key: "barley",
    en: "Barley",
    ur: "جو",
    season: "rabi",
    unit: "quintal",
    category: "grains",
    amisAliases: ["barley"],
  },
  {
    key: "groundnut",
    en: "Groundnut",
    ur: "مونگ پھلی",
    season: "kharif",
    unit: "quintal",
    category: "cash_crops",
    amisAliases: ["groundnut"],
  },
]

export const ALL_CROPS: PakistanCrop[] = [...PAKISTAN_CROPS, ...SECONDARY_CROPS]

const BY_KEY = new Map(ALL_CROPS.map((c) => [c.key, c]))

/**
 * Flattens punctuation so labels written in different house styles collapse to
 * the same token stream: `"Rice (Basmati)"`, `"rice-basmati"` and
 * `"Rice Basmati Super (New)"` all start with `rice basmati`.
 */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * An alias must start at a word boundary, so "kilogram" is not chickpea and
 * "diagram" is not gram. A trailing suffix is still allowed, so the plural a
 * user actually types ("onions", "dates") keeps resolving.
 */
function boundaryMatch(needle: string, alias: string): boolean {
  let from = 0
  for (;;) {
    const at = needle.indexOf(alias, from)
    if (at < 0) return false
    if (at === 0 || needle[at - 1] === " ") return true
    from = at + 1
  }
}

/** Aliases sorted longest-first so "rice basmati" beats a bare "rice". */
const ALIAS_INDEX: Array<{ alias: string; crop: PakistanCrop }> = ALL_CROPS.flatMap((crop) =>
  // The key and English name are matchable too, so a value this module emitted
  // (e.g. a stored `cropName`) round-trips back to the same crop.
  Array.from(new Set([...crop.amisAliases, crop.key, crop.en].map(normalise))).map((alias) => ({
    alias,
    crop,
  })),
).sort((a, b) => b.alias.length - a.alias.length)

export function getCrop(key: string): PakistanCrop | undefined {
  return BY_KEY.get(key)
}

/**
 * Resolves a crop label — a raw AMIS commodity name, a canonical key, or a
 * user-typed crop — to a canonical crop. Returns `undefined` for anything we
 * don't track; callers should keep the raw label rather than guessing.
 */
export function resolveCrop(rawLabel: string): PakistanCrop | undefined {
  const needle = normalise(rawLabel)
  if (!needle) return undefined
  return ALIAS_INDEX.find(
    (entry) =>
      boundaryMatch(needle, entry.alias) &&
      !entry.crop.excludeAliases?.some((bad) => boundaryMatch(needle, normalise(bad))),
  )?.crop
}

/** Rabi (Nov–Apr) or Kharif (May–Oct) for a given date. */
export function currentSeason(date = new Date()): Exclude<CropSeason, "perennial"> {
  const month = date.getMonth() + 1 // 1-12
  return month >= 11 || month <= 4 ? "rabi" : "kharif"
}

export function cropsInSeason(season = currentSeason()): PakistanCrop[] {
  return ALL_CROPS.filter((c) => c.season === season || c.season === "perennial")
}
