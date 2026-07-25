const mongoose = require("mongoose")

const alertSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },

    // Alert Classification
    type: {
      type: String,
      enum: [
        "weather_warning",
        "weather_advisory",
        "pest_outbreak",
        "disease_alert",
        "market_price",
        "government_scheme",
        "seasonal_advice",
        "emergency",
        "maintenance",
        "community_update",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    priority: {
      type: String,
      enum: ["normal", "high", "urgent"],
      default: "normal",
    },

    // Content in Multiple Languages
    content: {
      en: {
        title: String,
        message: String,
        actionText: String,
      },
      hi: {
        title: String,
        message: String,
        actionText: String,
      },
      te: {
        title: String,
        message: String,
        actionText: String,
      },
    },

    // Targeting
    targetAudience: {
      roles: [
        {
          type: String,
          enum: ["farmer", "agri_doctor", "agriculture_expert", "all"],
        },
      ],
      locations: [
        {
          state: String,
          districts: [String],
          villages: [String],
        },
      ],
      crops: [String],
      farmingTypes: [
        {
          type: String,
          enum: ["organic", "conventional", "mixed", "natural", "biodynamic"],
        },
      ],
      landSizeRange: {
        min: Number,
        max: Number,
      },
    },

    // Weather-specific data
    weatherData: {
      temperature: {
        current: Number,
        min: Number,
        max: Number,
      },
      humidity: Number,
      rainfall: {
        current: Number,
        forecast: Number,
      },
      windSpeed: Number,
      conditions: String,
      forecast: [
        {
          date: Date,
          condition: String,
          temperature: { min: Number, max: Number },
          rainfall: Number,
        },
      ],
    },

    // Action Items
    recommendations: [
      {
        action: String,
        priority: {
          type: String,
          enum: ["immediate", "within_24hrs", "within_week", "when_possible"],
        },
        cost: {
          min: Number,
          max: Number,
        },
        difficulty: {
          type: String,
          enum: ["easy", "medium", "hard"],
        },
      },
    ],

    // Related Resources
    relatedSchemes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GovernmentScheme",
      },
    ],
    relatedVideos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    relatedIdeas: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FarmingIdea",
      },
    ],

    // External Links
    externalLinks: [
      {
        title: String,
        url: String,
        type: {
          type: String,
          enum: ["government", "research", "news", "weather", "market", "other"],
        },
      },
    ],

    // Media Attachments
    attachments: [
      {
        type: {
          type: String,
          enum: ["image", "video", "document", "audio"],
        },
        url: String,
        filename: String,
        size: Number,
      },
    ],

    // Scheduling
    scheduledFor: {
      type: Date,
      default: Date.now,
    },
    expiresAt: Date,
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringPattern: {
      frequency: {
        type: String,
        enum: ["daily", "weekly", "monthly", "seasonal"],
      },
      interval: Number, // e.g., every 2 days, every 3 weeks
      daysOfWeek: [Number], // 0-6, Sunday = 0
      endDate: Date,
    },

    // Status and Delivery
    status: {
      type: String,
      enum: ["draft", "scheduled", "sent", "expired", "cancelled"],
      default: "draft",
    },
    sentAt: Date,

    // Delivery Channels
    channels: {
      inApp: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
    },

    // Creator Information
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    creatorType: {
      type: String,
      enum: ["system", "admin", "expert", "government", "weather_service"],
      default: "system",
    },

    // Engagement Metrics
    stats: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      read: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      shared: { type: Number, default: 0 },
      dismissed: { type: Number, default: 0 },
    },

    // User Interactions
    userInteractions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        action: {
          type: String,
          enum: ["delivered", "read", "clicked", "shared", "dismissed", "bookmarked"],
        },
        timestamp: { type: Date, default: Date.now },
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],

    // Feedback
    feedback: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        isHelpful: Boolean,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Source Information
    source: {
      type: String,
      enum: ["weather_api", "government_portal", "expert_input", "user_report", "automated_system", "manual"],
      default: "manual",
    },
    sourceData: mongoose.Schema.Types.Mixed,

    // Verification
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    verifiedAt: Date,

    // Tags for categorization
    tags: [String],

    // Geographic Data
    affectedAreas: [
      {
        type: {
          type: String,
          enum: ["Point", "Polygon"],
          default: "Point",
        },
        coordinates: {
          type: [Number], // [longitude, latitude] for Point, array of [lng, lat] arrays for Polygon
          required: true,
        },
      },
    ],

    // Emergency Contact Information
    emergencyContacts: [
      {
        name: String,
        designation: String,
        phone: String,
        email: String,
        department: String,
      },
    ],
  },
  {
    timestamps: true,
  },
)

// Indexes for better performance
alertSchema.index({ type: 1, severity: 1 })
alertSchema.index({ status: 1, scheduledFor: 1 })
alertSchema.index({ "targetAudience.locations.state": 1, "targetAudience.locations.districts": 1 })
alertSchema.index({ "targetAudience.crops": 1 })
alertSchema.index({ expiresAt: 1 })
alertSchema.index({ createdAt: -1 })
alertSchema.index({ tags: 1 })

// Geospatial index for location-based queries
alertSchema.index({ affectedAreas: "2dsphere" })

// Virtual for engagement rate
alertSchema.virtual("engagementRate").get(function () {
  if (this.stats.sent === 0) return 0
  return ((this.stats.read + this.stats.clicked) / this.stats.sent) * 100
})

// Virtual for effectiveness score
alertSchema.virtual("effectivenessScore").get(function () {
  const weights = {
    read: 0.3,
    clicked: 0.4,
    shared: 0.2,
    dismissed: -0.1,
  }

  if (this.stats.sent === 0) return 0

  const score =
    (this.stats.read * weights.read +
      this.stats.clicked * weights.clicked +
      this.stats.shared * weights.shared +
      this.stats.dismissed * weights.dismissed) /
    this.stats.sent

  return Math.max(0, Math.min(100, score * 100))
})

// Method to check if alert is active
alertSchema.methods.isActive = function () {
  const now = new Date()
  return this.status === "sent" && this.scheduledFor <= now && (!this.expiresAt || this.expiresAt > now)
}

// Method to check if alert is expired
alertSchema.methods.isExpired = function () {
  return this.expiresAt && new Date() > this.expiresAt
}

// Method to add user interaction
alertSchema.methods.addInteraction = function (userId, action, metadata = {}) {
  this.userInteractions.push({
    user: userId,
    action: action,
    timestamp: new Date(),
    metadata: metadata,
  })

  // Update stats
  if (this.stats[action] !== undefined) {
    this.stats[action] += 1
  }

  return this.save()
}

// Method to get content in specific language
alertSchema.methods.getLocalizedContent = function (language = "en") {
  const content = this.content[language] || this.content.en || {}
  return {
    title: content.title || this.title,
    message: content.message || this.message,
    actionText: content.actionText || "View Details",
  }
}

// Method to check if user is in target audience
alertSchema.methods.isTargetUser = function (user) {
  const target = this.targetAudience

  // Check role
  if (target.roles && target.roles.length > 0) {
    if (!target.roles.includes("all") && !target.roles.includes(user.role)) {
      return false
    }
  }

  // Check location
  if (target.locations && target.locations.length > 0) {
    const userLocation = { state: user.state, district: user.district, village: user.village }
    const isLocationMatch = target.locations.some((location) => {
      if (location.state !== userLocation.state) return false
      if (location.districts && location.districts.length > 0) {
        if (!location.districts.includes(userLocation.district)) return false
      }
      if (location.villages && location.villages.length > 0) {
        if (!location.villages.includes(userLocation.village)) return false
      }
      return true
    })
    if (!isLocationMatch) return false
  }

  // Check crops
  if (target.crops && target.crops.length > 0 && user.role === "farmer") {
    const userCrops = [...user.currentCrops.map((crop) => crop.cropName), ...(user.preferredCrops || [])]
    const hasCropMatch = target.crops.some((crop) =>
      userCrops.some((userCrop) => userCrop.toLowerCase().includes(crop.toLowerCase())),
    )
    if (!hasCropMatch) return false
  }

  // Check farming type
  if (target.farmingTypes && target.farmingTypes.length > 0 && user.role === "farmer") {
    if (!target.farmingTypes.includes(user.farmingType)) return false
  }

  // Check land size
  if (target.landSizeRange && user.role === "farmer" && user.landSize) {
    const userLandSize = user.landSize.unit === "hectares" ? user.landSize.value * 2.47 : user.landSize.value // Convert to acres

    if (target.landSizeRange.min && userLandSize < target.landSizeRange.min) return false
    if (target.landSizeRange.max && userLandSize > target.landSizeRange.max) return false
  }

  return true
}

// Static method to get active alerts for user
alertSchema.statics.getActiveAlertsForUser = function (user, limit = 10) {
  const now = new Date()

  return this.find({
    status: "sent",
    scheduledFor: { $lte: now },
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
  })
    .sort({ priority: -1, severity: -1, scheduledFor: -1 })
    .limit(limit)
    .then((alerts) => alerts.filter((alert) => alert.isTargetUser(user)))
}

// Static method to get alerts by type
alertSchema.statics.getAlertsByType = function (type, limit = 20) {
  return this.find({
    type: type,
    status: "sent",
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  })
    .sort({ scheduledFor: -1 })
    .limit(limit)
}

// Static method to get weather alerts for location
alertSchema.statics.getWeatherAlertsForLocation = function (state, district) {
  return this.find({
    type: { $in: ["weather_warning", "weather_advisory"] },
    status: "sent",
    "targetAudience.locations": {
      $elemMatch: {
        state: state,
        $or: [{ districts: { $exists: false } }, { districts: { $in: [district] } }],
      },
    },
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  }).sort({ severity: -1, scheduledFor: -1 })
}

module.exports = mongoose.models.Alert || mongoose.model("Alert", alertSchema)
