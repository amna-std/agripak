/**
 * AgriPak — database seed.
 *
 * Creates a small, realistic set of Pakistani demo data so the app is usable
 * immediately after deployment. Safe to re-run: it clears only the collections
 * it owns and leaves scraped market prices alone.
 *
 * Usage:  node scripts/seed.mjs
 * Reads MONGODB_URI from .env.local (or the environment).
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import mongoose from "mongoose"

const require = createRequire(import.meta.url)
const root = process.cwd()

// --- env ---------------------------------------------------------------
function loadEnv() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const envPath = path.join(root, ".env.local")
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf8").match(/^MONGODB_URI=(.*)$/m)
    if (m) return m[1].trim()
  }
  throw new Error("MONGODB_URI not set (env or .env.local)")
}

const User = require("../lib/models/User")
const Product = require("../lib/models/Product")
const CommunityPost = require("../lib/models/CommunityPost")
const CropListing = require("../lib/models/CropListing")

// --- demo data ---------------------------------------------------------

const PASSWORD = "password123"

const USERS = [
  {
    name: "Muhammad Aslam",
    mobile: "03001234567",
    role: "farmer",
    village: "Chak 204 RB",
    district: "Faisalabad",
    state: "Punjab",
    isVerified: true,
    landSize: { value: 12, unit: "acres" },
  },
  {
    name: "Fatima Bibi",
    mobile: "03211234567",
    role: "farmer",
    village: "Bhitshah",
    district: "Matiari",
    state: "Sindh",
    isVerified: true,
    landSize: { value: 5, unit: "acres" },
  },
  {
    name: "Gul Khan",
    mobile: "03331234567",
    role: "farmer",
    village: "Takht Bhai",
    district: "Mardan",
    state: "Khyber Pakhtunkhwa",
    isVerified: true,
    landSize: { value: 8, unit: "acres" },
  },
  {
    name: "Dr. Ayesha Siddiqui",
    mobile: "03451234567",
    role: "agriculture_expert",
    village: "Model Town",
    district: "Lahore",
    state: "Punjab",
    isVerified: true,
    qualification: "PhD Plant Pathology, University of Agriculture Faisalabad",
    specialization: ["crop_disease", "soil_management"],
  },
  {
    name: "Bilal Traders",
    mobile: "03009876543",
    role: "seller",
    village: "Sabzi Mandi",
    district: "Multan",
    state: "Punjab",
    isVerified: true,
  },
]

const PRODUCTS = [
  {
    name: "Wheat Seed — Akbar 2019 (Certified)",
    description:
      "Punjab Seed Corporation certified wheat seed, rust tolerant, suited to irrigated central Punjab. Bag of 50 kg.",
    category: "seeds",
    subcategory: "wheat",
    brand: "Punjab Seed Corporation",
    price: { mrp: 6500, selling: 6100, currency: "PKR" },
    stock: { quantity: 120, unit: "bags" },
  },
  {
    name: "Urea Fertiliser (50 kg bag)",
    description: "Nitrogen fertiliser for top dressing wheat, maize and rice. Standard 50 kg bag.",
    category: "fertilizers",
    subcategory: "nitrogen",
    brand: "Engro",
    price: { mrp: 4800, selling: 4550, currency: "PKR" },
    stock: { quantity: 300, unit: "bags" },
  },
  {
    name: "Tebuconazole 250 EC — 1 litre",
    description:
      "Systemic fungicide for wheat leaf and yellow rust. Follow the label; wear gloves and a mask when spraying.",
    category: "pesticides",
    subcategory: "fungicide",
    brand: "Syngenta",
    price: { mrp: 3200, selling: 2950, currency: "PKR" },
    stock: { quantity: 60, unit: "bottles" },
  },
  {
    name: "Knapsack Sprayer 16 litre",
    description: "Manual knapsack sprayer with brass nozzle, suitable for smallholder plots.",
    category: "equipment",
    subcategory: "sprayer",
    brand: "Kisan",
    price: { mrp: 7500, selling: 6900, currency: "PKR" },
    stock: { quantity: 25, unit: "pieces" },
  },
]

const POSTS = [
  {
    title: "Yellow rust appearing in Faisalabad — anyone else?",
    content:
      "I noticed yellow stripes on my wheat flag leaves this week in Chak 204 RB. Sprayed Tebuconazole at 200 ml per acre. Has anyone in the district seen the same? Which variety are you growing?",
    category: "crops",
    tags: ["wheat", "rust", "faisalabad"],
  },
  {
    title: "Kissan Card loan — how long did activation take for you?",
    content:
      "Applied for the CM Punjab Kissan Card three weeks ago through the 8070 SMS service. Still waiting for activation. How long did it take for others in Punjab?",
    category: "government",
    tags: ["kissan-card", "subsidy", "punjab"],
  },
  {
    title: "Cotton picking rates in south Punjab this season",
    content:
      "Labour is asking higher rates for picking around Multan this year. What are you paying per 40 kg? Trying to budget before the next picking round.",
    category: "market",
    tags: ["cotton", "multan", "labour"],
  },
  {
    title: "Is solar tubewell conversion worth it on 8 acres?",
    content:
      "Diesel cost is killing my margins. Looking at the Punjab solarisation grant. For those who converted — what was your actual out-of-pocket cost and how much did you save per month?",
    category: "general",
    tags: ["solar", "tubewell", "irrigation"],
  },
]

// Prices are PKR per maund (~40 kg), the unit Pakistani mandis trade in.
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

const LISTINGS = [
  {
    cropName: "Basmati Rice (Super Kernel)",
    category: "grains",
    variety: "Super Kernel Basmati",
    quantity: { available: 200, unit: "maund" },
    pricing: { basePrice: 4800, negotiable: true, minPrice: 4500 },
    quality: { grade: "A", organic: false, harvestDate: daysFromNow(-20), shelfLife: 365 },
    location: {
      farmAddress: "Chak 204 RB, Jaranwala Road",
      village: "Chak 204 RB",
      district: "Faisalabad",
      state: "Punjab",
      pincode: "38000",
    },
    availability: { availableFrom: daysFromNow(-10), availableTill: daysFromNow(60) },
  },
  {
    cropName: "Cotton (Phutti)",
    category: "cash_crops",
    variety: "BT Cotton FH-142",
    quantity: { available: 150, unit: "maund" },
    pricing: { basePrice: 8200, negotiable: true, minPrice: 7800 },
    quality: { grade: "B", organic: false, harvestDate: daysFromNow(-8), shelfLife: 180 },
    location: {
      farmAddress: "Near Bhitshah Sharif",
      village: "Bhitshah",
      district: "Matiari",
      state: "Sindh",
      pincode: "70140",
    },
    availability: { availableFrom: daysFromNow(-5), availableTill: daysFromNow(45) },
  },
]

// --- run ---------------------------------------------------------------

async function main() {
  const uri = loadEnv()
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 })
  console.log(`connected: ${mongoose.connection.name}`)

  // Only clear what this script owns. Scraped marketprices are left intact.
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    CommunityPost.deleteMany({}),
    CropListing.deleteMany({}),
  ])
  console.log("cleared: users, products, communityposts, croplistings")

  // create() (never insertMany) so pre-save hooks run: bcrypt password
  // hashing on User, and slug generation on Product.seoUrl.
  const users = []
  for (const u of USERS) {
    users.push(await User.create({ ...u, password: PASSWORD }))
  }
  const [aslam, fatima, , , seller] = users
  console.log(`users: ${users.length}`)

  const products = []
  for (const p of PRODUCTS) {
    products.push(
      await Product.create({
        ...p,
        seller: seller._id,
        isActive: true,
        location: { state: "Punjab", district: "Multan" },
      }),
    )
  }
  console.log(`products: ${products.length}`)

  const authors = [aslam, aslam, seller, fatima]
  const posts = []
  for (let i = 0; i < POSTS.length; i++) {
    posts.push(await CommunityPost.create({ ...POSTS[i], author: authors[i]._id }))
  }
  console.log(`community posts: ${posts.length}`)

  const owners = [aslam, fatima]
  const listings = []
  for (let i = 0; i < LISTINGS.length; i++) {
    listings.push(
      await CropListing.create({ ...LISTINGS[i], farmer: owners[i]._id, status: "active" }),
    )
  }
  console.log(`crop listings: ${listings.length}`)

  const prices = await mongoose.connection.db.collection("marketprices").countDocuments()
  console.log(`market prices left intact: ${prices}`)

  console.log(`\nDone. Demo login — mobile 03001234567 / password ${PASSWORD}`)
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error("seed failed:", e.message)
  process.exit(1)
})
