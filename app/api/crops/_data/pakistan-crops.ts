/**
 * Pakistani crop catalogue — agronomic reference content for the crop advisor.
 *
 * `_data` is a Next.js private folder, so nothing in here is routable.
 *
 * Scope: nationwide. Every crop carries the sowing/harvest windows that are
 * actually used in Pakistan (Rabi = Nov–Apr, Kharif = May–Oct) broken down by
 * region, because a Sindh wheat farmer sows six weeks after a Pothohar one.
 *
 * Honesty rules (see AGENT_CONTRACT.md):
 *  - Agronomy here is standard provincial-extension guidance, not live data.
 *    Every crop exposes `advisory` telling the farmer to confirm locally.
 *  - No fabricated rupee figures. Cost/price are qualitative only; live prices
 *    come from the market-price API (AMIS), never from this file.
 */

import type { Province } from "../../auth/_lib/pakistan"

/* ------------------------------------------------------------------- types */

export type CropSeason = "rabi" | "kharif" | "perennial"
export type CropCategory = "cereal" | "pulse" | "oilseed" | "cash-crop" | "vegetable" | "fruit" | "fodder"
export type Level = "low" | "medium" | "high" | "very-high"

/** Matches the `soilType` enum on the User model so profiles can be scored. */
export type SoilType = "clay" | "sandy" | "loamy" | "black" | "red" | "alluvial" | "laterite" | "saline" | "acidic"

export interface CropWindow {
  /** Human label for the region this window applies to. */
  region: string
  regionUr: string
  provinces: Province[]
  sowing: { from: string; to: string; months: number[] }
  harvest: { from: string; to: string; months: number[] }
  note?: string
}

export interface CropIssue {
  name: string
  nameUr: string
  symptoms: string[]
  management: string[]
}

export interface Crop {
  id: string
  name: string
  nameUr: string
  otherNames: string[]
  category: CropCategory
  season: CropSeason
  summary: string
  summaryUr: string
  durationDays: { min: number; max: number }
  provinces: Province[]
  /** Ids from `PAKISTAN_AGRO_ZONES`. */
  zones: string[]
  windows: CropWindow[]
  soils: SoilType[]
  soilNote: string
  climate: {
    temperature: { min: number; max: number; optimal: number }
    rainfallMm?: { min: number; max: number }
  }
  water: {
    requirement: Level
    irrigations: { min: number; max: number }
    criticalStages: string[]
  }
  seedRate: string
  spacing: string
  varieties: string[]
  fertiliser: Array<{ name: string; dose: string; timing: string }>
  expectedYield: { min: number; max: number; unit: string; note?: string }
  pests: CropIssue[]
  diseases: CropIssue[]
  practices: string[]
  postHarvest: string[]
  marketDemand: Level
  profitability: Level
  riskFactor: "low" | "medium" | "high"
  /** Deliberately qualitative — see the honesty rules at the top of the file. */
  economics: { costLevel: Level; note: string; source: "sample" }
}

export interface AgroZone {
  id: string
  name: string
  nameUr: string
  provinces: Province[]
  districts: string[]
  mainCrops: string[]
  description: string
}

/* --------------------------------------------------------------- constants */

export const SEASONS: Array<{
  id: CropSeason
  name: string
  nameUr: string
  months: number[]
  window: string
}> = [
  { id: "rabi", name: "Rabi", nameUr: "ربیع", months: [11, 12, 1, 2, 3, 4], window: "November – April" },
  { id: "kharif", name: "Kharif", nameUr: "خریف", months: [5, 6, 7, 8, 9, 10], window: "May – October" },
  { id: "perennial", name: "Perennial / Orchard", nameUr: "سدا بہار / باغات", months: [], window: "Year-round" },
]

export const CROP_CATEGORIES: Array<{ id: CropCategory; name: string; nameUr: string }> = [
  { id: "cereal", name: "Cereals", nameUr: "اناج" },
  { id: "pulse", name: "Pulses", nameUr: "دالیں" },
  { id: "oilseed", name: "Oilseeds", nameUr: "تیلدار اجناس" },
  { id: "cash-crop", name: "Cash Crops", nameUr: "نقد آور فصلیں" },
  { id: "vegetable", name: "Vegetables", nameUr: "سبزیاں" },
  { id: "fruit", name: "Fruit & Orchards", nameUr: "پھل اور باغات" },
  { id: "fodder", name: "Fodder", nameUr: "چارہ" },
]

/** Pakistan's agro-climatic zones, nationwide. */
export const PAKISTAN_AGRO_ZONES: AgroZone[] = [
  {
    id: "punjab-rice-wheat",
    name: "Punjab Rice–Wheat Belt",
    nameUr: "پنجاب چاول گندم پٹی",
    provinces: ["Punjab"],
    districts: ["Sheikhupura", "Gujranwala", "Sialkot", "Hafizabad", "Narowal", "Nankana Sahib", "Lahore", "Kasur"],
    mainCrops: ["rice-basmati", "wheat", "sugarcane", "maize", "potato"],
    description:
      "The Kalar tract and surrounding canal-irrigated plains. Heavy soils that hold water — the home of Pakistani Basmati, rotated with wheat.",
  },
  {
    id: "punjab-mixed",
    name: "Punjab Mixed Cropping Zone",
    nameUr: "پنجاب مخلوط کاشت زون",
    provinces: ["Punjab"],
    districts: ["Faisalabad", "Sargodha", "Toba Tek Singh", "Jhang", "Chiniot", "Khushab", "Sahiwal", "Okara"],
    mainCrops: ["wheat", "sugarcane", "maize", "citrus-kinnow", "potato"],
    description:
      "Central Punjab's diversified canal belt — wheat and sugarcane with the Sargodha–Bhalwal kinnow orchards and the Okara–Sahiwal potato tract.",
  },
  {
    id: "punjab-cotton-wheat",
    name: "South Punjab Cotton–Wheat Belt",
    nameUr: "جنوبی پنجاب کپاس گندم پٹی",
    provinces: ["Punjab"],
    districts: [
      "Multan",
      "Bahawalpur",
      "Rahim Yar Khan",
      "Vehari",
      "Lodhran",
      "Khanewal",
      "Bahawalnagar",
      "Muzaffargarh",
      "Dera Ghazi Khan",
    ],
    mainCrops: ["cotton", "wheat", "sugarcane", "mango", "mung-bean"],
    description:
      "Hot, arid canal-irrigated plains. Cotton in Kharif followed by wheat in Rabi, plus Pakistan's biggest mango orchards.",
  },
  {
    id: "punjab-barani",
    name: "Pothohar Rainfed (Barani) Zone",
    nameUr: "پوٹھوہار بارانی علاقہ",
    provinces: ["Punjab", "Islamabad Capital Territory"],
    districts: ["Rawalpindi", "Attock", "Chakwal", "Jhelum", "Islamabad"],
    mainCrops: ["wheat", "chickpea", "mustard", "lentil"],
    description:
      "Rain-dependent uplands with no canal cover. Moisture conservation decides the crop — low-water Rabi crops dominate.",
  },
  {
    id: "thal-cholistan",
    name: "Thal & Cholistan Desert Margin",
    nameUr: "تھل و چولستان",
    provinces: ["Punjab"],
    districts: ["Bhakkar", "Layyah", "Mianwali", "Khushab", "Bahawalpur (Cholistan)"],
    mainCrops: ["chickpea", "mung-bean", "wheat", "mustard"],
    description:
      "Sandy desert margin. Thal is Pakistan's main gram (chana) tract; cropping follows winter rain and tubewell water.",
  },
  {
    id: "sindh-rice",
    name: "Northern Sindh Rice Zone",
    nameUr: "شمالی سندھ چاول زون",
    provinces: ["Sindh"],
    districts: ["Larkana", "Shikarpur", "Jacobabad", "Kashmore", "Qambar Shahdadkot", "Dadu"],
    mainCrops: ["rice-irri", "wheat", "sugarcane"],
    description:
      "Flood-irrigated heavy clay along the right bank of the Indus — coarse IRRI paddy in Kharif, wheat in Rabi.",
  },
  {
    id: "sindh-sugarcane-cotton",
    name: "Central & Lower Sindh Sugarcane–Cotton Zone",
    nameUr: "وسطی و زیریں سندھ گنا کپاس زون",
    provinces: ["Sindh"],
    districts: [
      "Hyderabad",
      "Tando Allahyar",
      "Matiari",
      "Shaheed Benazirabad",
      "Sanghar",
      "Mirpurkhas",
      "Thatta",
      "Badin",
      "Sukkur",
      "Khairpur",
    ],
    mainCrops: ["sugarcane", "cotton", "wheat", "onion", "mango", "dates"],
    description:
      "Sindh's core irrigated belt. Sugarcane and cotton with Mirpurkhas–Tando Allahyar mangoes and the Khairpur date gardens.",
  },
  {
    id: "kpk-maize-plains",
    name: "KPK Maize & Sugarcane Plains",
    nameUr: "خیبر پختونخوا مکئی و گنا کے میدان",
    provinces: ["Khyber Pakhtunkhwa"],
    districts: ["Peshawar", "Mardan", "Charsadda", "Swabi", "Nowshera", "Dera Ismail Khan"],
    mainCrops: ["maize", "sugarcane", "wheat", "chickpea"],
    description:
      "The Peshawar valley and DI Khan plains. Maize is the signature Kharif crop; sugarcane feeds the local mills.",
  },
  {
    id: "kpk-orchards",
    name: "KPK Hill Orchards",
    nameUr: "خیبر پختونخوا پہاڑی باغات",
    provinces: ["Khyber Pakhtunkhwa"],
    districts: ["Swat", "Dir", "Chitral", "Mansehra", "Abbottabad", "Buner"],
    mainCrops: ["maize", "potato", "citrus-kinnow"],
    description:
      "Cool valleys growing temperate fruit (apple, apricot, persimmon, peach) alongside summer maize and off-season potato.",
  },
  {
    id: "balochistan-uplands",
    name: "Balochistan Upland Orchard Belt",
    nameUr: "بلوچستان بالائی باغات",
    provinces: ["Balochistan"],
    districts: ["Quetta", "Pishin", "Killa Saifullah", "Ziarat", "Mastung", "Kalat", "Loralai"],
    mainCrops: ["onion", "potato", "wheat"],
    description:
      "High, dry plateaus with cold winters — apples, grapes, apricots, almonds and cumin, plus off-season onion and potato.",
  },
  {
    id: "balochistan-arid",
    name: "Balochistan Date & Arid Plains",
    nameUr: "بلوچستان کھجور و خشک میدان",
    provinces: ["Balochistan"],
    districts: ["Kech (Turbat)", "Panjgur", "Khuzdar", "Lasbela", "Nasirabad", "Jaffarabad"],
    mainCrops: ["dates", "wheat", "rice-irri", "onion"],
    description:
      "Makran's date palm groves and the canal-fed Nasirabad plain, Balochistan's only large rice–wheat area.",
  },
  {
    id: "gb-ajk-valleys",
    name: "Gilgit-Baltistan & AJK Mountain Valleys",
    nameUr: "گلگت بلتستان و آزاد کشمیر کی وادیاں",
    provinces: ["Gilgit-Baltistan", "Azad Jammu & Kashmir"],
    districts: ["Gilgit", "Skardu", "Hunza", "Ghizer", "Muzaffarabad", "Mirpur", "Bagh"],
    mainCrops: ["wheat", "maize", "potato"],
    description:
      "Short single-season valleys. Apricot, apple and cherry orchards with seed-grade potato and valley-floor wheat and maize.",
  },
]

/* ------------------------------------------------------------------- crops */

const ADVISORY =
  "General guidance based on standard Pakistani provincial extension practice. Confirm seed rate, fertiliser dose and pesticide choice with your district Agriculture Extension office and a soil test before spending money."

export const ADVISORY_NOTE = ADVISORY

const SAMPLE_ECONOMICS = (costLevel: Level) => ({
  costLevel,
  note: "Per-acre cost of production and farm-gate price move with district, input prices and mandi rates. Check the live market prices section rather than relying on a fixed figure.",
  source: "sample" as const,
})

export const PAKISTAN_CROPS: Crop[] = [
  /* ------------------------------------------------------------------ RABI */
  {
    id: "wheat",
    name: "Wheat",
    nameUr: "گندم",
    otherNames: ["Kanak", "Gandum"],
    category: "cereal",
    season: "rabi",
    summary:
      "Pakistan's staple and the single largest Rabi crop, grown in every province. Sowing on time is the biggest yield decision you make — every week of delay after mid-December costs grain.",
    summaryUr:
      "پاکستان کی بنیادی فصل اور ربیع کی سب سے بڑی فصل، جو ہر صوبے میں کاشت ہوتی ہے۔ بروقت کاشت سب سے اہم ہے؛ دسمبر کے وسط کے بعد ہر ہفتے کی تاخیر پیداوار کم کرتی ہے۔",
    durationDays: { min: 130, max: 160 },
    provinces: [
      "Punjab",
      "Sindh",
      "Khyber Pakhtunkhwa",
      "Balochistan",
      "Azad Jammu & Kashmir",
      "Gilgit-Baltistan",
      "Islamabad Capital Territory",
    ],
    zones: [
      "punjab-rice-wheat",
      "punjab-mixed",
      "punjab-cotton-wheat",
      "punjab-barani",
      "thal-cholistan",
      "sindh-rice",
      "sindh-sugarcane-cotton",
      "kpk-maize-plains",
      "balochistan-arid",
      "gb-ajk-valleys",
    ],
    windows: [
      {
        region: "Punjab & KPK (irrigated)",
        regionUr: "پنجاب و خیبر پختونخوا (نہری)",
        provinces: ["Punjab", "Khyber Pakhtunkhwa", "Islamabad Capital Territory"],
        sowing: { from: "1 November", to: "10 December", months: [11, 12] },
        harvest: { from: "Mid April", to: "Mid May", months: [4, 5] },
        note: "Optimum window is 1–20 November. After cotton or rice, sow as soon as the field is cleared.",
      },
      {
        region: "Pothohar (rainfed / barani)",
        regionUr: "پوٹھوہار (بارانی)",
        provinces: ["Punjab", "Islamabad Capital Territory"],
        sowing: { from: "15 October", to: "15 November", months: [10, 11] },
        harvest: { from: "April", to: "May", months: [4, 5] },
        note: "Sow into the first useful autumn rain; conserve moisture with early ploughing.",
      },
      {
        region: "Sindh & Balochistan plains",
        regionUr: "سندھ و بلوچستان کے میدان",
        provinces: ["Sindh", "Balochistan"],
        sowing: { from: "1 November", to: "31 December", months: [11, 12] },
        harvest: { from: "March", to: "Mid April", months: [3, 4] },
        note: "Lower Sindh sows latest and harvests first — usually the country's earliest wheat.",
      },
      {
        region: "Northern valleys (GB / AJK / upper KPK)",
        regionUr: "شمالی وادیاں",
        provinces: ["Gilgit-Baltistan", "Azad Jammu & Kashmir", "Khyber Pakhtunkhwa"],
        sowing: { from: "October", to: "November", months: [10, 11] },
        harvest: { from: "June", to: "July", months: [6, 7] },
        note: "Cold valleys run a longer season; single crop per year in high Gilgit-Baltistan.",
      },
    ],
    soils: ["loamy", "clay", "alluvial", "sandy"],
    soilNote: "Best on well-drained loam and clay-loam. Sandy soils need split nitrogen and extra irrigations.",
    climate: { temperature: { min: 10, max: 32, optimal: 21 }, rainfallMm: { min: 250, max: 600 } },
    water: {
      requirement: "medium",
      irrigations: { min: 4, max: 6 },
      criticalStages: [
        "Crown root initiation (20–25 days after sowing)",
        "Tillering (40–45 days)",
        "Booting / jointing (65–75 days)",
        "Heading and flowering (90–100 days)",
        "Grain filling / milking (110–120 days)",
      ],
    },
    seedRate: "45–50 kg/acre for timely sowing; raise to 55–60 kg/acre for late sowing after mid-December",
    spacing: "Drill in rows 22–23 cm (9 inches) apart, seed 4–5 cm deep",
    varieties: [
      "Akbar-2019",
      "Dilkash-2020",
      "Ghazi-2019",
      "Subhani-2021",
      "Anaj-2017",
      "Nawab-2021 (Sindh)",
      "Benazir-2013 (Sindh)",
      "Pirsabak-2019 (KPK)",
    ],
    fertiliser: [
      { name: "DAP", dose: "1–2 bags (50–100 kg) per acre", timing: "Broadcast and incorporate at sowing" },
      {
        name: "Urea",
        dose: "2–2.5 bags (100–125 kg) per acre, split",
        timing: "Half with first irrigation, half with second irrigation",
      },
      { name: "SOP / MOP (potash)", dose: "25–50 kg per acre where soil test shows deficiency", timing: "At sowing" },
      { name: "Zinc sulphate", dose: "5 kg per acre on rice–wheat soils", timing: "At sowing" },
    ],
    expectedYield: {
      min: 35,
      max: 55,
      unit: "maund/acre",
      note: "Irrigated, timely-sown crop. Rainfed Pothohar typically 12–20 maund/acre. 1 maund = 40 kg.",
    },
    pests: [
      {
        name: "Aphid (Aphis / Sitobion)",
        nameUr: "تیلا",
        symptoms: [
          "Colonies of small green-black insects on leaves and ears",
          "Sticky honeydew and sooty mould on the flag leaf",
          "Shrivelled grain in a heavily infested crop",
        ],
        management: [
          "Do not spray while ladybird beetles are active — they usually clean up the field",
          "Spray only if aphids cross the local threshold on the ear at grain filling",
          "Avoid excessive nitrogen, which pushes soft growth aphids prefer",
        ],
      },
      {
        name: "Armyworm",
        nameUr: "آرمی ورم",
        symptoms: ["Leaves chewed from the margins overnight", "Larvae hiding in cracks and under clods by day"],
        management: [
          "Scout at dusk when larvae feed",
          "Flood-irrigate to force larvae out, then treat the field edges",
          "Use a recommended insecticide only when damage is spreading",
        ],
      },
    ],
    diseases: [
      {
        name: "Yellow (stripe) rust",
        nameUr: "پیلی کنگی",
        symptoms: [
          "Yellow powdery stripes in lines along the leaf veins",
          "Rubbing a leaf leaves yellow dust on the finger",
          "Spreads fastest in cool, humid February weather",
        ],
        management: [
          "Grow a rust-resistant variety notified for your district — this is the main control",
          "Scout weekly from January and report early foci to Extension staff",
          "Apply a recommended triazole/strobilurin fungicide at first sign, before flag leaf infection",
        ],
      },
      {
        name: "Loose smut",
        nameUr: "کانگیاری",
        symptoms: ["Ears emerge as a black powdery mass instead of grain", "Only bare rachis left after the spores blow away"],
        management: [
          "Use certified, treated seed",
          "Treat seed with a systemic fungicide before sowing",
          "Rogue out and bag smutted ears before they shed spores",
        ],
      },
      {
        name: "Karnal bunt",
        nameUr: "کرنال بنٹ",
        symptoms: ["Partly blackened grain with a fishy smell", "Worst in cool, damp weather at heading"],
        management: [
          "Use clean certified seed and resistant varieties",
          "Avoid excess irrigation at heading",
          "Keep affected grain out of the seed chain",
        ],
      },
    ],
    practices: [
      "Prepare a fine, level seedbed — laser levelling saves both water and seed",
      "Sow with a drill or happy seeder rather than broadcasting; it cuts seed use and evens the stand",
      "Control wild oat (jangli jai) and Phalaris minor (dumbi sitti) with a recommended herbicide 25–30 days after sowing",
      "Never skip the first irrigation at crown root initiation — it sets the tiller count",
      "Stop irrigation about 10–15 days before harvest so the field can carry machinery",
    ],
    postHarvest: [
      "Harvest at 12–14% grain moisture; over-dry grain shatters",
      "Dry on a clean pucca floor or tarpaulin, never bare soil",
      "Store in dry, fumigated bins or PICS-type hermetic bags to stop khapra beetle and weevil",
      "Compare mandi rates and the announced support price before selling",
    ],
    marketDemand: "very-high",
    profitability: "medium",
    riskFactor: "low",
    economics: SAMPLE_ECONOMICS("medium"),
  },
  {
    id: "chickpea",
    name: "Chickpea (Gram)",
    nameUr: "چنا",
    otherNames: ["Chana", "Gram", "Chholay"],
    category: "pulse",
    season: "rabi",
    summary:
      "Pakistan's most important pulse and the backbone of the Thal desert margin. It needs very little water, fixes its own nitrogen and leaves the soil better than it found it.",
    summaryUr:
      "پاکستان کی سب سے اہم دال اور تھل کے علاقے کی بنیادی فصل۔ اسے بہت کم پانی درکار ہے، یہ خود نائٹروجن بناتی ہے اور زمین کی زرخیزی بہتر کرتی ہے۔",
    durationDays: { min: 140, max: 165 },
    provinces: ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory"],
    zones: ["thal-cholistan", "punjab-barani", "kpk-maize-plains", "punjab-cotton-wheat"],
    windows: [
      {
        region: "Thal & Cholistan (sandy, rainfed)",
        regionUr: "تھل و چولستان",
        provinces: ["Punjab"],
        sowing: { from: "1 October", to: "15 November", months: [10, 11] },
        harvest: { from: "March", to: "April", months: [3, 4] },
        note: "Sow into stored monsoon moisture — the earlier the better once soil temperature drops.",
      },
      {
        region: "Pothohar & DI Khan (barani)",
        regionUr: "پوٹھوہار و ڈیرہ اسماعیل خان",
        provinces: ["Punjab", "Khyber Pakhtunkhwa", "Islamabad Capital Territory"],
        sowing: { from: "Mid October", to: "Mid November", months: [10, 11] },
        harvest: { from: "April", to: "May", months: [4, 5] },
      },
      {
        region: "Sindh & irrigated plains",
        regionUr: "سندھ و نہری علاقے",
        provinces: ["Sindh", "Punjab", "Balochistan"],
        sowing: { from: "October", to: "November", months: [10, 11] },
        harvest: { from: "March", to: "April", months: [3, 4] },
      },
    ],
    soils: ["sandy", "loamy"],
    soilNote: "Loves light, well-drained sandy loam. Waterlogging kills it — never sow in a low, wet field.",
    climate: { temperature: { min: 10, max: 30, optimal: 22 }, rainfallMm: { min: 150, max: 400 } },
    water: {
      requirement: "low",
      irrigations: { min: 0, max: 2 },
      criticalStages: ["Branching (40–50 days)", "Flowering and pod formation (80–100 days)"],
    },
    seedRate: "30–40 kg/acre for desi types, 40–50 kg/acre for large-seeded kabuli",
    spacing: "Rows 30 cm apart, plants 10 cm within the row, seed 5–7 cm deep",
    varieties: ["Bhakkar-2011", "Thal-2006", "Punjab-2008", "Bittle-2016", "Noor-2013 (kabuli)", "CM-2008"],
    fertiliser: [
      { name: "DAP", dose: "1 bag (50 kg) per acre", timing: "All at sowing — chickpea needs P, not much N" },
      { name: "Rhizobium inoculum", dose: "Treat seed as per pack", timing: "Just before sowing, keep out of sunlight" },
      { name: "Urea", dose: "Half bag (25 kg) per acre as a starter only", timing: "At sowing; more N reduces nodulation" },
    ],
    expectedYield: { min: 8, max: 18, unit: "maund/acre", note: "Rainfed Thal crops sit at the lower end. 1 maund = 40 kg." },
    pests: [
      {
        name: "Gram pod borer (Helicoverpa armigera)",
        nameUr: "چنے کی سنڈی",
        symptoms: [
          "Round holes bored into pods with the larva's head inside",
          "Hollowed-out seeds and dropped pods",
        ],
        management: [
          "Install pheromone traps to time the spray instead of guessing",
          "Encourage birds with perches across the field",
          "Spray a recommended insecticide or NPV at early pod formation, not after the larvae are inside",
        ],
      },
      {
        name: "Cutworm",
        nameUr: "کٹ ورم",
        symptoms: ["Young seedlings cut at ground level and lying on the soil", "Larvae curled up in soil near damaged plants"],
        management: ["Deep-plough in summer to expose pupae", "Use poison bait along affected rows in the evening"],
      },
    ],
    diseases: [
      {
        name: "Ascochyta blight",
        nameUr: "اسکوکائٹا بلائٹ",
        symptoms: [
          "Brown circular lesions with dark concentric rings on leaves, stems and pods",
          "Stems break at the lesion",
          "Explodes after cloudy, drizzly weather",
        ],
        management: [
          "Grow a tolerant variety and use disease-free certified seed",
          "Treat seed with a recommended fungicide",
          "Spray at first symptoms if wet weather continues; do not enter a wet field and spread it",
        ],
      },
      {
        name: "Fusarium wilt",
        nameUr: "مرجھاؤ (وِلٹ)",
        symptoms: ["Plants wilt in patches", "Drooping from the top down", "Split stem shows dark internal discolouration"],
        management: [
          "Rotate away from chickpea for 3–4 years in affected fields",
          "Use wilt-resistant varieties",
          "Sow slightly later so seedlings escape the warm-soil infection window",
        ],
      },
    ],
    practices: [
      "Follow a summer fallow to bank moisture in barani fields",
      "Inoculate seed with Rhizobium — the cheapest yield gain available in this crop",
      "Keep the crop weed-free for the first 45 days",
      "Do not over-irrigate; extra water gives leaf, not pods",
    ],
    postHarvest: [
      "Harvest when 80% of pods turn straw-coloured; cut early morning to reduce shattering",
      "Thresh on a clean surface and dry to 9–10% moisture",
      "Store with neem leaves or in hermetic bags to keep bruchid (dhora) out",
    ],
    marketDemand: "high",
    profitability: "high",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("low"),
  },
  {
    id: "mustard",
    name: "Mustard & Rapeseed",
    nameUr: "سرسوں",
    otherNames: ["Sarson", "Raya", "Toria", "Canola"],
    category: "oilseed",
    season: "rabi",
    summary:
      "The main Rabi oilseed. Cheap to grow, tolerant of poor and slightly saline soil, and it fits into barani rotations where wheat struggles.",
    summaryUr:
      "ربیع کی بنیادی تیلدار فصل۔ کم لاگت، کمزور اور ہلکی شور زدہ زمین میں بھی کامیاب، اور بارانی علاقوں کے لیے موزوں۔",
    durationDays: { min: 120, max: 150 },
    provinces: ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory"],
    zones: ["punjab-barani", "thal-cholistan", "punjab-mixed", "sindh-sugarcane-cotton", "kpk-maize-plains"],
    windows: [
      {
        region: "Punjab & KPK",
        regionUr: "پنجاب و خیبر پختونخوا",
        provinces: ["Punjab", "Khyber Pakhtunkhwa", "Islamabad Capital Territory"],
        sowing: { from: "1 October", to: "15 November", months: [10, 11] },
        harvest: { from: "March", to: "April", months: [3, 4] },
        note: "Canola types are sown in the same window but need slightly better soil moisture.",
      },
      {
        region: "Sindh & Balochistan",
        regionUr: "سندھ و بلوچستان",
        provinces: ["Sindh", "Balochistan"],
        sowing: { from: "October", to: "November", months: [10, 11] },
        harvest: { from: "February", to: "March", months: [2, 3] },
      },
    ],
    soils: ["loamy", "sandy", "clay", "saline"],
    soilNote: "Handles marginal and mildly saline land better than most Rabi crops; still prefers a well-drained loam.",
    climate: { temperature: { min: 8, max: 30, optimal: 20 }, rainfallMm: { min: 200, max: 450 } },
    water: {
      requirement: "low",
      irrigations: { min: 1, max: 3 },
      criticalStages: ["Rosette stage (25–30 days)", "Flowering (55–70 days)", "Siliqua (pod) filling (85–100 days)"],
    },
    seedRate: "2–2.5 kg/acre for raya/sarson, 2.5–3 kg/acre for canola",
    spacing: "Rows 45 cm apart for raya, 30 cm for canola; thin to 10–15 cm between plants",
    varieties: ["Faisal Canola", "Punjab Sarson", "Super Raya", "Khanpur Raya", "Rainbow (canola)"],
    fertiliser: [
      { name: "DAP", dose: "1 bag (50 kg) per acre", timing: "At sowing" },
      { name: "Urea", dose: "1–1.5 bags (50–75 kg) per acre", timing: "Split: at first irrigation and before flowering" },
      { name: "Sulphur (gypsum)", dose: "10–15 kg S per acre", timing: "At sowing — sulphur drives oil content" },
    ],
    expectedYield: { min: 12, max: 22, unit: "maund/acre", note: "1 maund = 40 kg." },
    pests: [
      {
        name: "Mustard aphid (Lipaphis erysimi)",
        nameUr: "سرسوں کا تیلا",
        symptoms: [
          "Grey-green colonies packed on flowering shoots and pods",
          "Curled, sticky leaves and stunted pods",
          "Peaks in the cool, still weather of January",
        ],
        management: [
          "Sow early so flowering finishes before the aphid peak",
          "Conserve ladybirds and syrphid flies — they often control it free of charge",
          "Spray a recommended insecticide only when colonies cover the shoots, and never during peak bee activity",
        ],
      },
      {
        name: "Painted bug",
        nameUr: "رنگین بھگ",
        symptoms: ["Bugs sucking on seedlings and on maturing pods", "Shrivelled seed and poor oil recovery"],
        management: ["Avoid very early or very late sowing", "Treat field margins where the bugs first arrive"],
      },
    ],
    diseases: [
      {
        name: "Alternaria blight",
        nameUr: "الٹرنیریا بلائٹ",
        symptoms: ["Dark brown spots with concentric rings on leaves and pods", "Premature leaf fall"],
        management: ["Use clean seed and rotate crops", "Spray a recommended fungicide if humid weather sets in at podding"],
      },
      {
        name: "White rust",
        nameUr: "سفید کنگی",
        symptoms: ["Chalky white raised pustules on the underside of leaves", "Swollen, deformed flowering shoots (stag-head)"],
        management: ["Grow tolerant varieties", "Remove and destroy stag-headed shoots", "Avoid dense stands that trap humidity"],
      },
    ],
    practices: [
      "Sow on ridges where winter rain can waterlog the field",
      "Thin to the recommended plant spacing at 3 weeks — crowding is the commonest mistake",
      "Keep bees in mind: mustard flowering is a major honey flow, so time sprays to late evening",
    ],
    postHarvest: [
      "Cut when two-thirds of pods turn yellow, then windrow to finish drying",
      "Thresh gently — bruised seed loses oil quality",
      "Dry to 8% moisture before storage or oil extraction",
    ],
    marketDemand: "high",
    profitability: "medium",
    riskFactor: "low",
    economics: SAMPLE_ECONOMICS("low"),
  },
  {
    id: "potato",
    name: "Potato",
    nameUr: "آلو",
    otherNames: ["Aloo"],
    category: "vegetable",
    season: "rabi",
    summary:
      "A high-value Rabi crop concentrated in the Okara–Sahiwal–Kasur tract, with hill and off-season crops in KPK, Balochistan and GB. Seed quality and cold storage decide profit.",
    summaryUr:
      "زیادہ منافع والی ربیع فصل جو زیادہ تر اوکاڑہ، ساہیوال اور قصور میں کاشت ہوتی ہے۔ منافع کا دارومدار اچھے بیج اور کولڈ اسٹوریج پر ہے۔",
    durationDays: { min: 90, max: 120 },
    provinces: ["Punjab", "Khyber Pakhtunkhwa", "Balochistan", "Gilgit-Baltistan", "Azad Jammu & Kashmir", "Sindh"],
    zones: ["punjab-mixed", "punjab-rice-wheat", "kpk-orchards", "balochistan-uplands", "gb-ajk-valleys"],
    windows: [
      {
        region: "Punjab autumn (main) crop",
        regionUr: "پنجاب خریفی/سرمائی فصل",
        provinces: ["Punjab", "Sindh"],
        sowing: { from: "1 October", to: "31 October", months: [10] },
        harvest: { from: "January", to: "February", months: [1, 2] },
        note: "The big commercial crop. Plant once soil temperature drops below about 30°C.",
      },
      {
        region: "Punjab spring crop",
        regionUr: "پنجاب بہاریہ فصل",
        provinces: ["Punjab"],
        sowing: { from: "Mid January", to: "Mid February", months: [1, 2] },
        harvest: { from: "April", to: "May", months: [4, 5] },
      },
      {
        region: "Hill / summer crop (KPK, Balochistan uplands, GB)",
        regionUr: "پہاڑی و گرمائی فصل",
        provinces: ["Khyber Pakhtunkhwa", "Balochistan", "Gilgit-Baltistan", "Azad Jammu & Kashmir"],
        sowing: { from: "March", to: "May", months: [3, 4, 5] },
        harvest: { from: "August", to: "October", months: [8, 9, 10] },
        note: "The main source of seed potato for the plains.",
      },
    ],
    soils: ["loamy", "sandy", "alluvial"],
    soilNote: "Needs loose, well-drained sandy loam. Heavy clay gives misshapen tubers and harvest losses.",
    climate: { temperature: { min: 12, max: 30, optimal: 20 }, rainfallMm: { min: 300, max: 600 } },
    water: {
      requirement: "high",
      irrigations: { min: 6, max: 10 },
      criticalStages: ["Sprouting and emergence", "Stolon formation", "Tuber bulking (45–75 days)"],
    },
    seedRate: "800–1,200 kg/acre of certified seed tubers depending on tuber size",
    spacing: "Ridges 70–75 cm apart, seed tubers 20–25 cm within the ridge",
    varieties: ["Sadaf", "Kuroda", "Faisalabad White", "Santé", "Asterix", "Lady Rosetta (processing)"],
    fertiliser: [
      { name: "Farmyard manure", dose: "8–10 tonnes per acre", timing: "Incorporate during land preparation" },
      { name: "DAP", dose: "2 bags (100 kg) per acre", timing: "At planting, banded under the ridge" },
      { name: "SOP (potash)", dose: "1–2 bags (50–100 kg) per acre", timing: "Half at planting, half at earthing up" },
      { name: "Urea", dose: "2 bags (100 kg) per acre", timing: "Split at emergence and at earthing up" },
    ],
    expectedYield: { min: 180, max: 320, unit: "maund/acre", note: "1 maund = 40 kg, so roughly 7–13 tonnes per acre." },
    pests: [
      {
        name: "Aphid (virus vector)",
        nameUr: "تیلا",
        symptoms: ["Curled young leaves", "Sticky honeydew", "Mosaic and leaf-roll symptoms appearing later in the crop"],
        management: [
          "Aphids matter most because they carry virus into seed crops — rogue infected plants",
          "Use certified virus-free seed",
          "Spray only on threshold, and cut the seed crop's haulm early to escape late aphid flights",
        ],
      },
      {
        name: "Potato tuber moth",
        nameUr: "آلو کا پروانہ",
        symptoms: ["Tunnels just under the tuber skin", "Damage continues in the store", "Mined leaves and stems"],
        management: [
          "Earth up well so no tuber is exposed to the light",
          "Harvest promptly and never leave tubers in the field overnight",
          "Store cool; use pheromone traps in the store",
        ],
      },
    ],
    diseases: [
      {
        name: "Late blight",
        nameUr: "پچھیتا جھلساؤ",
        symptoms: [
          "Water-soaked dark green to brown patches on leaf edges",
          "White downy growth on the leaf underside in the morning",
          "A cool, damp, foggy spell can destroy a crop in under a week",
        ],
        management: [
          "Watch the weather — start protective fungicide before the first foggy spell, not after symptoms",
          "Use resistant varieties and certified seed",
          "Destroy cull piles and volunteer plants that carry the pathogen over",
          "Keep ridges high so tubers are not splashed with spores",
        ],
      },
      {
        name: "Early blight",
        nameUr: "ابتدائی جھلساؤ",
        symptoms: ["Brown target-board spots with concentric rings on older leaves", "Worst on nitrogen-starved crops"],
        management: ["Keep nutrition balanced", "Rotate away from potato and tomato", "Apply a recommended protectant fungicide"],
      },
      {
        name: "Black scurf / Rhizoctonia",
        nameUr: "بلیک اسکرف",
        symptoms: ["Hard black specks stuck on the tuber skin", "Poor, uneven emergence and stem cankers"],
        management: ["Use treated, clean seed", "Avoid planting into cold, wet soil", "Rotate with cereals"],
      },
    ],
    practices: [
      "Buy certified seed and cut tubers with a disinfected knife, leaving at least two eyes per piece",
      "Earth up twice — exposed tubers turn green and become unsaleable",
      "Dehaulm (cut the tops) 10–15 days before harvest so the skin sets",
      "Book cold storage before harvest; the whole tract lifts at the same time",
    ],
    postHarvest: [
      "Cure in shade for a week before storing",
      "Grade out damaged and green tubers — they spoil the whole lot",
      "Store at 3–5°C for table potato, 8–10°C for processing potato",
    ],
    marketDemand: "high",
    profitability: "high",
    riskFactor: "high",
    economics: SAMPLE_ECONOMICS("high"),
  },
  {
    id: "lentil",
    name: "Lentil",
    nameUr: "مسور",
    otherNames: ["Masoor", "Masur"],
    category: "pulse",
    season: "rabi",
    summary:
      "A short, low-input Rabi pulse suited to barani Punjab and DI Khan. Pakistan imports a lot of lentil, so demand is steady.",
    summaryUr:
      "کم لاگت والی ربیع کی دال جو بارانی پنجاب اور ڈیرہ اسماعیل خان کے لیے موزوں ہے۔ پاکستان مسور درآمد کرتا ہے، اس لیے طلب مستقل رہتی ہے۔",
    durationDays: { min: 130, max: 160 },
    provinces: ["Punjab", "Khyber Pakhtunkhwa", "Sindh", "Islamabad Capital Territory"],
    zones: ["punjab-barani", "kpk-maize-plains", "punjab-mixed"],
    windows: [
      {
        region: "Punjab & KPK",
        regionUr: "پنجاب و خیبر پختونخوا",
        provinces: ["Punjab", "Khyber Pakhtunkhwa", "Islamabad Capital Territory"],
        sowing: { from: "15 October", to: "15 November", months: [10, 11] },
        harvest: { from: "April", to: "May", months: [4, 5] },
      },
      {
        region: "Sindh",
        regionUr: "سندھ",
        provinces: ["Sindh"],
        sowing: { from: "November", to: "December", months: [11, 12] },
        harvest: { from: "March", to: "April", months: [3, 4] },
      },
    ],
    soils: ["loamy", "sandy", "clay"],
    soilNote: "Well-drained loam. Very sensitive to standing water at any stage.",
    climate: { temperature: { min: 8, max: 28, optimal: 20 }, rainfallMm: { min: 200, max: 450 } },
    water: {
      requirement: "low",
      irrigations: { min: 0, max: 2 },
      criticalStages: ["Flowering (70–85 days)", "Pod filling (100–115 days)"],
    },
    seedRate: "12–15 kg/acre for small-seeded types, up to 20 kg/acre for bold seed",
    spacing: "Rows 25–30 cm apart, seed 4–5 cm deep",
    varieties: ["Masoor-93", "NIAB Masoor-2006", "Punjab Masoor-2009", "Markaz-09"],
    fertiliser: [
      { name: "DAP", dose: "1 bag (50 kg) per acre", timing: "At sowing" },
      { name: "Rhizobium inoculum", dose: "Seed treatment as per pack", timing: "Immediately before sowing" },
    ],
    expectedYield: { min: 6, max: 12, unit: "maund/acre", note: "1 maund = 40 kg." },
    pests: [
      {
        name: "Aphid",
        nameUr: "تیلا",
        symptoms: ["Colonies on tender shoots", "Curled leaves and poor pod set"],
        management: ["Conserve natural enemies", "Spray only above threshold at flowering"],
      },
      {
        name: "Pod borer",
        nameUr: "پھلی کی سنڈی",
        symptoms: ["Bored pods with hollow seed"],
        management: ["Pheromone traps to time control", "Treat at early pod set"],
      },
    ],
    diseases: [
      {
        name: "Lentil rust",
        nameUr: "مسور کی کنگی",
        symptoms: ["Brown pustules on leaves and stems late in the season", "Rapid drying of the crop"],
        management: ["Grow resistant varieties", "Sow on time", "Fungicide if rust appears before pod filling"],
      },
      {
        name: "Wilt",
        nameUr: "مرجھاؤ",
        symptoms: ["Patchy sudden wilting", "Brown vascular tissue when the stem is split"],
        management: ["Rotate for 3+ years", "Use treated certified seed", "Avoid waterlogged fields"],
      },
    ],
    practices: [
      "Sow on time — late lentil runs into terminal heat and shrivels",
      "Inoculate seed with Rhizobium",
      "One light irrigation at flowering in a dry year pays for itself",
    ],
    postHarvest: ["Harvest when the lower pods rattle", "Dry to 9–10% moisture", "Protect stored grain from bruchid beetle"],
    marketDemand: "high",
    profitability: "medium",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("low"),
  },
  {
    id: "onion",
    name: "Onion",
    nameUr: "پیاز",
    otherNames: ["Piyaz"],
    category: "vegetable",
    season: "rabi",
    summary:
      "Grown in overlapping seasons across Sindh, Balochistan and Punjab, which is why Pakistan has onion on the market almost year-round. Price swings are severe — storage matters.",
    summaryUr:
      "سندھ، بلوچستان اور پنجاب میں مختلف موسموں میں کاشت ہوتی ہے، اسی لیے سال بھر دستیاب رہتی ہے۔ قیمتوں میں شدید اتار چڑھاؤ آتا ہے، اس لیے ذخیرہ اہم ہے۔",
    durationDays: { min: 120, max: 160 },
    provinces: ["Sindh", "Balochistan", "Punjab", "Khyber Pakhtunkhwa"],
    zones: ["sindh-sugarcane-cotton", "balochistan-uplands", "balochistan-arid", "punjab-mixed"],
    windows: [
      {
        region: "Sindh (main Rabi crop)",
        regionUr: "سندھ (ربیع)",
        provinces: ["Sindh"],
        sowing: { from: "Nursery October–November", to: "Transplant December–January", months: [10, 11, 12, 1] },
        harvest: { from: "March", to: "May", months: [3, 4, 5] },
        note: "Hyderabad, Mirpurkhas and Sanghar supply the early national crop.",
      },
      {
        region: "Punjab",
        regionUr: "پنجاب",
        provinces: ["Punjab"],
        sowing: { from: "Nursery November", to: "Transplant January–February", months: [11, 12, 1, 2] },
        harvest: { from: "May", to: "June", months: [5, 6] },
      },
      {
        region: "Balochistan uplands (summer crop)",
        regionUr: "بلوچستان بالائی علاقے",
        provinces: ["Balochistan"],
        sowing: { from: "Nursery February–March", to: "Transplant April", months: [2, 3, 4] },
        harvest: { from: "August", to: "October", months: [8, 9, 10] },
        note: "The late Balochistan crop is what keeps prices down in autumn.",
      },
    ],
    soils: ["loamy", "sandy", "alluvial"],
    soilNote: "Friable, well-drained loam with plenty of organic matter. Waterlogging causes bulb rot.",
    climate: { temperature: { min: 13, max: 35, optimal: 22 }, rainfallMm: { min: 300, max: 600 } },
    water: {
      requirement: "medium",
      irrigations: { min: 8, max: 12 },
      criticalStages: ["Two weeks after transplanting", "Bulb initiation", "Bulb development"],
    },
    seedRate: "3–4 kg/acre raised as nursery, transplanted at 6–8 weeks",
    spacing: "Rows 30 cm apart, plants 10–15 cm within the row on beds or ridges",
    varieties: ["Phulkara", "Dark Red", "Nasarpuri", "Swat-1", "Chiltan-89"],
    fertiliser: [
      { name: "Farmyard manure", dose: "8–10 tonnes per acre", timing: "During land preparation" },
      { name: "DAP", dose: "2 bags (100 kg) per acre", timing: "At transplanting" },
      { name: "SOP (potash)", dose: "1 bag (50 kg) per acre", timing: "At bulb initiation" },
      { name: "Urea", dose: "2 bags (100 kg) per acre", timing: "Split at 3 and 6 weeks after transplanting; stop before bulbing" },
    ],
    expectedYield: { min: 250, max: 400, unit: "maund/acre", note: "1 maund = 40 kg, so roughly 10–16 tonnes per acre." },
    pests: [
      {
        name: "Onion thrips",
        nameUr: "تھرپس",
        symptoms: ["Silvery streaks and curling on leaves", "Stunted plants in hot dry weather"],
        management: [
          "Irrigate adequately — thrips explode in drought-stressed crops",
          "Use blue sticky traps to monitor",
          "Rotate insecticide groups; thrips build resistance quickly",
        ],
      },
    ],
    diseases: [
      {
        name: "Purple blotch",
        nameUr: "جامنی دھبہ",
        symptoms: ["Small white sunken spots that enlarge into purple-brown zoned lesions", "Leaves collapse at the lesion"],
        management: ["Rotate away from onion for 2–3 years", "Avoid overhead irrigation", "Apply a recommended protectant fungicide"],
      },
      {
        name: "Downy mildew",
        nameUr: "ملگجی پھپھوندی",
        symptoms: ["Pale oval patches with violet-grey fuzz in humid mornings", "Leaves bend over and die back"],
        management: ["Improve air movement with proper spacing", "Use clean sets and treated seed", "Spray at first sign in humid weather"],
      },
    ],
    practices: [
      "Raise the nursery on a raised bed to avoid damping-off",
      "Stop nitrogen once bulbing starts, or the bulbs will not store",
      "Withhold irrigation 2–3 weeks before harvest so the necks dry",
    ],
    postHarvest: [
      "Lift when 50–75% of tops have fallen over",
      "Cure in the shade for 10–15 days until the outer scales rustle",
      "Store in ventilated crates or a well-aired store; never in sealed bags",
    ],
    marketDemand: "very-high",
    profitability: "high",
    riskFactor: "high",
    economics: SAMPLE_ECONOMICS("medium"),
  },

  /* ---------------------------------------------------------------- KHARIF */
  {
    id: "rice-basmati",
    name: "Basmati Rice",
    nameUr: "باسمتی چاول",
    otherNames: ["Basmati", "Super Basmati", "Chawal"],
    category: "cereal",
    season: "kharif",
    summary:
      "Pakistan's flagship export crop, grown in the Kalar tract of central Punjab. Aroma and grain length depend on the variety and the soil — Basmati grown outside its belt loses its premium.",
    summaryUr:
      "پاکستان کی اہم برآمدی فصل، جو وسطی پنجاب کے کلر ٹریکٹ میں کاشت ہوتی ہے۔ خوشبو اور دانے کی لمبائی قسم اور زمین پر منحصر ہے۔",
    durationDays: { min: 140, max: 165 },
    provinces: ["Punjab", "Khyber Pakhtunkhwa", "Azad Jammu & Kashmir", "Islamabad Capital Territory"],
    zones: ["punjab-rice-wheat", "punjab-mixed"],
    windows: [
      {
        region: "Punjab rice belt",
        regionUr: "پنجاب چاول پٹی",
        provinces: ["Punjab", "Islamabad Capital Territory"],
        sowing: {
          from: "Nursery 20 May – 10 June",
          to: "Transplant 20 June – 20 July",
          months: [5, 6, 7],
        },
        harvest: { from: "October", to: "November", months: [10, 11] },
        note: "Transplant 25–35 day old seedlings. Transplanting after late July costs both yield and grain quality.",
      },
      {
        region: "KPK & AJK valleys",
        regionUr: "خیبر پختونخوا و آزاد کشمیر",
        provinces: ["Khyber Pakhtunkhwa", "Azad Jammu & Kashmir"],
        sowing: { from: "Nursery May", to: "Transplant June", months: [5, 6] },
        harvest: { from: "October", to: "November", months: [10, 11] },
      },
    ],
    soils: ["clay", "loamy", "alluvial"],
    soilNote: "Heavy clay and clay-loam that hold standing water. Sandy soil leaks water and is a poor fit.",
    climate: { temperature: { min: 20, max: 38, optimal: 30 }, rainfallMm: { min: 500, max: 1200 } },
    water: {
      requirement: "very-high",
      irrigations: { min: 15, max: 25 },
      criticalStages: ["Transplanting and establishment", "Tillering", "Panicle initiation", "Flowering", "Grain filling"],
    },
    seedRate: "4–5 kg/acre for the nursery (transplanted); 8–10 kg/acre for direct seeded rice",
    spacing: "22 x 22 cm, one to two seedlings per hill",
    varieties: ["Super Basmati", "Basmati-515", "Kainat (Basmati-2017)", "PK-1121 Aromatic", "Chenab Basmati-2016"],
    fertiliser: [
      { name: "DAP", dose: "1 bag (50 kg) per acre", timing: "Broadcast in the puddled field before transplanting" },
      { name: "Urea", dose: "1.5–2 bags (75–100 kg) per acre", timing: "Three splits: at transplanting, tillering and panicle initiation" },
      { name: "SOP / MOP", dose: "25–50 kg per acre", timing: "Basal" },
      { name: "Zinc sulphate", dose: "5–10 kg per acre", timing: "Basal — zinc deficiency is very common in rice soils" },
    ],
    expectedYield: { min: 28, max: 45, unit: "maund/acre", note: "Paddy, not milled rice. 1 maund = 40 kg." },
    pests: [
      {
        name: "Rice stem borer",
        nameUr: "تنے کی سنڈی",
        symptoms: [
          "Dead heart — the central shoot dries while the plant is still green",
          "White head — empty white panicles that pull out easily",
        ],
        management: [
          "Use pheromone traps and light traps to time control",
          "Release Trichogramma cards where available",
          "Destroy stubble after harvest to break the carry-over",
        ],
      },
      {
        name: "Brown planthopper",
        nameUr: "بھورا تیلا",
        symptoms: [
          "Circular patches of the field turn yellow then brown and collapse (hopperburn)",
          "Hoppers clustered at the water line on the stem base",
        ],
        management: [
          "Part the canopy and inspect the stem base weekly — the damage is invisible from above until too late",
          "Avoid excess nitrogen and avoid broad-spectrum sprays that kill spiders",
          "Drain the field for 3–4 days to disrupt the hoppers",
        ],
      },
      {
        name: "Rice leaf folder",
        nameUr: "پتہ لپیٹ سنڈی",
        symptoms: ["Leaves folded lengthwise and scraped white inside"],
        management: ["Usually tolerable — control only if the flag leaves are being attacked"],
      },
    ],
    diseases: [
      {
        name: "Bacterial leaf blight",
        nameUr: "بیکٹیریل لیف بلائٹ",
        symptoms: ["Water-soaked yellow stripes from the leaf tip down the margins", "Leaves dry into straw colour", "Worst after storms and flooding"],
        management: [
          "Grow resistant varieties — there is no effective cure once established",
          "Avoid heavy nitrogen and avoid clipping seedling tips at transplanting",
          "Drain the field and stop nitrogen if it appears",
        ],
      },
      {
        name: "Rice blast",
        nameUr: "بلاسٹ",
        symptoms: ["Spindle-shaped grey-centred lesions on leaves", "Blackened neck below the panicle causing the head to break"],
        management: ["Use resistant varieties and treated seed", "Balanced N, avoid late nitrogen", "Fungicide at boot leaf stage where neck blast is common"],
      },
      {
        name: "False smut",
        nameUr: "جھوٹی کانگیاری",
        symptoms: ["Individual grains replaced by velvety yellow-green balls"],
        management: ["Use clean seed", "Avoid late excess nitrogen", "Fungicide at booting in high-risk seasons"],
      },
    ],
    practices: [
      "Puddle and level the field well — uneven fields waste water and give patchy crops",
      "Transplant 25–35 day old seedlings; older seedlings never tiller properly",
      "Try alternate wetting and drying to cut water use without losing yield",
      "Do not burn rice stubble — use a happy seeder to sow wheat directly into it",
    ],
    postHarvest: [
      "Harvest at 20–22% grain moisture then dry gradually to 14% to avoid broken grain",
      "Fast, hot drying is the main cause of low milling recovery in Basmati",
      "Keep varieties separate — mixing destroys the export premium",
    ],
    marketDemand: "very-high",
    profitability: "high",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("medium"),
  },
  {
    id: "rice-irri",
    name: "IRRI / Coarse Rice",
    nameUr: "اری چاول",
    otherNames: ["IRRI-6", "Motta chawal", "Coarse rice"],
    category: "cereal",
    season: "kharif",
    summary:
      "The high-yielding coarse rice of Sindh and the Nasirabad plain. Lower price per maund than Basmati but far higher tonnage per acre.",
    summaryUr:
      "سندھ اور نصیر آباد کی زیادہ پیداوار دینے والی موٹی قسم۔ فی من قیمت باسمتی سے کم مگر فی ایکڑ پیداوار کہیں زیادہ۔",
    durationDays: { min: 110, max: 140 },
    provinces: ["Sindh", "Balochistan", "Punjab"],
    zones: ["sindh-rice", "sindh-sugarcane-cotton", "balochistan-arid"],
    windows: [
      {
        region: "Sindh",
        regionUr: "سندھ",
        provinces: ["Sindh"],
        sowing: { from: "Nursery April–May", to: "Transplant May–June", months: [4, 5, 6] },
        harvest: { from: "September", to: "October", months: [9, 10] },
        note: "Northern Sindh (Larkana, Jacobabad, Shikarpur) transplants first.",
      },
      {
        region: "Nasirabad plain, Balochistan",
        regionUr: "نصیر آباد، بلوچستان",
        provinces: ["Balochistan"],
        sowing: { from: "Nursery May", to: "Transplant June", months: [5, 6] },
        harvest: { from: "September", to: "October", months: [9, 10] },
      },
    ],
    soils: ["clay", "alluvial", "saline"],
    soilNote: "Heavy clay that holds water; tolerates mild salinity better than most Kharif crops.",
    climate: { temperature: { min: 22, max: 40, optimal: 32 }, rainfallMm: { min: 400, max: 1000 } },
    water: {
      requirement: "very-high",
      irrigations: { min: 15, max: 25 },
      criticalStages: ["Establishment", "Tillering", "Panicle initiation", "Flowering"],
    },
    seedRate: "5–6 kg/acre for the nursery; 10–12 kg/acre direct seeded",
    spacing: "20 x 20 cm, two seedlings per hill",
    varieties: ["IRRI-6", "IR-9", "KS-282", "Shua-92", "NIAB-IRRI-9"],
    fertiliser: [
      { name: "DAP", dose: "1–1.5 bags (50–75 kg) per acre", timing: "Basal in the puddled field" },
      { name: "Urea", dose: "2–2.5 bags (100–125 kg) per acre", timing: "Three splits through tillering to panicle initiation" },
      { name: "Zinc sulphate", dose: "5–10 kg per acre", timing: "Basal" },
    ],
    expectedYield: { min: 50, max: 80, unit: "maund/acre", note: "Paddy. 1 maund = 40 kg." },
    pests: [
      {
        name: "Rice stem borer",
        nameUr: "تنے کی سنڈی",
        symptoms: ["Dead heart in the vegetative stage", "White empty panicles at heading"],
        management: ["Pheromone traps", "Destroy stubble", "Avoid staggered transplanting across neighbouring fields"],
      },
      {
        name: "Rice hispa / leaf folder",
        nameUr: "پتہ خور کیڑے",
        symptoms: ["Scraped white streaks along the leaf"],
        management: ["Clip badly affected leaf tips", "Treat only above threshold"],
      },
    ],
    diseases: [
      {
        name: "Bacterial leaf blight",
        nameUr: "بیکٹیریل لیف بلائٹ",
        symptoms: ["Yellow marginal stripes drying to straw colour"],
        management: ["Resistant varieties", "Drain the field, cut nitrogen"],
      },
      {
        name: "Sheath blight",
        nameUr: "شیتھ بلائٹ",
        symptoms: ["Oval greenish-grey lesions on the leaf sheath at the water line", "Lodging in dense crops"],
        management: ["Avoid dense planting and excess nitrogen", "Apply a recommended fungicide at high humidity"],
      },
    ],
    practices: [
      "Level the field with laser levelling — the biggest water saving available in Sindh rice",
      "Watch soil salinity; flush salts before transplanting where EC is high",
      "Plan the wheat crop that follows: clear the field early so wheat is not sown late",
    ],
    postHarvest: ["Dry to 14% moisture in stages", "Store paddy, not milled rice, if you plan to hold stock"],
    marketDemand: "high",
    profitability: "medium",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("medium"),
  },
  {
    id: "cotton",
    name: "Cotton",
    nameUr: "کپاس",
    otherNames: ["Kapas", "Phutti", "White gold"],
    category: "cash-crop",
    season: "kharif",
    summary:
      "The cash crop of south Punjab and Sindh and the raw material for Pakistan's textile industry. Pest pressure — especially whitefly and pink bollworm — is the make-or-break factor.",
    summaryUr:
      "جنوبی پنجاب اور سندھ کی نقد آور فصل اور ٹیکسٹائل صنعت کا خام مال۔ سب سے بڑا خطرہ کیڑے ہیں، خاص طور پر سفید مکھی اور گلابی سنڈی۔",
    durationDays: { min: 150, max: 190 },
    provinces: ["Punjab", "Sindh", "Balochistan"],
    zones: ["punjab-cotton-wheat", "sindh-sugarcane-cotton", "thal-cholistan"],
    windows: [
      {
        region: "Sindh (early sowing)",
        regionUr: "سندھ",
        provinces: ["Sindh"],
        sowing: { from: "15 March", to: "15 May", months: [3, 4, 5] },
        harvest: { from: "Picking July", to: "November", months: [7, 8, 9, 10, 11] },
        note: "Sindh sows first, so Sindh phutti reaches the ginneries earliest.",
      },
      {
        region: "Punjab cotton belt",
        regionUr: "پنجاب کپاس پٹی",
        provinces: ["Punjab"],
        sowing: { from: "1 April", to: "31 May", months: [4, 5] },
        harvest: { from: "Picking August", to: "December", months: [8, 9, 10, 11, 12] },
        note: "Sow by mid-May. Late cotton runs into pink bollworm build-up and cold-shortened boll filling.",
      },
    ],
    soils: ["loamy", "clay", "alluvial"],
    soilNote: "Deep, well-drained loam and clay-loam. Cotton hates waterlogging — a single flooded week can cost the crop.",
    climate: { temperature: { min: 21, max: 43, optimal: 32 }, rainfallMm: { min: 300, max: 700 } },
    water: {
      requirement: "high",
      irrigations: { min: 6, max: 10 },
      criticalStages: ["Squaring", "Flowering", "Boll formation", "Boll filling"],
    },
    seedRate: "6–8 kg/acre of delinted seed (Bt hybrids at the lower end)",
    spacing: "Rows 75 cm apart, plants 22–30 cm within the row on ridges or beds",
    varieties: ["IUB-2013", "MNH-1050", "FH-Lalazar", "Cyto-179", "Sindh: CRIS-342, Sadori"],
    fertiliser: [
      { name: "DAP", dose: "2 bags (100 kg) per acre", timing: "At sowing" },
      { name: "Urea", dose: "2–3 bags (100–150 kg) per acre", timing: "Split at thinning, first flower and peak flowering" },
      { name: "SOP (potash)", dose: "1 bag (50 kg) per acre", timing: "At first flower — potash improves boll retention" },
      { name: "Boron", dose: "1 kg per acre foliar", timing: "At squaring, where deficiency is known" },
    ],
    expectedYield: { min: 20, max: 35, unit: "maund/acre", note: "Seed cotton (phutti). 1 maund = 40 kg." },
    pests: [
      {
        name: "Pink bollworm",
        nameUr: "گلابی سنڈی",
        symptoms: [
          "Rosetted (twisted) flowers",
          "Small entry hole on the boll with pink larvae and stained lint inside",
          "Bolls that never open properly",
        ],
        management: [
          "Destroy cotton sticks and gin trash promptly after picking — this is where the pest overwinters",
          "Use PB-rope pheromone mating disruption and delta traps",
          "Do not extend the crop into the winter; terminate on time",
        ],
      },
      {
        name: "Whitefly",
        nameUr: "سفید مکھی",
        symptoms: [
          "Clouds of tiny white insects rising when the canopy is disturbed",
          "Sticky honeydew and black sooty mould on the leaves",
          "Cotton leaf curl virus transmitted by the adults",
        ],
        management: [
          "Manage weeds and alternate hosts around the field",
          "Avoid repeated pyrethroid sprays — they wipe out predators and cause whitefly resurgence",
          "Use yellow sticky traps for monitoring and rotate insecticide groups",
        ],
      },
      {
        name: "Jassid (leafhopper)",
        nameUr: "سبز تیلا",
        symptoms: ["Leaf margins turn yellow then curl downwards and bronze", "Stunted plants in the early crop"],
        management: ["Grow hairy-leaf tolerant varieties", "Scout the underside of leaves twice a week from emergence"],
      },
      {
        name: "Mealybug",
        nameUr: "میلی بگ",
        symptoms: ["White cottony masses on stems and leaf axils", "Distorted, stunted growth"],
        management: ["Remove and burn infested plants and weed hosts", "Stop ant movement, which spreads the bug", "Spot-treat foci rather than the whole field"],
      },
    ],
    diseases: [
      {
        name: "Cotton leaf curl virus (CLCuV)",
        nameUr: "کپاس کا پتہ مروڑ وائرس",
        symptoms: [
          "Upward or downward curling of leaves with thickened, darkened veins",
          "Enations (small leafy outgrowths) on the leaf underside",
          "Severely stunted plants with almost no bolls",
        ],
        management: [
          "Grow the most CLCuV-tolerant variety notified for your district — there is no cure",
          "Sow early so the crop is established before whitefly peaks",
          "Control whitefly, the only vector, and remove infected plants early",
        ],
      },
      {
        name: "Bacterial blight (angular leaf spot)",
        nameUr: "بیکٹیریل بلائٹ",
        symptoms: ["Angular water-soaked spots bounded by leaf veins", "Black arm lesions on stems", "Boll rot"],
        management: ["Use acid-delinted, treated seed", "Rotate crops and remove debris", "Avoid overhead water movement between fields"],
      },
    ],
    practices: [
      "Sow on ridges or beds — it saves water and reduces waterlogging damage",
      "Thin to the recommended plant population at 3 weeks; over-dense cotton sheds bolls",
      "Scout twice weekly and spray on economic thresholds, not on a calendar",
      "Pick clean and dry, keep the first picking separate — it fetches the best grade",
    ],
    postHarvest: [
      "Pick in the morning after the dew dries, and never pack damp phutti",
      "Keep trash, leaf and polypropylene fibre out of the bag — contamination is heavily discounted",
      "Store on a dry raised surface away from moisture",
    ],
    marketDemand: "very-high",
    profitability: "medium",
    riskFactor: "high",
    economics: SAMPLE_ECONOMICS("high"),
  },
  {
    id: "sugarcane",
    name: "Sugarcane",
    nameUr: "گنا",
    otherNames: ["Ganna", "Kamad"],
    category: "cash-crop",
    season: "kharif",
    summary:
      "A 12-month crop grown across Punjab, Sindh and KPK. Guaranteed mill purchase makes it low-risk, but it is the thirstiest crop in the rotation and payment delays are common.",
    summaryUr:
      "بارہ ماہ کی فصل جو پنجاب، سندھ اور خیبر پختونخوا میں کاشت ہوتی ہے۔ ملوں کی خریداری سے خطرہ کم ہے، مگر پانی سب سے زیادہ درکار ہے۔",
    durationDays: { min: 300, max: 365 },
    provinces: ["Punjab", "Sindh", "Khyber Pakhtunkhwa"],
    zones: ["sindh-sugarcane-cotton", "punjab-mixed", "punjab-rice-wheat", "punjab-cotton-wheat", "kpk-maize-plains"],
    windows: [
      {
        region: "Spring planting (Punjab & KPK)",
        regionUr: "بہاریہ کاشت",
        provinces: ["Punjab", "Khyber Pakhtunkhwa"],
        sowing: { from: "15 February", to: "31 March", months: [2, 3] },
        harvest: { from: "November", to: "March", months: [11, 12, 1, 2, 3] },
      },
      {
        region: "Autumn planting (Punjab & Sindh)",
        regionUr: "خزاں کی کاشت",
        provinces: ["Punjab", "Sindh"],
        sowing: { from: "15 September", to: "31 October", months: [9, 10] },
        harvest: { from: "December (next year)", to: "March", months: [12, 1, 2, 3] },
        note: "Autumn cane out-yields spring cane and lets you intercrop wheat or pulses between the rows.",
      },
      {
        region: "Sindh",
        regionUr: "سندھ",
        provinces: ["Sindh"],
        sowing: { from: "September", to: "November", months: [9, 10, 11] },
        harvest: { from: "November", to: "February", months: [11, 12, 1, 2] },
      },
    ],
    soils: ["loamy", "clay", "alluvial"],
    soilNote: "Deep, fertile, well-drained loam. Needs good drainage despite the high water requirement.",
    climate: { temperature: { min: 20, max: 42, optimal: 32 }, rainfallMm: { min: 750, max: 1500 } },
    water: {
      requirement: "very-high",
      irrigations: { min: 15, max: 25 },
      criticalStages: ["Germination", "Tillering", "Grand growth (May–August)", "Maturity"],
    },
    seedRate: "30,000–35,000 three-budded setts per acre (about 100 maunds of seed cane)",
    spacing: "Trench or double-row strips 120 cm apart, or single rows 90–120 cm apart",
    varieties: ["CPF-253", "CPF-249", "HSF-240", "SPF-234", "Thatta-10 (Sindh)", "CP-77-400"],
    fertiliser: [
      { name: "Farmyard manure", dose: "8–10 tonnes per acre", timing: "Before planting" },
      { name: "DAP", dose: "2–3 bags (100–150 kg) per acre", timing: "At planting" },
      { name: "Urea", dose: "4–5 bags (200–250 kg) per acre", timing: "Three splits from tillering to grand growth" },
      { name: "SOP (potash)", dose: "1–2 bags (50–100 kg) per acre", timing: "Split at planting and earthing up" },
    ],
    expectedYield: { min: 600, max: 1000, unit: "maund/acre", note: "1 maund = 40 kg, so roughly 24–40 tonnes per acre." },
    pests: [
      {
        name: "Sugarcane borers (top, stem and root borer)",
        nameUr: "گنے کی سنڈیاں",
        symptoms: ["Dead heart in young cane that pulls out with a rotten smell", "Bore holes and frass on internodes", "Bunchy top in late attacks"],
        management: [
          "Release Trichogramma cards at the recommended intervals",
          "Use healthy, hot-water-treated setts",
          "Remove and destroy dead hearts weekly; do not leave stubble after harvest",
        ],
      },
      {
        name: "Pyrilla",
        nameUr: "پیریلا",
        symptoms: ["Hopper swarms under the leaves", "Sticky honeydew and black sooty mould over the whole canopy", "Sharp fall in sugar recovery"],
        management: [
          "Conserve the parasitoid Epiricania melanoleuca — it usually crashes pyrilla populations on its own",
          "Strip and remove dry lower leaves to open the canopy",
          "Spray only as a last resort, since it kills the parasitoid",
        ],
      },
    ],
    diseases: [
      {
        name: "Red rot",
        nameUr: "سرخ سڑن",
        symptoms: ["Split cane shows red internal tissue with white crossbars", "Sour alcoholic smell", "Whole clumps dry from the top"],
        management: [
          "Grow resistant varieties — this is the single most destructive cane disease in Pakistan",
          "Never take setts from an affected field",
          "Rogue out and burn affected clumps, then rotate for 2–3 years",
        ],
      },
      {
        name: "Whip smut",
        nameUr: "کوڑا کانگیاری",
        symptoms: ["A long black whip-like structure emerging from the growing point", "Thin, grassy, low-sugar canes"],
        management: ["Use disease-free setts and hot water treatment", "Remove whips carefully in a bag before they burst", "Avoid ratooning an infected field"],
      },
    ],
    practices: [
      "Plant in trenches — better germination, better lodging resistance and easier earthing up",
      "Treat setts with hot water or a recommended fungicide before planting",
      "Intercrop autumn cane with wheat, potato or lentil to earn from the field in year one",
      "Earth up and tie the cane before the monsoon winds to prevent lodging",
      "Keep no more than two ratoons before replanting",
    ],
    postHarvest: [
      "Deliver to the mill within 24 hours of cutting — sugar recovery falls fast after harvest",
      "Cut at ground level; the bottom internodes carry the most sugar",
      "Keep the mill weighbridge slip and CPR record for payment follow-up",
    ],
    marketDemand: "high",
    profitability: "medium",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("high"),
  },
  {
    id: "maize",
    name: "Maize",
    nameUr: "مکئی",
    otherNames: ["Makai", "Corn", "Jowari (KPK)"],
    category: "cereal",
    season: "kharif",
    summary:
      "The fastest-growing cereal in Pakistan, driven by poultry feed demand. Two crops a year are possible in Punjab (spring and autumn); KPK grows the traditional summer crop.",
    summaryUr:
      "پاکستان میں سب سے تیزی سے بڑھنے والی اناج کی فصل، جس کی طلب پولٹری فیڈ سے آتی ہے۔ پنجاب میں سال میں دو فصلیں ممکن ہیں۔",
    durationDays: { min: 90, max: 120 },
    provinces: ["Punjab", "Khyber Pakhtunkhwa", "Sindh", "Azad Jammu & Kashmir", "Gilgit-Baltistan"],
    zones: ["kpk-maize-plains", "punjab-mixed", "punjab-rice-wheat", "kpk-orchards", "gb-ajk-valleys"],
    windows: [
      {
        region: "Punjab spring maize",
        regionUr: "پنجاب بہاریہ مکئی",
        provinces: ["Punjab"],
        sowing: { from: "20 January", to: "20 February", months: [1, 2] },
        harvest: { from: "May", to: "June", months: [5, 6] },
        note: "The highest-yielding maize crop in the country, but it needs reliable irrigation through May heat.",
      },
      {
        region: "Punjab autumn maize",
        regionUr: "پنجاب خزاں کی مکئی",
        provinces: ["Punjab"],
        sowing: { from: "15 July", to: "20 August", months: [7, 8] },
        harvest: { from: "October", to: "November", months: [10, 11] },
      },
      {
        region: "KPK summer maize",
        regionUr: "خیبر پختونخوا گرمائی مکئی",
        provinces: ["Khyber Pakhtunkhwa", "Azad Jammu & Kashmir", "Gilgit-Baltistan"],
        sowing: { from: "June", to: "July", months: [6, 7] },
        harvest: { from: "September", to: "October", months: [9, 10] },
        note: "The staple crop of the Peshawar valley and the hill districts.",
      },
    ],
    soils: ["loamy", "alluvial", "sandy"],
    soilNote: "Deep, fertile, well-drained loam. Maize will not tolerate standing water for even 24 hours.",
    climate: { temperature: { min: 15, max: 38, optimal: 28 }, rainfallMm: { min: 400, max: 800 } },
    water: {
      requirement: "high",
      irrigations: { min: 6, max: 12 },
      criticalStages: ["Knee-high stage", "Tasselling", "Silking", "Grain filling"],
    },
    seedRate: "8–10 kg/acre of hybrid seed",
    spacing: "Rows 60–75 cm apart, plants 20–22 cm within the row on ridges",
    varieties: ["Pioneer 30Y87", "Monsanto DK-6142", "YH-1898", "Sahiwal Gold", "Azam (KPK)", "Pahari (hill)"],
    fertiliser: [
      { name: "DAP", dose: "2 bags (100 kg) per acre", timing: "At sowing" },
      { name: "Urea", dose: "3–4 bags (150–200 kg) per acre", timing: "Three splits: knee-high, pre-tasselling, silking" },
      { name: "SOP (potash)", dose: "1 bag (50 kg) per acre", timing: "At sowing" },
      { name: "Zinc sulphate", dose: "5 kg per acre", timing: "At sowing" },
    ],
    expectedYield: { min: 60, max: 110, unit: "maund/acre", note: "Hybrid, irrigated. 1 maund = 40 kg." },
    pests: [
      {
        name: "Fall armyworm (Spodoptera frugiperda)",
        nameUr: "فال آرمی ورم",
        symptoms: [
          "Ragged windowpane feeding on young leaves",
          "Wet sawdust-like frass packed into the whorl",
          "Larva sitting deep in the whorl, one per plant",
        ],
        management: [
          "Scout twice a week from emergence — this pest arrived recently and moves fast",
          "Hand-pick larvae and crush egg masses in small fields",
          "Apply a recommended insecticide directly into the whorl, in the evening",
          "Rotate insecticide groups and conserve natural enemies",
        ],
      },
      {
        name: "Maize stem borer",
        nameUr: "تنے کی سنڈی",
        symptoms: ["Shot holes in unfolding leaves", "Dead heart", "Tunnelled stems that snap in wind"],
        management: ["Destroy stubble after harvest", "Release Trichogramma", "Avoid very late sowing"],
      },
    ],
    diseases: [
      {
        name: "Maydis / turcicum leaf blight",
        nameUr: "پتوں کا جھلساؤ",
        symptoms: ["Long cigar-shaped grey-brown lesions on leaves", "Lower leaves die first in humid weather"],
        management: ["Grow tolerant hybrids", "Rotate crops and bury residue", "Fungicide if lesions reach the ear leaf before grain fill"],
      },
      {
        name: "Stalk / stem rot",
        nameUr: "تنے کی سڑن",
        symptoms: ["Soft, discoloured, hollow stem at the base", "Plants lodge just before harvest"],
        management: ["Avoid waterlogging and potassium deficiency", "Do not overcrowd the stand", "Harvest promptly once mature"],
      },
    ],
    practices: [
      "Sow on ridges and irrigate in the furrow — flat sowing waterlogs and lodges",
      "Get the plant population right: maize does not compensate for gaps the way wheat does",
      "Nitrogen at silking is what fills the grain — do not stop fertilising at knee-high",
      "For fodder, harvest at the milk stage; for grain, wait for the black layer",
    ],
    postHarvest: [
      "Dry cobs to 13–14% moisture before shelling",
      "Aflatoxin risk is real in damp maize — never bag warm or wet grain",
      "Sell to feed mills on a tested moisture basis",
    ],
    marketDemand: "very-high",
    profitability: "high",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("high"),
  },
  {
    id: "mung-bean",
    name: "Mung Bean",
    nameUr: "مونگ",
    otherNames: ["Moong", "Green gram"],
    category: "pulse",
    season: "kharif",
    summary:
      "A 65–80 day pulse that slots between wheat and the next crop. It fixes nitrogen, needs little water and gives quick cash — ideal for a smallholder catch crop.",
    summaryUr:
      "پینسٹھ سے اسی دن کی دال جو گندم کے بعد آسانی سے کاشت ہو سکتی ہے۔ نائٹروجن بناتی ہے، کم پانی مانگتی ہے اور جلد آمدن دیتی ہے۔",
    durationDays: { min: 65, max: 85 },
    provinces: ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan"],
    zones: ["thal-cholistan", "punjab-cotton-wheat", "punjab-barani", "kpk-maize-plains"],
    windows: [
      {
        region: "Kharif mung (main crop)",
        regionUr: "خریف مونگ",
        provinces: ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan"],
        sowing: { from: "1 July", to: "31 July", months: [7] },
        harvest: { from: "September", to: "October", months: [9, 10] },
        note: "Bhakkar, Layyah and Mianwali in the Thal are the main tract.",
      },
      {
        region: "Spring / summer mung",
        regionUr: "بہاریہ مونگ",
        provinces: ["Punjab", "Sindh"],
        sowing: { from: "Mid March", to: "Mid April", months: [3, 4] },
        harvest: { from: "June", to: "July", months: [6, 7] },
        note: "Sown after wheat harvest as a catch crop before rice or cotton.",
      },
    ],
    soils: ["sandy", "loamy", "alluvial"],
    soilNote: "Light, well-drained soil. Standing water for even a day at flowering will drop the pods.",
    climate: { temperature: { min: 20, max: 40, optimal: 30 }, rainfallMm: { min: 250, max: 500 } },
    water: {
      requirement: "low",
      irrigations: { min: 1, max: 3 },
      criticalStages: ["Flowering (30–40 days)", "Pod filling (45–60 days)"],
    },
    seedRate: "8–10 kg/acre",
    spacing: "Rows 30 cm apart, plants 8–10 cm within the row",
    varieties: ["NIAB Mung-2011", "AZRI Mung-2006", "Chakwal Mung-2006", "NM-2016", "Mung-2019"],
    fertiliser: [
      { name: "DAP", dose: "1 bag (50 kg) per acre", timing: "At sowing" },
      { name: "Rhizobium inoculum", dose: "Seed treatment as per pack", timing: "Immediately before sowing" },
    ],
    expectedYield: { min: 6, max: 12, unit: "maund/acre", note: "1 maund = 40 kg." },
    pests: [
      {
        name: "Whitefly (MYMV vector)",
        nameUr: "سفید مکھی",
        symptoms: ["Tiny white flies under leaves", "Bright yellow mosaic mottling appearing days later"],
        management: [
          "Whitefly matters mainly as the virus carrier — control it early, before symptoms show",
          "Grow MYMV-tolerant varieties",
          "Rogue out yellow-mosaic plants as soon as you see them",
        ],
      },
      {
        name: "Jassid and thrips",
        nameUr: "سبز تیلا و تھرپس",
        symptoms: ["Cupped, bronzed leaf margins", "Flower drop"],
        management: ["Scout weekly at flowering", "Treat above threshold with a recommended product"],
      },
    ],
    diseases: [
      {
        name: "Mung bean yellow mosaic virus (MYMV)",
        nameUr: "پیلا موزیک وائرس",
        symptoms: ["Irregular bright yellow patches on green leaves", "Small distorted pods with few seeds"],
        management: ["Tolerant varieties are the only reliable answer", "Control whitefly", "Remove infected plants early"],
      },
      {
        name: "Cercospora leaf spot",
        nameUr: "سرکوسپورا دھبے",
        symptoms: ["Round brown spots with grey centres and reddish margins", "Early leaf fall"],
        management: ["Rotate crops", "Use clean seed", "Fungicide only if humidity persists at podding"],
      },
    ],
    practices: [
      "Inoculate seed with Rhizobium and keep nitrogen low",
      "Do not irrigate at pod maturity — it causes uneven ripening",
      "Plan two or three pickings; mung does not mature all at once",
    ],
    postHarvest: [
      "Pick pods as they blacken, or cut the whole crop when 80% of pods are mature",
      "Dry to 9% moisture and clean before bagging",
      "Store in hermetic bags against bruchid beetle",
    ],
    marketDemand: "high",
    profitability: "medium",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("low"),
  },

  /* ------------------------------------------------------------- PERENNIAL */
  {
    id: "mango",
    name: "Mango",
    nameUr: "آم",
    otherNames: ["Aam", "Chaunsa", "Sindhri", "Anwar Ratol"],
    category: "fruit",
    season: "perennial",
    summary:
      "Pakistan's premier export fruit. Multan and Rahim Yar Khan grow the Chaunsa types, Mirpurkhas and Tando Allahyar the early Sindhri. Orchards take 4–5 years to bear.",
    summaryUr:
      "پاکستان کا سب سے اہم برآمدی پھل۔ ملتان اور رحیم یار خان میں چونسا، میرپورخاص اور ٹنڈو الہیار میں سندھڑی۔ باغ چار سے پانچ سال میں پھل دینا شروع کرتا ہے۔",
    durationDays: { min: 1460, max: 1825 },
    provinces: ["Punjab", "Sindh", "Khyber Pakhtunkhwa"],
    zones: ["punjab-cotton-wheat", "sindh-sugarcane-cotton"],
    windows: [
      {
        region: "Sindh (early varieties)",
        regionUr: "سندھ",
        provinces: ["Sindh"],
        sowing: { from: "Planting February–March", to: "and August–September", months: [2, 3, 8, 9] },
        harvest: { from: "Mid May (Sindhri)", to: "July", months: [5, 6, 7] },
      },
      {
        region: "South Punjab",
        regionUr: "جنوبی پنجاب",
        provinces: ["Punjab"],
        sowing: { from: "Planting February–March", to: "and August–September", months: [2, 3, 8, 9] },
        harvest: { from: "June (Anwar Ratol)", to: "September (Late Chaunsa)", months: [6, 7, 8, 9] },
      },
    ],
    soils: ["loamy", "sandy", "alluvial"],
    soilNote: "Deep, well-drained loam with a water table below 3 metres. Waterlogging and salinity cause quick decline.",
    climate: { temperature: { min: 15, max: 45, optimal: 27 }, rainfallMm: { min: 400, max: 1000 } },
    water: {
      requirement: "medium",
      irrigations: { min: 12, max: 20 },
      criticalStages: ["Flowering (February)", "Fruit set", "Fruit development (April–June)"],
    },
    seedRate: "40–70 grafted plants per acre depending on spacing",
    spacing: "Square system 25 x 25 ft (about 70 plants/acre) or high-density 15 x 20 ft",
    varieties: ["Sindhri", "Chaunsa (Samar Bahisht, White, Late)", "Anwar Ratol", "Langra", "Dusehri", "Fajri"],
    fertiliser: [
      { name: "Farmyard manure", dose: "40–100 kg per bearing tree", timing: "December–January" },
      { name: "Urea", dose: "1–2 kg per bearing tree", timing: "Split: after harvest and before flowering" },
      { name: "DAP / SSP", dose: "1–2 kg per bearing tree", timing: "December, worked into the basin" },
      { name: "SOP (potash)", dose: "1–1.5 kg per bearing tree", timing: "At fruit set" },
    ],
    expectedYield: { min: 80, max: 150, unit: "maund/acre", note: "Mature bearing orchard. 1 maund = 40 kg." },
    pests: [
      {
        name: "Mango hopper",
        nameUr: "آم کا تیلا",
        symptoms: ["Hoppers jumping off the panicles when disturbed", "Flowers dry and drop", "Honeydew and sooty mould blackening the leaves"],
        management: [
          "Prune to open the canopy so sprays reach the panicles",
          "Spray at panicle emergence and again at pea-size fruit if hoppers persist",
          "Wash off sooty mould once the hoppers are controlled",
        ],
      },
      {
        name: "Mango mealybug",
        nameUr: "میلی بگ",
        symptoms: ["Nymphs climbing trunks in December–January", "White cottony masses on panicles"],
        management: [
          "Band the trunk with a slippery polythene sheet plus grease in December — this stops the climb",
          "Rake and expose the soil under the canopy in November to kill eggs",
          "Remove weed hosts from the basin",
        ],
      },
      {
        name: "Fruit fly",
        nameUr: "پھل کی مکھی",
        symptoms: ["Puncture marks on the fruit", "Maggots inside softening fruit", "Premature fruit drop"],
        management: [
          "Hang methyl eugenol traps well before harvest",
          "Collect and bury fallen fruit deeply, every day",
          "Bag fruit in high-value orchards",
        ],
      },
    ],
    diseases: [
      {
        name: "Mango malformation",
        nameUr: "آم کی بدشکلی",
        symptoms: ["Dense bunched panicles that never set fruit", "Compact vegetative shoots with tiny leaves"],
        management: ["Prune malformed panicles 15–20 cm below the affected part and burn them", "Use clean scion wood", "Do not propagate from affected trees"],
      },
      {
        name: "Mango sudden death / quick decline",
        nameUr: "اچانک زوال",
        symptoms: ["Gum oozing from the trunk", "Bark discolouration", "A branch or the whole tree wilts within weeks"],
        management: [
          "Avoid trunk injury and mechanical wounds during ploughing",
          "Improve drainage and avoid flooding the trunk base",
          "Treat wounds with Bordeaux paste and remove dead trees with the root ball",
        ],
      },
      {
        name: "Anthracnose",
        nameUr: "اینتھراکنوز",
        symptoms: ["Black sunken spots on fruit that spread in storage", "Blossom blight in wet weather"],
        management: ["Prune for airflow", "Protective fungicide at flowering", "Hot water treatment of harvested fruit where facilities exist"],
      },
    ],
    practices: [
      "Prune lightly after harvest every year — an unpruned orchard alternates heavy and empty years",
      "Keep the basin clean and mulched; do not plough deep under the canopy and cut feeder roots",
      "Withhold irrigation for 8–10 weeks before flowering to encourage flower bud initiation",
      "Thin fruit in an overloaded year to hold size and prevent branch breakage",
    ],
    postHarvest: [
      "Harvest with 2–3 cm stalk and de-sap the fruit face-down so latex does not burn the skin",
      "Cool the fruit quickly and grade by size and colour for export lots",
      "Hot water treatment (as per export protocol) is required for several markets",
    ],
    marketDemand: "very-high",
    profitability: "high",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("high"),
  },
  {
    id: "citrus-kinnow",
    name: "Citrus (Kinnow)",
    nameUr: "کینو",
    otherNames: ["Kinnow", "Malta", "Mausami", "Santra"],
    category: "fruit",
    season: "perennial",
    summary:
      "Sargodha and Bhalwal grow most of the world's Kinnow. A well-managed orchard yields for decades, but citrus decline and fruit fly are constant threats.",
    summaryUr:
      "دنیا کا بیشتر کینو سرگودھا اور بھلوال میں پیدا ہوتا ہے۔ اچھی دیکھ بھال سے باغ دہائیوں تک پھل دیتا ہے، مگر سٹرس ڈیکلائن اور پھل کی مکھی بڑا خطرہ ہیں۔",
    durationDays: { min: 1095, max: 1825 },
    provinces: ["Punjab", "Khyber Pakhtunkhwa", "Sindh"],
    zones: ["punjab-mixed", "punjab-rice-wheat", "kpk-orchards"],
    windows: [
      {
        region: "Punjab citrus belt (Sargodha–Bhalwal)",
        regionUr: "پنجاب کینو پٹی",
        provinces: ["Punjab"],
        sowing: { from: "Planting February–March", to: "and September", months: [2, 3, 9] },
        harvest: { from: "December", to: "February", months: [12, 1, 2] },
        note: "Fruit colour develops with the December cold; picking too early gives green, sour fruit.",
      },
      {
        region: "KPK & Sindh",
        regionUr: "خیبر پختونخوا و سندھ",
        provinces: ["Khyber Pakhtunkhwa", "Sindh"],
        sowing: { from: "Planting February–March", to: "and September", months: [2, 3, 9] },
        harvest: { from: "November", to: "January", months: [11, 12, 1] },
      },
    ],
    soils: ["loamy", "sandy", "alluvial"],
    soilNote: "Light, deep, well-drained loam with low salinity and lime. Citrus is very sensitive to salt and waterlogging.",
    climate: { temperature: { min: 13, max: 40, optimal: 25 }, rainfallMm: { min: 400, max: 900 } },
    water: {
      requirement: "medium",
      irrigations: { min: 15, max: 25 },
      criticalStages: ["Flowering (March)", "Fruit set and June drop", "Fruit enlargement (August–October)"],
    },
    seedRate: "100–110 grafted plants per acre at standard spacing",
    spacing: "20 x 20 ft square system, or 15 x 15 ft for high density",
    varieties: ["Kinnow", "Feutrell's Early", "Succari", "Musambi", "Blood Red", "Grapefruit (Shamber)"],
    fertiliser: [
      { name: "Farmyard manure", dose: "40–60 kg per bearing tree", timing: "December" },
      { name: "Urea", dose: "1.5–2 kg per bearing tree", timing: "Three splits: February, May, September" },
      { name: "SSP / DAP", dose: "1.5–2 kg per bearing tree", timing: "December–January" },
      { name: "Zinc + boron", dose: "Foliar as per label", timing: "Pre-flowering and after fruit set" },
    ],
    expectedYield: { min: 200, max: 400, unit: "maund/acre", note: "Mature bearing orchard. 1 maund = 40 kg." },
    pests: [
      {
        name: "Citrus psylla",
        nameUr: "سٹرس سلا",
        symptoms: ["Twisted, cupped new flush", "Sooty mould on shoots", "Carries citrus greening (HLB)"],
        management: [
          "Protect every new flush — psylla only breeds on soft growth",
          "Synchronise flushing by irrigating and fertilising the whole block together",
          "Remove and destroy declining trees that act as reservoirs",
        ],
      },
      {
        name: "Citrus leaf miner",
        nameUr: "پتہ کھدائی کیڑا",
        symptoms: ["Silvery serpentine tunnels in young leaves", "Curled, distorted flush"],
        management: ["Control on nursery and young trees where it matters most", "Avoid excessive late-season nitrogen flush"],
      },
      {
        name: "Fruit fly",
        nameUr: "پھل کی مکھی",
        symptoms: ["Sting marks and rotting fruit", "Maggots inside"],
        management: ["Methyl eugenol traps", "Daily collection and deep burial of dropped fruit"],
      },
    ],
    diseases: [
      {
        name: "Citrus canker",
        nameUr: "سٹرس کینکر",
        symptoms: ["Raised corky brown lesions with a yellow halo on leaves, twigs and fruit", "Defoliation and unsaleable fruit"],
        management: ["Copper sprays during flushes in the wet season", "Prune and burn affected twigs in dry weather", "Windbreaks reduce spread — the bacterium enters through wind-driven rain and thorn wounds"],
      },
      {
        name: "Gummosis / Phytophthora foot rot",
        nameUr: "گمواسس",
        symptoms: ["Gum oozing from the trunk near the ground", "Bark cracking and dying in patches", "General tree decline"],
        management: [
          "Never let irrigation water touch the trunk — irrigate in a ring, not a flood",
          "Bud-union should be well above soil level at planting",
          "Scrape the lesion, treat with Bordeaux paste, and apply a recommended systemic fungicide",
        ],
      },
    ],
    practices: [
      "Plant on ridges with the bud union at least 9 inches above soil level",
      "Prune out dead wood and water sprouts each year after harvest",
      "Do not intercrop with vegetables that need frequent flooding",
      "Apply micronutrients — zinc and boron deficiency is near-universal in Punjab citrus",
    ],
    postHarvest: [
      "Clip the fruit, do not pull it — a torn button invites rot",
      "Cure, wash and wax for market; grade strictly for export",
      "Store at 5–7°C with high humidity",
    ],
    marketDemand: "very-high",
    profitability: "high",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("high"),
  },
  {
    id: "dates",
    name: "Dates",
    nameUr: "کھجور",
    otherNames: ["Khajoor", "Aseel", "Begum Jangi"],
    category: "fruit",
    season: "perennial",
    summary:
      "Khairpur in Sindh and Panjgur/Turbat in Balochistan are the two great date belts. Very drought and salt tolerant, but monsoon rain at ripening is the perennial risk in Sindh.",
    summaryUr:
      "سندھ میں خیرپور اور بلوچستان میں پنجگور و تربت کھجور کے بڑے علاقے ہیں۔ خشک سالی اور نمک برداشت کرتی ہے، مگر پکنے کے وقت بارش سب سے بڑا خطرہ ہے۔",
    durationDays: { min: 1460, max: 2555 },
    provinces: ["Sindh", "Balochistan", "Punjab", "Khyber Pakhtunkhwa"],
    zones: ["sindh-sugarcane-cotton", "balochistan-arid", "punjab-cotton-wheat"],
    windows: [
      {
        region: "Khairpur, Sindh",
        regionUr: "خیرپور، سندھ",
        provinces: ["Sindh"],
        sowing: { from: "Offshoot planting February–March", to: "and August–September", months: [2, 3, 8, 9] },
        harvest: { from: "Mid June", to: "August", months: [6, 7, 8] },
        note: "Aseel is picked at the doka (khalal) stage before the monsoon arrives.",
      },
      {
        region: "Makran (Panjgur, Turbat), Balochistan",
        regionUr: "مکران، بلوچستان",
        provinces: ["Balochistan"],
        sowing: { from: "Offshoot planting February–March", to: "and September", months: [2, 3, 9] },
        harvest: { from: "July", to: "September", months: [7, 8, 9] },
      },
      {
        region: "DI Khan & south Punjab",
        regionUr: "ڈیرہ اسماعیل خان و جنوبی پنجاب",
        provinces: ["Khyber Pakhtunkhwa", "Punjab"],
        sowing: { from: "Offshoot planting February–March", to: "and September", months: [2, 3, 9] },
        harvest: { from: "July", to: "September", months: [7, 8, 9] },
      },
    ],
    soils: ["sandy", "loamy", "saline", "alluvial"],
    soilNote: "Tolerates sandy and moderately saline soil that would kill most crops, provided drainage is good.",
    climate: { temperature: { min: 10, max: 50, optimal: 32 }, rainfallMm: { min: 50, max: 300 } },
    water: {
      requirement: "medium",
      irrigations: { min: 12, max: 20 },
      criticalStages: ["Pollination (February–March)", "Fruit set", "Fruit enlargement (April–June)"],
    },
    seedRate: "48–70 offshoots per acre",
    spacing: "24–28 ft square, roughly 55–70 palms per acre, with one male palm per 40–50 females",
    varieties: ["Aseel (Khairpur)", "Karbalain", "Begum Jangi (Makran)", "Muzawati", "Dhakki (DI Khan)", "Halawi"],
    fertiliser: [
      { name: "Farmyard manure", dose: "40–60 kg per bearing palm", timing: "December–January" },
      { name: "Urea", dose: "1.5–2 kg per bearing palm", timing: "Split in February and May" },
      { name: "SSP / DAP", dose: "1.5–2 kg per bearing palm", timing: "December" },
      { name: "SOP (potash)", dose: "1–2 kg per bearing palm", timing: "At fruit set" },
    ],
    expectedYield: { min: 80, max: 180, unit: "maund/acre", note: "Mature grove. 1 maund = 40 kg." },
    pests: [
      {
        name: "Red palm weevil",
        nameUr: "سرخ سنڈی",
        symptoms: ["Chewing sounds inside the trunk", "Oozing brown fluid and chewed fibre at the crown", "The crown collapses suddenly"],
        management: [
          "Use pheromone traps across the grove, not just on affected palms",
          "Avoid wounding the trunk when removing offshoots; seal every cut",
          "Report and remove dead palms — one untreated palm reinfests the block",
        ],
      },
      {
        name: "Lesser date moth",
        nameUr: "کھجور کا پروانہ",
        symptoms: ["Webbing between fruit strands", "Fruit drops before ripening"],
        management: ["Clean and remove old fruit stalks after harvest", "Bag bunches", "Treat at fruit set where infestation is chronic"],
      },
    ],
    diseases: [
      {
        name: "Khamedj (inflorescence rot)",
        nameUr: "پھول کی سڑن",
        symptoms: ["Brown rot on the spathe before it opens", "No fruit set on affected bunches"],
        management: ["Remove and burn affected spathes", "Prophylactic fungicide before spathe emergence in wet years"],
      },
      {
        name: "Graphiola (false smut) leaf spot",
        nameUr: "پتوں کی کانگیاری",
        symptoms: ["Small yellow-black pustules on both sides of the fronds", "Fronds die early in humid groves"],
        management: ["Remove infected fronds", "Improve spacing and airflow", "Avoid overhead water"],
      },
    ],
    practices: [
      "Hand-pollinate in February–March; natural wind pollination gives poor, uneven set",
      "Thin the strands and bunches so fruit sizes evenly",
      "Bag bunches with net or paper sleeves to keep off rain, birds and dust",
      "Remove old fronds and grove trash annually — it harbours weevil and moth",
    ],
    postHarvest: [
      "Harvest Aseel at the doka stage before monsoon rain if you cannot dry safely",
      "Dry on raised racks under net, never on bare ground",
      "Fumigate or freeze-treat, then grade and pack; hygiene decides the export grade",
    ],
    marketDemand: "high",
    profitability: "high",
    riskFactor: "medium",
    economics: SAMPLE_ECONOMICS("medium"),
  },
]

/* ----------------------------------------------------------------- lookups */

const CROPS_BY_ID = new Map(PAKISTAN_CROPS.map((crop) => [crop.id, crop]))
const ZONES_BY_ID = new Map(PAKISTAN_AGRO_ZONES.map((zone) => [zone.id, zone]))

/** Case-insensitive lookup that also accepts the crop's display or Urdu name. */
export function findCrop(idOrName: string): Crop | null {
  if (!idOrName) return null
  const key = decodeURIComponent(idOrName).trim().toLowerCase()
  const direct = CROPS_BY_ID.get(key)
  if (direct) return direct
  return (
    PAKISTAN_CROPS.find(
      (crop) =>
        crop.name.toLowerCase() === key ||
        crop.nameUr === key ||
        crop.otherNames.some((alias) => alias.toLowerCase() === key),
    ) ?? null
  )
}

export function findZone(id: string): AgroZone | null {
  return ZONES_BY_ID.get(id) ?? null
}

export function zonesForProvince(province: Province): AgroZone[] {
  return PAKISTAN_AGRO_ZONES.filter((zone) => zone.provinces.includes(province))
}

/** Rabi is November–April, Kharif is May–October. */
export function seasonForMonth(month: number): "rabi" | "kharif" {
  return month >= 5 && month <= 10 ? "kharif" : "rabi"
}

export function currentSeason(date = new Date()): "rabi" | "kharif" {
  return seasonForMonth(date.getMonth() + 1)
}

/** The windows of a crop that apply to a given province (all of them if none match). */
export function windowsForProvince(crop: Crop, province?: Province | null): CropWindow[] {
  if (!province) return crop.windows
  const matched = crop.windows.filter((w) => w.provinces.includes(province))
  return matched.length ? matched : crop.windows
}
