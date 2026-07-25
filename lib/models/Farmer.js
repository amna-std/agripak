const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const cropHistorySchema = new mongoose.Schema({
  year: {
    type: Number,
    required: true,
  },
  season: {
    type: String,
    enum: ["kharif", "rabi", "zaid"],
    required: true,
  },
  cropName: {
    type: String,
    required: true,
  },
  area: {
    type: Number, // in acres
    required: true,
  },
  yield: {
    type: Number, // in quintals
  },
  profit: {
    type: Number, // in rupees
  },
  challenges: [String], // diseases, pests, weather issues
})

const farmerSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: true,
      trim: true,
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
      latitude: { type: Number },
      longitude: { type: Number },
    },

    // Farm Information
    landSize: {
      value: {
        type: Number,
        required: true,
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
      required: true,
      enum: ["clay", "sandy", "loamy", "black", "red", "alluvial", "laterite"],
    },
    irrigationType: {
      type: String,
      enum: ["rainfed", "canal", "borewell", "drip", "sprinkler"],
      default: "rainfed",
    },
    farmingType: {
      type: String,
      enum: ["organic", "conventional", "mixed"],
      default: "conventional",
    },

    // Crop History
    cropHistory: [cropHistorySchema],
    currentCrops: [
      {
        cropName: String,
        area: Number,
        sowingDate: Date,
        expectedHarvest: Date,
        stage: {
          type: String,
          enum: ["sowing", "germination", "vegetative", "flowering", "maturity", "harvest"],
        },
      },
    ],

    // Preferences
    preferredLanguage: {
      type: String,
      enum: ["en", "ur", "pa", "sd", "ps"],
      default: "en",
    },
    voiceEnabled: {
      type: Boolean,
      default: true,
    },
    notifications: {
      weather: { type: Boolean, default: true },
      market: { type: Boolean, default: true },
      schemes: { type: Boolean, default: true },
      crops: { type: Boolean, default: true },
      ideas: { type: Boolean, default: true },
    },

    // Verification
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationOTP: {
      code: String,
      expiresAt: Date,
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
    },

    // Additional Information
    experience: {
      type: Number, // years of farming experience
      min: 0,
    },
    education: {
      type: String,
      enum: ["illiterate", "primary", "secondary", "higher-secondary", "graduate", "post-graduate"],
    },
    annualIncome: {
      type: String,
      enum: ["below-1lakh", "1-3lakh", "3-5lakh", "5-10lakh", "above-10lakh"],
    },
    bankDetails: {
      accountNumber: String,
      iban: String,
      bankName: String,
      branchName: String,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for better performance
farmerSchema.index({ mobile: 1 })
farmerSchema.index({ district: 1, state: 1 })
farmerSchema.index({ soilType: 1 })
farmerSchema.index({ "coordinates.latitude": 1, "coordinates.longitude": 1 })

// Hash password before saving
farmerSchema.pre("save", async function (next) {
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
farmerSchema.pre("save", function (next) {
  let completeness = 0
  const fields = ["name", "mobile", "village", "district", "state", "landSize.value", "soilType", "preferredLanguage"]

  fields.forEach((field) => {
    if (this.get(field)) completeness += 12.5
  })

  if (this.email) completeness += 10
  if (this.experience) completeness += 10
  if (this.cropHistory.length > 0) completeness += 10

  this.profileCompleteness = Math.min(completeness, 100)
  next()
})

// Compare password method
farmerSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Generate OTP
farmerSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  this.verificationOTP = {
    code: otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  }
  return otp
}

// Verify OTP
farmerSchema.methods.verifyOTP = function (otp) {
  if (!this.verificationOTP || !this.verificationOTP.code) return false
  if (new Date() > this.verificationOTP.expiresAt) return false
  return this.verificationOTP.code === otp
}

// Remove sensitive data from JSON output
farmerSchema.methods.toJSON = function () {
  const farmer = this.toObject()
  delete farmer.password
  delete farmer.verificationOTP
  return farmer
}

// Get farmer's current season crops
farmerSchema.methods.getCurrentSeasonCrops = function () {
  const currentMonth = new Date().getMonth() + 1
  let season = "kharif"

  if (currentMonth >= 4 && currentMonth <= 6) season = "zaid"
  else if (currentMonth >= 10 || currentMonth <= 3) season = "rabi"

  return this.cropHistory.filter((crop) => crop.season === season)
}

// Get farming experience level
farmerSchema.methods.getExperienceLevel = function () {
  if (!this.experience) return "beginner"
  if (this.experience < 5) return "beginner"
  if (this.experience < 15) return "intermediate"
  return "expert"
}

module.exports = mongoose.models.Farmer || mongoose.model("Farmer", farmerSchema)
