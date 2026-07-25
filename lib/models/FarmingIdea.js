const mongoose = require("mongoose")

const farmingIdeaSchema = new mongoose.Schema(
  {
    title: {
      en: { type: String, required: true },
      hi: String,
      te: String,
    },
    shortDescription: {
      en: { type: String, required: true },
      hi: String,
      te: String,
    },
    detailedDescription: {
      en: { type: String, required: true },
      hi: String,
      te: String,
    },
    category: {
      type: String,
      enum: [
        "organic-farming",
        "natural-fertilizers",
        "pest-control",
        "irrigation-techniques",
        "soil-management",
        "crop-rotation",
        "intercropping",
        "water-conservation",
        "post-harvest",
        "value-addition",
        "marketing",
        "technology",
        "sustainable-practices",
        "climate-smart",
        "livestock-integration",
      ],
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      required: true,
    },
    implementationTime: {
      value: Number,
      unit: {
        type: String,
        enum: ["days", "weeks", "months", "seasons"],
      },
    },
    cost: {
      range: {
        type: String,
        enum: ["free", "low", "medium", "high"],
        required: true,
      },
      estimatedAmount: {
        min: Number,
        max: Number,
        currency: { type: String, default: "PKR" },
      },
    },
    applicableSeasons: [
      {
        type: String,
        enum: ["kharif", "rabi", "zaid", "year-round"],
      },
    ],
    suitableFor: {
      landSize: [
        {
          type: String,
          enum: ["small", "medium", "large", "any"],
        },
      ],
      soilTypes: [
        {
          type: String,
          enum: ["clay", "sandy", "loamy", "black", "red", "alluvial", "laterite", "any"],
        },
      ],
      crops: [String],
      regions: [String],
    },
    materials: [
      {
        name: String,
        quantity: String,
        cost: Number,
        alternatives: [String],
        localAvailability: {
          type: String,
          enum: ["easily-available", "moderately-available", "hard-to-find"],
        },
      },
    ],
    steps: [
      {
        stepNumber: Number,
        title: {
          en: String,
          hi: String,
          te: String,
        },
        description: {
          en: String,
          hi: String,
          te: String,
        },
        duration: String,
        tips: [String],
        warnings: [String],
        images: [String],
      },
    ],
    benefits: {
      environmental: [String],
      economic: [String],
      social: [String],
      health: [String],
    },
    expectedResults: {
      yieldIncrease: {
        percentage: Number,
        description: String,
      },
      costReduction: {
        percentage: Number,
        description: String,
      },
      qualityImprovement: String,
      timeframe: String,
    },
    scientificBasis: {
      researchPapers: [String],
      institutions: [String],
      trials: [
        {
          location: String,
          duration: String,
          results: String,
        },
      ],
    },
    successStories: [
      {
        farmerName: String,
        location: String,
        landSize: String,
        crops: [String],
        results: String,
        testimonial: {
          en: String,
          hi: String,
          te: String,
        },
        images: [String],
        contactAllowed: Boolean,
      },
    ],
    relatedIdeas: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FarmingIdea",
      },
    ],
    tags: [String],
    rating: {
      average: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    popularity: {
      views: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      implementations: { type: Number, default: 0 },
    },
    author: {
      name: String,
      credentials: String,
      organization: String,
      contact: String,
    },
    verification: {
      status: {
        type: String,
        enum: ["verified", "pending", "unverified"],
        default: "pending",
      },
      verifiedBy: String,
      verificationDate: Date,
      expertReview: String,
    },
    multimedia: {
      images: [
        {
          url: String,
          caption: String,
          alt: String,
        },
      ],
      videos: [
        {
          url: String,
          title: String,
          duration: String,
          language: String,
        },
      ],
      documents: [
        {
          url: String,
          title: String,
          type: String,
        },
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for efficient queries
farmingIdeaSchema.index({ category: 1, difficulty: 1 })
farmingIdeaSchema.index({ "suitableFor.crops": 1 })
farmingIdeaSchema.index({ "suitableFor.soilTypes": 1 })
farmingIdeaSchema.index({ tags: 1 })
farmingIdeaSchema.index({ "rating.average": -1, "popularity.views": -1 })
farmingIdeaSchema.index({ isFeatured: -1, "rating.average": -1 })

// Get personalized ideas for farmer
farmingIdeaSchema.statics.getPersonalizedIdeas = function (farmerProfile, limit = 10) {
  const query = { isActive: true }

  // Match soil type
  if (farmerProfile.soilType) {
    query["suitableFor.soilTypes"] = { $in: [farmerProfile.soilType, "any"] }
  }

  // Match land size category
  let landCategory = "small"
  if (farmerProfile.landSize.value > 5) landCategory = "medium"
  if (farmerProfile.landSize.value > 20) landCategory = "large"

  query["suitableFor.landSize"] = { $in: [landCategory, "any"] }

  // Match difficulty with experience
  const experienceLevel = farmerProfile.getExperienceLevel()
  const suitableDifficulties = []

  if (experienceLevel === "beginner") suitableDifficulties.push("beginner")
  if (experienceLevel === "intermediate") suitableDifficulties.push("beginner", "intermediate")
  if (experienceLevel === "expert") suitableDifficulties.push("beginner", "intermediate", "advanced")

  query.difficulty = { $in: suitableDifficulties }

  return this.find(query).sort({ "rating.average": -1, "popularity.views": -1 }).limit(limit)
}

// Get ideas by category
farmingIdeaSchema.statics.getByCategory = function (category, limit = 20) {
  return this.find({ category, isActive: true }).sort({ isFeatured: -1, "rating.average": -1 }).limit(limit)
}

// Get trending ideas
farmingIdeaSchema.statics.getTrending = function (days = 30, limit = 10) {
  // This would typically involve more complex aggregation
  // For now, we'll sort by recent popularity
  return this.find({ isActive: true }).sort({ "popularity.views": -1, "popularity.implementations": -1 }).limit(limit)
}

// Update popularity metrics
farmingIdeaSchema.methods.incrementView = function () {
  this.popularity.views += 1
  return this.save()
}

farmingIdeaSchema.methods.incrementLike = function () {
  this.popularity.likes += 1
  return this.save()
}

farmingIdeaSchema.methods.incrementImplementation = function () {
  this.popularity.implementations += 1
  return this.save()
}

// Calculate implementation score
farmingIdeaSchema.methods.getImplementationScore = function (farmerProfile) {
  let score = 0

  // Soil compatibility
  if (this.suitableFor.soilTypes.includes(farmerProfile.soilType) || this.suitableFor.soilTypes.includes("any")) {
    score += 25
  }

  // Land size compatibility
  const landCategory =
    farmerProfile.landSize.value <= 5 ? "small" : farmerProfile.landSize.value <= 20 ? "medium" : "large"
  if (this.suitableFor.landSize.includes(landCategory) || this.suitableFor.landSize.includes("any")) {
    score += 20
  }

  // Experience level match
  const experienceLevel = farmerProfile.getExperienceLevel()
  if (
    (experienceLevel === "beginner" && this.difficulty === "beginner") ||
    (experienceLevel === "intermediate" && ["beginner", "intermediate"].includes(this.difficulty)) ||
    (experienceLevel === "expert" && ["beginner", "intermediate", "advanced"].includes(this.difficulty))
  ) {
    score += 20
  }

  // Cost affordability (assuming based on land size as proxy for income)
  const affordableCosts =
    farmerProfile.landSize.value > 10 ? ["free", "low", "medium", "high"] : ["free", "low", "medium"]
  if (affordableCosts.includes(this.cost.range)) {
    score += 15
  }

  // Rating bonus
  score += (this.rating.average / 5) * 10

  // Popularity bonus
  if (this.popularity.implementations > 100) score += 10

  return Math.min(score, 100)
}

module.exports = mongoose.models.FarmingIdea || mongoose.model("FarmingIdea", farmingIdeaSchema)
