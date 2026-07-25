const mongoose = require("mongoose")

const cropRecommendationSchema = new mongoose.Schema(
  {
    cropName: {
      type: String,
      required: true,
      index: true,
    },
    localNames: {
      en: String,
      hi: String,
      te: String,
    },
    category: {
      type: String,
      enum: ["cereal", "pulse", "oilseed", "cash-crop", "vegetable", "fruit", "spice", "fodder"],
      required: true,
    },
    season: {
      type: String,
      enum: ["kharif", "rabi", "zaid", "perennial"],
      required: true,
    },
    duration: {
      type: Number, // days
      required: true,
    },

    // Soil and Climate Requirements
    suitableSoils: [
      {
        type: String,
        enum: ["clay", "sandy", "loamy", "black", "red", "alluvial", "laterite"],
      },
    ],
    climateRequirements: {
      temperature: {
        min: Number, // Celsius
        max: Number,
        optimal: Number,
      },
      rainfall: {
        min: Number, // mm
        max: Number,
        optimal: Number,
      },
      humidity: {
        min: Number, // percentage
        max: Number,
      },
    },

    // Cultivation Details
    sowingTime: {
      start: String, // e.g., "June"
      end: String,
      optimal: String,
    },
    harvestTime: {
      start: String,
      end: String,
    },
    spacing: {
      rowToRow: Number, // cm
      plantToPlant: Number,
    },
    seedRate: {
      value: Number,
      unit: String, // kg/hectare
    },

    // Yield and Economics
    expectedYield: {
      min: Number, // quintals per hectare
      max: Number,
      average: Number,
    },
    marketPrice: {
      min: Number, // per quintal
      max: Number,
      average: Number,
    },
    profitability: {
      type: String,
      enum: ["low", "medium", "high", "very-high"],
      default: "medium",
    },
    investmentRequired: {
      seeds: Number,
      fertilizers: Number,
      pesticides: Number,
      labor: Number,
      irrigation: Number,
      total: Number,
    },

    // Care Instructions
    fertilizers: [
      {
        name: String,
        quantity: String,
        timing: String,
        method: String,
      },
    ],
    irrigation: {
      frequency: String,
      method: String,
      criticalStages: [String],
    },
    pestManagement: [
      {
        pest: String,
        symptoms: [String],
        organicTreatment: [String],
        chemicalTreatment: [String],
        preventiveMeasures: [String],
      },
    ],
    diseaseManagement: [
      {
        disease: String,
        symptoms: [String],
        organicTreatment: [String],
        chemicalTreatment: [String],
        preventiveMeasures: [String],
      },
    ],

    // Regional Information
    suitableStates: [String],
    majorProducingDistricts: [String],
    marketDemand: {
      type: String,
      enum: ["low", "medium", "high", "very-high"],
      default: "medium",
    },

    // Additional Information
    nutritionalValue: {
      protein: Number,
      carbohydrates: Number,
      fat: Number,
      fiber: Number,
      minerals: [String],
    },
    uses: [String], // food, fodder, industrial, etc.
    storageRequirements: {
      temperature: String,
      humidity: String,
      duration: String,
      method: String,
    },

    // Sustainability
    waterRequirement: {
      type: String,
      enum: ["low", "medium", "high", "very-high"],
      default: "medium",
    },
    soilHealthImpact: {
      type: String,
      enum: ["negative", "neutral", "positive", "very-positive"],
      default: "neutral",
    },
    carbonFootprint: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    // Recommendations Score Factors
    adaptabilityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    riskFactor: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    // Metadata
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    dataSource: {
      type: String,
      default: "agricultural-research",
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for efficient queries
cropRecommendationSchema.index({ season: 1, suitableSoils: 1 })
cropRecommendationSchema.index({ suitableStates: 1 })
cropRecommendationSchema.index({ category: 1, marketDemand: -1 })
cropRecommendationSchema.index({ profitability: -1, adaptabilityScore: -1 })

// Calculate recommendation score based on farmer profile
cropRecommendationSchema.methods.calculateScore = function (farmerProfile) {
  let score = 0

  // Soil compatibility (30 points)
  if (this.suitableSoils.includes(farmerProfile.soilType)) {
    score += 30
  }

  // Regional suitability (25 points)
  if (this.suitableStates.includes(farmerProfile.state)) {
    score += 25
  }

  // Market demand (20 points)
  const demandScores = { low: 5, medium: 10, high: 15, "very-high": 20 }
  score += demandScores[this.marketDemand] || 10

  // Profitability (15 points)
  const profitScores = { low: 3, medium: 7, high: 12, "very-high": 15 }
  score += profitScores[this.profitability] || 7

  // Experience match (10 points)
  const experienceLevel = farmerProfile.getExperienceLevel()
  if (experienceLevel === "expert" || this.riskFactor === "low") {
    score += 10
  } else if (experienceLevel === "intermediate" && this.riskFactor === "medium") {
    score += 7
  } else if (experienceLevel === "beginner" && this.riskFactor === "low") {
    score += 5
  }

  return Math.min(score, 100)
}

// Get seasonal recommendations
cropRecommendationSchema.statics.getSeasonalRecommendations = function (season, limit = 10) {
  return this.find({ season, isActive: true }).sort({ adaptabilityScore: -1, marketDemand: -1 }).limit(limit)
}

// Get recommendations by soil type
cropRecommendationSchema.statics.getBySoilType = function (soilType, limit = 10) {
  return this.find({ suitableSoils: soilType, isActive: true })
    .sort({ profitability: -1, marketDemand: -1 })
    .limit(limit)
}

module.exports = mongoose.models.CropRecommendation || mongoose.model("CropRecommendation", cropRecommendationSchema)
