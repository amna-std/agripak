const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const cropHistorySchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      required: true,
      min: 2000,
      max: new Date().getFullYear(),
    },
    season: {
      type: String,
      enum: ["kharif", "rabi", "zaid", "summer"],
      required: true,
    },
    cropName: {
      type: String,
      required: true,
      trim: true,
    },
    variety: {
      type: String,
      trim: true,
    },
    area: {
      type: Number, // in acres
      required: true,
      min: 0.1,
    },
    yield: {
      type: Number, // in quintals
      min: 0,
    },
    profit: {
      type: Number, // in rupees
    },
    loss: {
      type: Number, // in rupees
      default: 0,
    },
    challenges: [
      {
        type: String,
        enum: [
          "drought",
          "flood",
          "pest",
          "disease",
          "market_price",
          "labor",
          "fertilizer_cost",
          "seed_quality",
          "weather",
        ],
      },
    ],
    fertilizers: [
      {
        name: String,
        quantity: Number,
        cost: Number,
      },
    ],
    pesticides: [
      {
        name: String,
        quantity: Number,
        cost: Number,
      },
    ],
    notes: String,
  },
  { timestamps: true },
)

const currentCropSchema = new mongoose.Schema(
  {
    cropName: {
      type: String,
      required: true,
      trim: true,
    },
    variety: String,
    area: {
      type: Number,
      required: true,
      min: 0.1,
    },
    sowingDate: {
      type: Date,
      required: true,
    },
    expectedHarvest: Date,
    stage: {
      type: String,
      enum: ["sowing", "germination", "vegetative", "flowering", "fruiting", "maturity", "harvest"],
      default: "sowing",
    },
    healthStatus: {
      type: String,
      enum: ["excellent", "good", "average", "poor", "critical"],
      default: "good",
    },
    issues: [String],
    treatments: [
      {
        date: Date,
        treatment: String,
        cost: Number,
      },
    ],
  },
  { timestamps: true },
)

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    mobile: {
      type: String,
      required: true,
      unique: true,
      // Pakistani mobile: 11 digits beginning 03 (e.g. 03001234567).
      match: [/^03\d{9}$/, "Enter a valid Pakistani mobile number (03XXXXXXXXX)"],
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    // CNIC — Pakistan's national identity number, issued by NADRA.
    // Accepted with or without dashes: 1234512345671 or 12345-1234567-1.
    cnic: {
      type: String,
      unique: true,
      sparse: true,
      match: [/^\d{5}-?\d{7}-?\d$/, "Enter a valid CNIC (e.g. 35202-1234567-1)"],
    },

    // Role-based system
    role: {
  type: String,
  enum: ["farmer", "agri_doctor", "agriculture_expert", "admin", "seller", "expert"],
  default: "farmer",
  required: true,
    },

    // Professional Information (for experts and doctors)
    qualification: {
      type: String,
      trim: true,
    },
    experience: {
      type: Number, // years of experience
      min: 0,
      max: 50,
    },
    specialization: [
      {
        type: String,
        enum: [
          "crop_diseases",
          "crop_disease",
          "soil_management",
          "organic_farming",
          "pest_control",
          "irrigation",
          "horticulture",
          "animal_husbandry",
          "agri_technology",
        ],
      },
    ],
    license: {
      number: String,
      authority: String,
      validTill: Date,
    },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },

    // Location Information
    village: {
      type: String,
      required: true,
      trim: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    pincode: {
      type: String,
      match: [/^\d{5}$/, "Enter a valid Pakistani postal code (5 digits)"],
    },
    coordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },

    // Farm Information (for farmers)
    landSize: {
      value: {
        type: Number,
        min: 0.1,
      },
      unit: {
        type: String,
        enum: ["acres", "hectares"],
        default: "acres",
      },
    },
    soilType: {
      type: String,
      enum: ["clay", "sandy", "loamy", "black", "red", "alluvial", "laterite", "saline", "acidic"],
    },
    irrigationType: {
      type: String,
      enum: ["rainfed", "canal", "borewell", "drip", "sprinkler", "flood", "furrow"],
      default: "rainfed",
    },
    farmingType: {
      type: String,
      enum: ["organic", "conventional", "mixed", "natural", "biodynamic"],
      default: "conventional",
    },
    farmEquipment: [
      {
        name: String,
        type: String,
        purchaseDate: Date,
        condition: {
          type: String,
          enum: ["excellent", "good", "average", "poor"],
        },
      },
    ],

    // Crop Information
    cropHistory: [cropHistorySchema],
    currentCrops: [currentCropSchema],
    preferredCrops: [String],
    cropRotationPlan: [
      {
        season: String,
        crops: [String],
        year: Number,
      },
    ],

    // Preferences & Settings
    preferredLanguage: {
      type: String,
      enum: ["en", "ur", "pa", "sd", "ps"],
      default: "en",
    },
    voiceEnabled: {
      type: Boolean,
      default: true,
    },
    voiceLanguage: {
      type: String,
      enum: ["en-PK", "ur-PK", "pa-PK", "sd-PK", "ps-AF"],
      default: "en-PK",
    },
    theme: {
      type: String,
      enum: ["light", "dark", "auto"],
      default: "light",
    },
    notifications: {
      weather: { type: Boolean, default: true },
      market: { type: Boolean, default: true },
      schemes: { type: Boolean, default: true },
      crops: { type: Boolean, default: true },
      ideas: { type: Boolean, default: true },
      community: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },

    // Verification & Security
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationOTP: {
      code: String,
      expiresAt: Date,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    // Activity Tracking
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    profileCompleteness: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },

    // Additional Information
    education: {
      type: String,
      enum: ["illiterate", "primary", "secondary", "higher_secondary", "graduate", "post_graduate", "phd"],
    },
    annualIncome: {
      type: String,
      enum: ["below_1lakh", "1_3lakh", "3_5lakh", "5_10lakh", "above_10lakh"],
    },
    familyMembers: {
      type: Number,
      min: 1,
      max: 20,
    },
    dependents: {
      type: Number,
      min: 0,
      max: 15,
    },

    // Financial Information
    bankDetails: {
      accountNumber: String,
      iban: String,
      bankName: String,
      branchName: String,
      accountType: {
        type: String,
        enum: ["savings", "current", "joint"],
      },
    },
    kccDetails: {
      hasKCC: { type: Boolean, default: false },
      limit: Number,
      bank: String,
      issueDate: Date,
      expiryDate: Date,
    },

    // Social & Community
    whatsappNumber: String,
    socialMedia: {
      facebook: String,
      youtube: String,
      instagram: String,
    },
    communityGroups: [
      {
        groupId: { type: mongoose.Schema.Types.ObjectId, ref: "CommunityGroup" },
        role: {
          type: String,
          enum: ["member", "moderator", "admin"],
          default: "member",
        },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Achievements & Gamification
    badges: [
      {
        name: String,
        description: String,
        earnedAt: Date,
        icon: String,
      },
    ],
    points: {
      type: Number,
      default: 0,
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
      max: 100,
    },

    // Subscription & Premium Features
    subscription: {
      plan: {
        type: String,
        enum: ["free", "basic", "premium", "expert"],
        default: "free",
      },
      startDate: Date,
      endDate: Date,
      isActive: { type: Boolean, default: false },
    },

    // Privacy Settings
    privacy: {
      showProfile: { type: Boolean, default: true },
      showCrops: { type: Boolean, default: true },
      showLocation: { type: Boolean, default: false },
      allowMessages: { type: Boolean, default: true },
    },

    // Device & App Information
    deviceInfo: {
      platform: String,
      version: String,
      lastIP: String,
      pushToken: String,
    },

    // Bookmarks & Favorites
    bookmarkedSchemes: [{ type: mongoose.Schema.Types.ObjectId, ref: "GovernmentScheme" }],
    bookmarkedIdeas: [{ type: mongoose.Schema.Types.ObjectId, ref: "FarmingIdea" }],
    bookmarkedVideos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Video" }],
    favoriteExperts: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Analytics & Insights
    analytics: {
      profileViews: { type: Number, default: 0 },
      postsShared: { type: Number, default: 0 },
      questionsAsked: { type: Number, default: 0 },
      answersGiven: { type: Number, default: 0 },
      videosWatched: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for better performance
userSchema.index({ mobile: 1 })
userSchema.index({ email: 1 })
userSchema.index({ role: 1 })
userSchema.index({ district: 1, state: 1 })
userSchema.index({ soilType: 1 })
userSchema.index({ "coordinates.latitude": 1, "coordinates.longitude": 1 })
userSchema.index({ isActive: 1, lastSeen: -1 })
userSchema.index({ "subscription.plan": 1, "subscription.isActive": 1 })

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()

  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Calculate profile completeness
userSchema.pre("save", function (next) {
  let completeness = 0
  const totalFields = 20

  // Basic fields (5 points each)
  const basicFields = ["name", "mobile", "village", "district", "state"]
  basicFields.forEach((field) => {
    if (this.get(field)) completeness += 5
  })

  // Role-specific fields
  if (this.role === "farmer") {
    if (this.landSize?.value) completeness += 5
    if (this.soilType) completeness += 5
    if (this.farmingType) completeness += 5
    if (this.cropHistory.length > 0) completeness += 10
    if (this.currentCrops.length > 0) completeness += 10
  } else {
    if (this.qualification) completeness += 10
    if (this.experience) completeness += 10
    if (this.specialization.length > 0) completeness += 15
  }

  // Optional fields (5 points each)
  if (this.email) completeness += 5
  if (this.cnic) completeness += 5
  if (this.education) completeness += 5
  if (this.coordinates?.latitude && this.coordinates?.longitude) completeness += 5
  if (this.bankDetails?.accountNumber) completeness += 5

  this.profileCompleteness = Math.min(completeness, 100)
  next()
})

// Update voice language based on preferred language
userSchema.pre("save", function (next) {
  if (this.isModified("preferredLanguage")) {
    const languageMap = {
      en: "en-US",
      hi: "hi-IN",
      te: "te-IN",
    }
    this.voiceLanguage = languageMap[this.preferredLanguage] || "en-US"
  }
  next()
})

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Generate OTP
userSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  this.verificationOTP = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  }
  return otp
}

// Verify OTP
userSchema.methods.verifyOTP = function (otp) {
  if (!this.verificationOTP || !this.verificationOTP.code) return false
  if (new Date() > this.verificationOTP.expiresAt) return false
  return this.verificationOTP.code === otp
}

// Remove sensitive data from JSON output
userSchema.methods.toJSON = function () {
  const user = this.toObject()
  delete user.password
  delete user.verificationOTP
  delete user.bankDetails
  delete user.cnic
  return user
}

// Get user's current season crops
userSchema.methods.getCurrentSeasonCrops = function () {
  const currentMonth = new Date().getMonth() + 1
  let season = "kharif"

  if (currentMonth >= 4 && currentMonth <= 6) season = "zaid"
  else if (currentMonth >= 10 || currentMonth <= 3) season = "rabi"

  return this.cropHistory.filter((crop) => crop.season === season)
}

// Get experience level
userSchema.methods.getExperienceLevel = function () {
  if (!this.experience) return "beginner"
  if (this.experience < 5) return "beginner"
  if (this.experience < 15) return "intermediate"
  return "expert"
}

// Calculate farming success rate
userSchema.methods.getFarmingSuccessRate = function () {
  if (this.cropHistory.length === 0) return 0

  const successfulCrops = this.cropHistory.filter((crop) => crop.profit > 0 && crop.yield > 0).length

  return Math.round((successfulCrops / this.cropHistory.length) * 100)
}

// Get recommended crops based on history and season
userSchema.methods.getRecommendedCrops = function () {
  const currentMonth = new Date().getMonth() + 1
  let season = "kharif"

  if (currentMonth >= 4 && currentMonth <= 6) season = "zaid"
  else if (currentMonth >= 10 || currentMonth <= 3) season = "rabi"

  // Get successful crops from history
  const successfulCrops = this.cropHistory
    .filter((crop) => crop.season === season && crop.profit > 0)
    .map((crop) => crop.cropName)

  return [...new Set(successfulCrops)]
}

// Add points and check for level up
userSchema.methods.addPoints = function (points) {
  this.points += points
  const newLevel = Math.floor(this.points / 1000) + 1

  if (newLevel > this.level) {
    this.level = newLevel
    return { levelUp: true, newLevel }
  }

  return { levelUp: false, newLevel: this.level }
}

// Check if user can access premium features
userSchema.methods.hasPremiumAccess = function () {
  if (!this.subscription.isActive) return false
  if (new Date() > this.subscription.endDate) return false
  return ["premium", "expert"].includes(this.subscription.plan)
}

module.exports = mongoose.models.User || mongoose.model("User", userSchema)
