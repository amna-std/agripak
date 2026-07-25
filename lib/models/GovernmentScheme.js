const mongoose = require("mongoose")

const eligibilityCriteriaSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: [
      "age",
      "income",
      "land_size",
      "crop_type",
      "farming_type",
      "location",
      "education",
      "gender",
      "caste",
      "other",
    ],
    required: true,
  },
  operator: {
    type: String,
    enum: ["equals", "greater_than", "less_than", "between", "in", "not_in", "contains"],
    required: true,
  },
  value: mongoose.Schema.Types.Mixed, // Can be string, number, array, or object
  description: String,
})

const applicationStepSchema = new mongoose.Schema({
  stepNumber: {
    type: Number,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: String,
  requiredDocuments: [String],
  estimatedTime: String, // e.g., "2-3 days", "1 week"
  isOnline: { type: Boolean, default: false },
  onlineUrl: String,
  officeAddress: String,
  contactInfo: {
    phone: String,
    email: String,
    office: String,
  },
})

const governmentSchemeSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: Object,
      required: true,
    },
    shortName: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    description: {
      type: Object,
      required: true,
    },

    // Multilingual Content
    content: {
      en: {
        name: String,
        description: String,
        benefits: String,
        howToApply: String,
      },
      hi: {
        name: String,
        description: String,
        benefits: String,
        howToApply: String,
      },
      te: {
        name: String,
        description: String,
        benefits: String,
        howToApply: String,
      },
    },

    // Scheme Classification
    category: {
      type: String,
      enum: [
        "financial_assistance",
        "crop_insurance",
        "subsidies",
        "loans_credit",
        "training_education",
        "infrastructure",
        "technology_adoption",
        "organic_farming",
        "water_conservation",
        "soil_health",
        "market_linkage",
        "women_empowerment",
        "youth_development",
        "disaster_relief",
        "pension_welfare",
      ],
      required: true,
    },
    subcategory: String,

    // Government Level
    level: {
      type: String,
      enum: ["central", "state", "district", "block", "panchayat"],
      required: true,
    },
    implementingAgency: {
      name: String,
      department: String,
      ministry: String,
      contactInfo: {
        website: String,
        helpline: String,
        email: String,
        address: String,
      },
    },

    // Geographic Coverage
    coverage: {
      type: String,
      enum: ["national", "state_specific", "district_specific", "region_specific"],
      required: true,
    },
    applicableStates: [String],
    applicableDistricts: [
      {
        state: String,
        districts: [String],
      },
    ],

    // Financial Details
    financialDetails: {
      budgetAllocated: Number,
      maxBenefitAmount: Number,
      minBenefitAmount: Number,
      benefitType: {
        type: String,
        enum: ["lump_sum", "installments", "subsidy_percentage", "loan", "insurance", "in_kind"],
      },
      subsidyPercentage: Number,
      processingFee: Number,
      currency: { type: String, default: "PKR" },
    },

    // Eligibility Criteria
    eligibilityCriteria: [eligibilityCriteriaSchema],
    targetBeneficiaries: [
      {
        type: String,
        enum: [
          "small_farmers",
          "marginal_farmers",
          "landless_farmers",
          "women_farmers",
          "young_farmers",
          "tribal_farmers",
          "sc_st_farmers",
          "all_farmers",
        ],
      },
    ],

    // Application Process
    applicationProcess: {
      isOnlineAvailable: { type: Boolean, default: false },
      onlinePortal: String,
      applicationSteps: [applicationStepSchema],
      requiredDocuments: [String],
      processingTime: String,
      applicationFee: Number,
    },

    // Important Dates
    timeline: {
      launchDate: Date,
      applicationStartDate: Date,
      applicationEndDate: Date,
      implementationStartDate: Date,
      implementationEndDate: Date,
      lastDateForClaims: Date,
    },

    // Status and Availability
    status: {
      type: String,
      enum: ["active", "inactive", "suspended", "closed", "upcoming"],
      default: "active",
    },
    isCurrentlyAcceptingApplications: {
      type: Boolean,
      default: true,
    },

    // Benefits and Features
    benefits: [
      {
        type: String,
        description: String,
        amount: Number,
        unit: String,
      },
    ],
    keyFeatures: [String],

    // Related Information
    relatedSchemes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GovernmentScheme",
      },
    ],
    prerequisites: [String],

    // Contact and Support
    supportContacts: [
      {
        level: {
          type: String,
          enum: ["national", "state", "district", "block"],
        },
        name: String,
        designation: String,
        phone: String,
        email: String,
        address: String,
        workingHours: String,
      },
    ],

    // External Links and Resources
    externalLinks: [
      {
        title: String,
        url: String,
        type: {
          type: String,
          enum: ["official_website", "application_portal", "guidelines", "faq", "news", "other"],
        },
      },
    ],

    // Media and Documents
    attachments: [
      {
        title: String,
        type: {
          type: String,
          enum: ["pdf", "image", "video", "audio", "document"],
        },
        url: String,
        size: Number,
        language: String,
      },
    ],

    // Analytics and Tracking
    stats: {
      totalApplications: { type: Number, default: 0 },
      approvedApplications: { type: Number, default: 0 },
      rejectedApplications: { type: Number, default: 0 },
      pendingApplications: { type: Number, default: 0 },
      totalBeneficiaries: { type: Number, default: 0 },
      totalAmountDisbursed: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
      bookmarks: { type: Number, default: 0 },
    },

    // User Interactions
    userInteractions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        action: {
          type: String,
          enum: ["viewed", "bookmarked", "applied", "shared", "rated"],
        },
        timestamp: { type: Date, default: Date.now },
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],

    // Reviews and Feedback
    reviews: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        isHelpful: Boolean,
        applicationStatus: {
          type: String,
          enum: ["applied", "approved", "rejected", "pending"],
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },

    // FAQ
    faq: [
      {
        question: String,
        answer: String,
        language: { type: String, default: "en" },
        category: String,
      },
    ],

    // Success Stories
    successStories: [
      {
        beneficiaryName: String,
        location: String,
        story: String,
        benefitReceived: String,
        impact: String,
        image: String,
        isVerified: { type: Boolean, default: false },
      },
    ],

    // --- Pakistan scheme refresh overlay -----------------------------------
    //
    // `lib/data/pakistan-schemes.ts` holds the curated baseline; the refresh
    // job in `lib/services/schemesRefresh.ts` re-verifies it against the live
    // web and stores the corrected record here. The API serves `curated`
    // verbatim and falls back to the file when no document exists, so these
    // three fields are what keep the schemes page current over time.
    //
    // The legacy fields above are still populated on write so the document
    // validates and stays readable by older code, but `curated` is the
    // canonical copy — it is the exact shape the API returns.

    /** Stable scheme id, matching `Scheme.id` in the curated file. */
    schemeKey: {
      type: String,
      trim: true,
      index: true,
      unique: true,
      sparse: true,
    },
    /** The full canonical Scheme object, exactly as served by /api/schemes. */
    curated: {
      type: mongoose.Schema.Types.Mixed,
    },
    /** Provenance for the last refresh run that touched this scheme. */
    refreshMeta: {
      lastRunAt: Date,
      model: String,
      /** False means the model never actually searched, so nothing was trusted. */
      grounded: Boolean,
      changesApplied: Number,
      changesRejected: Number,
      sourcesSeen: [String],
    },

    // Data Source and Updates
    dataSource: {
      type: String,
      enum: ["government_portal", "official_notification", "news", "manual_entry", "api"],
      default: "manual_entry",
    },
    sourceUrl: String,
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    lastVerified: Date,

    // Content Management
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // SEO and Discovery
    tags: [String],
    keywords: [String],

    // Notifications
    notificationsSent: [
      {
        type: {
          type: String,
          enum: ["launch", "deadline_reminder", "status_update", "new_guidelines"],
        },
        sentAt: Date,
        recipientCount: Number,
        channels: [String],
      },
    ],
  },
  {
    timestamps: true,
  },
)

// Indexes for better performance
governmentSchemeSchema.index({ category: 1, subcategory: 1 })
governmentSchemeSchema.index({ status: 1, isCurrentlyAcceptingApplications: 1 })
governmentSchemeSchema.index({ level: 1, coverage: 1 })
governmentSchemeSchema.index({ applicableStates: 1 })
governmentSchemeSchema.index({ "timeline.applicationEndDate": 1 })
governmentSchemeSchema.index({ tags: 1 })
governmentSchemeSchema.index({ "rating.average": -1, "stats.views": -1 })
governmentSchemeSchema.index({ createdAt: -1 })

// Virtual for application success rate
governmentSchemeSchema.virtual("successRate").get(function () {
  if (this.stats.totalApplications === 0) return 0
  return (this.stats.approvedApplications / this.stats.totalApplications) * 100
})

// Virtual for days remaining for application
governmentSchemeSchema.virtual("daysRemaining").get(function () {
  if (!this.timeline.applicationEndDate) return null
  const now = new Date()
  const endDate = new Date(this.timeline.applicationEndDate)
  const diffTime = endDate - now
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
})

// Method to check if user is eligible
governmentSchemeSchema.methods.checkEligibility = function (user) {
  const results = {
    isEligible: true,
    failedCriteria: [],
    score: 0,
    totalCriteria: this.eligibilityCriteria.length,
  }

  for (const criteria of this.eligibilityCriteria) {
    const isMatch = this.evaluateCriteria(criteria, user)
    if (isMatch) {
      results.score += 1
    } else {
      results.failedCriteria.push(criteria)
      results.isEligible = false
    }
  }

  // Check target beneficiaries
  if (this.targetBeneficiaries.length > 0 && user.role === "farmer") {
    const userCategory = this.getUserCategory(user)
    if (!this.targetBeneficiaries.includes(userCategory) && !this.targetBeneficiaries.includes("all_farmers")) {
      results.isEligible = false
      results.failedCriteria.push({
        category: "target_beneficiary",
        description: `This scheme is for ${this.targetBeneficiaries.join(", ")}`,
      })
    }
  }

  // Check location eligibility
  if (this.coverage !== "national") {
    const isLocationEligible = this.checkLocationEligibility(user)
    if (!isLocationEligible) {
      results.isEligible = false
      results.failedCriteria.push({
        category: "location",
        description: "This scheme is not available in your location",
      })
    }
  }

  return results
}

// Method to evaluate individual criteria
governmentSchemeSchema.methods.evaluateCriteria = function (criteria, user) {
  const userValue = this.getUserValue(criteria.category, user)

  switch (criteria.operator) {
    case "equals":
      return userValue === criteria.value
    case "greater_than":
      return userValue > criteria.value
    case "less_than":
      return userValue < criteria.value
    case "between":
      return userValue >= criteria.value.min && userValue <= criteria.value.max
    case "in":
      return Array.isArray(criteria.value) && criteria.value.includes(userValue)
    case "not_in":
      return Array.isArray(criteria.value) && !criteria.value.includes(userValue)
    case "contains":
      return userValue && userValue.toString().toLowerCase().includes(criteria.value.toLowerCase())
    default:
      return false
  }
}

// Method to get user value for criteria
governmentSchemeSchema.methods.getUserValue = (category, user) => {
  switch (category) {
    case "age":
      return user.dateOfBirth
        ? Math.floor((new Date() - new Date(user.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000))
        : null
    case "income":
      return user.annualIncome
    case "land_size":
      return user.landSize ? (user.landSize.unit === "hectares" ? user.landSize.value * 2.47 : user.landSize.value) : 0
    case "crop_type":
      return user.currentCrops ? user.currentCrops.map((crop) => crop.cropName) : []
    case "farming_type":
      return user.farmingType
    case "location":
      return { state: user.state, district: user.district }
    case "education":
      return user.education
    case "gender":
      return user.gender
    case "caste":
      return user.caste
    default:
      return null
  }
}

// Method to get user category
governmentSchemeSchema.methods.getUserCategory = (user) => {
  if (!user.landSize) return "landless_farmers"

  const landSizeInAcres = user.landSize.unit === "hectares" ? user.landSize.value * 2.47 : user.landSize.value

  if (landSizeInAcres <= 2.5) return "marginal_farmers"
  if (landSizeInAcres <= 5) return "small_farmers"
  return "large_farmers"
}

// Method to check location eligibility
governmentSchemeSchema.methods.checkLocationEligibility = function (user) {
  if (this.coverage === "national") return true

  if (this.applicableStates.length > 0) {
    if (!this.applicableStates.includes(user.state)) return false
  }

  if (this.applicableDistricts.length > 0) {
    const stateDistricts = this.applicableDistricts.find((item) => item.state === user.state)
    if (stateDistricts && !stateDistricts.districts.includes(user.district)) return false
  }

  return true
}

// Method to get localized content
governmentSchemeSchema.methods.getLocalizedContent = function (language = "en") {
  const content = this.content[language] || this.content.en || {}
  return {
    name: content.name || this.name,
    description: content.description || this.description,
    benefits: content.benefits || "",
    howToApply: content.howToApply || "",
  }
}

// Method to add user interaction
governmentSchemeSchema.methods.addInteraction = function (userId, action, metadata = {}) {
  this.userInteractions.push({
    user: userId,
    action: action,
    timestamp: new Date(),
    metadata: metadata,
  })

  // Update stats
  if (action === "viewed") this.stats.views += 1
  if (action === "bookmarked") this.stats.bookmarks += 1

  return this.save()
}

// Method to add review
governmentSchemeSchema.methods.addReview = function (userId, rating, comment, applicationStatus) {
  this.reviews.push({
    user: userId,
    rating: rating,
    comment: comment,
    applicationStatus: applicationStatus,
  })

  // Update rating
  this.updateRating()

  return this.save()
}

// Method to update rating
governmentSchemeSchema.methods.updateRating = function () {
  if (this.reviews.length > 0) {
    const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0)
    this.rating.average = totalRating / this.reviews.length
    this.rating.count = this.reviews.length
  }
}

// Static method to get schemes for user
governmentSchemeSchema.statics.getSchemesForUser = function (user, limit = 20) {
  const query = {
    status: "active",
    isCurrentlyAcceptingApplications: true,
  }

  // Add location filter
  if (user.state) {
    query.$or = [{ coverage: "national" }, { applicableStates: user.state }]
  }

  return this.find(query)
    .sort({ "rating.average": -1, "stats.views": -1 })
    .limit(limit)
    .then((schemes) => {
      // Filter and score schemes based on eligibility
      return schemes
        .map((scheme) => {
          const eligibility = scheme.checkEligibility(user)
          return {
            ...scheme.toObject(),
            eligibility: eligibility,
            relevanceScore: eligibility.score / Math.max(eligibility.totalCriteria, 1),
          }
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
    })
}

// Static method to search schemes
governmentSchemeSchema.statics.searchSchemes = function (searchTerm, filters = {}) {
  const query = {
    status: "active",
    $or: [
      { name: { $regex: searchTerm, $options: "i" } },
      { description: { $regex: searchTerm, $options: "i" } },
      { tags: { $in: [new RegExp(searchTerm, "i")] } },
      { keywords: { $in: [new RegExp(searchTerm, "i")] } },
    ],
  }

  // Apply filters
  if (filters.category) query.category = filters.category
  if (filters.level) query.level = filters.level
  if (filters.state) {
    query.$and = query.$and || []
    query.$and.push({
      $or: [{ coverage: "national" }, { applicableStates: filters.state }],
    })
  }

  return this.find(query).sort({ "rating.average": -1, "stats.views": -1 })
}

// Static method to get trending schemes
governmentSchemeSchema.statics.getTrendingSchemes = function (limit = 10) {
  return this.find({
    status: "active",
    isCurrentlyAcceptingApplications: true,
  })
    .sort({
      "stats.views": -1,
      "stats.totalApplications": -1,
      "rating.average": -1,
    })
    .limit(limit)
}

module.exports = mongoose.models.GovernmentScheme || mongoose.model("GovernmentScheme", governmentSchemeSchema)
