const mongoose = require("mongoose")

const recommendationSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['treatment', 'fertilizer', 'pesticide', 'irrigation', 'harvesting', 'market_timing', 'crop_selection'],
    required: true
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  actionRequired: { type: Boolean, default: false },
  timeline: {
    immediate: Boolean,
    withinDays: Number,
    seasonal: String
  },
  cost: {
    estimated: Number,
    currency: { type: String, default: 'PKR' },
    breakdown: [{
      item: String,
      quantity: Number,
      unitPrice: Number,
      total: Number
    }]
  },
  products: [{
    name: String,
    brand: String,
    dosage: String,
    applicationMethod: String,
    safetyPrecautions: [String]
  }],
  expectedOutcome: String,
  followUpDate: Date,
  isImplemented: { type: Boolean, default: false },
  implementedAt: Date,
  effectiveness: {
    rating: { type: Number, min: 1, max: 5 },
    feedback: String,
    ratedAt: Date
  }
}, { timestamps: true })

const consultationSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expert: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    type: {
      type: String,
      enum: ["crop_disease", "market_advisory", "soil_management", "pest_control", "irrigation", "fertilizer", "harvesting", "general"],
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    subject: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    cropDetails: {
      cropName: String,
      variety: String,
      stage: String,
      area: Number,
      sowingDate: Date,
      expectedHarvest: Date,
      currentIssues: [String]
    },
    location: {
      district: String,
      state: String,
      village: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    attachments: [{
      type: {
        type: String,
        enum: ["image", "document", "video"],
      },
      url: String,
      caption: String,
      uploadedAt: { type: Date, default: Date.now }
    }],
    messages: [{
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      message: {
        type: String,
        required: true,
      },
      messageType: {
        type: String,
        enum: ['text', 'recommendation', 'diagnosis', 'follow_up'],
        default: 'text'
      },
      attachments: [{
        type: String,
        url: String,
      }],
      timestamp: {
        type: Date,
        default: Date.now,
      },
      readBy: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      }],
      isEdited: { type: Boolean, default: false },
      editedAt: Date
    }],
    recommendations: [recommendationSchema],
    diagnosis: {
      condition: String,
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe', 'critical']
      },
      causes: [String],
      symptoms: [String],
      treatment: String,
      prevention: [String],
      confidence: { type: Number, min: 0, max: 100 }
    },
    marketInsights: {
      currentPrice: Number,
      priceRange: {
        min: Number,
        max: Number
      },
      trend: {
        type: String,
        enum: ['rising', 'falling', 'stable']
      },
      bestSellingTime: String,
      demandForecast: String,
      qualityFactors: [String]
    },
    status: {
      type: String,
      enum: ["open", "assigned", "in_progress", "resolved", "closed", "follow_up_required"],
      default: "open",
      index: true,
    },
    resolution: {
      summary: String,
      outcome: {
        type: String,
        enum: ['successful', 'partially_successful', 'unsuccessful', 'ongoing']
      },
      followUpRequired: {
        type: Boolean,
        default: false,
      },
      followUpDate: Date,
      resolvedAt: Date,
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      implementationStatus: {
        type: String,
        enum: ['not_started', 'in_progress', 'completed', 'abandoned']
      }
    },
    rating: {
      score: {
        type: Number,
        min: 1,
        max: 5,
      },
      feedback: String,
      ratedAt: Date,
      aspects: {
        expertise: Number,
        communication: Number,
        timeliness: Number,
        helpfulness: Number
      }
    },
    scheduledCall: {
      dateTime: Date,
      duration: Number, // minutes
      platform: {
        type: String,
        enum: ["phone", "video", "whatsapp"],
        default: "phone",
      },
      status: {
        type: String,
        enum: ["scheduled", "completed", "cancelled", "rescheduled"],
      },
      notes: String,
      recordingUrl: String
    },
    tags: [String],
    isUrgent: {
      type: Boolean,
      default: false,
    },
    estimatedResolutionTime: {
      type: Number, // hours
    },
    actualResolutionTime: {
      type: Number, // hours
    },
    cost: {
      consultationFee: { type: Number, default: 0 },
      isPaid: { type: Boolean, default: false },
      paymentMethod: String,
      transactionId: String
    },
    analytics: {
      viewCount: { type: Number, default: 0 },
      responseTime: Number, // minutes
      satisfactionScore: Number
    }
  },
  {
    timestamps: true,
  }
)

consultationSchema.index({ farmer: 1, createdAt: -1 })
consultationSchema.index({ expert: 1, status: 1 })
consultationSchema.index({ type: 1, priority: 1 })
consultationSchema.index({ status: 1, createdAt: -1 })
consultationSchema.index({ 'cropDetails.cropName': 1, type: 1 })
consultationSchema.index({ 'location.state': 1, 'location.district': 1 })
consultationSchema.index({ tags: 1 })
consultationSchema.index({ 'rating.score': -1 })

// Auto-assign expert based on type and location
consultationSchema.methods.autoAssignExpert = async function() {
  const User = mongoose.model('User')
  
  // Find available experts based on consultation type
  const expertQuery = {
    role: { $in: ['agriculture_expert', 'agri_doctor'] },
    isActive: true,
    'specialization': { $in: [this.type] }
  }
  
  // Prefer experts from same state/district
  if (this.location.state) {
    expertQuery.state = this.location.state
  }
  
  const experts = await User.find(expertQuery)
    .sort({ 'rating.average': -1, lastSeen: -1 })
    .limit(5)
  
  if (experts.length > 0) {
    // Assign to expert with highest rating and recent activity
    this.expert = experts[0]._id
    this.status = 'assigned'
    
    // Set estimated resolution time based on priority
    const timeMap = { low: 48, medium: 24, high: 12, urgent: 4 }
    this.estimatedResolutionTime = timeMap[this.priority]
    
    return this.save()
  }
  
  return this
}

// Add message to consultation
consultationSchema.methods.addMessage = function(senderId, message, messageType = 'text', attachments = []) {
  this.messages.push({
    sender: senderId,
    message,
    messageType,
    attachments
  })
  
  if (this.status === 'open') {
    this.status = 'in_progress'
  }
  
  // Update analytics
  if (this.messages.length === 1) {
    const responseTime = Math.round((new Date() - this.createdAt) / (1000 * 60)) // minutes
    this.analytics.responseTime = responseTime
  }
  
  return this.save()
}

// Add recommendation
consultationSchema.methods.addRecommendation = function(recommendation) {
  this.recommendations.push(recommendation)
  
  // Add recommendation message
  this.messages.push({
    sender: this.expert,
    message: `New recommendation added: ${recommendation.title}`,
    messageType: 'recommendation'
  })
  
  return this.save()
}

// Add diagnosis
consultationSchema.methods.addDiagnosis = function(diagnosis) {
  this.diagnosis = diagnosis
  
  // Add diagnosis message
  this.messages.push({
    sender: this.expert,
    message: `Diagnosis: ${diagnosis.condition} (${diagnosis.severity} severity)`,
    messageType: 'diagnosis'
  })
  
  return this.save()
}

// Add market insights
consultationSchema.methods.addMarketInsights = function(insights) {
  this.marketInsights = insights
  
  const trendText = insights.trend === 'rising' ? '📈 Rising' : insights.trend === 'falling' ? '📉 Falling' : '➡️ Stable'
  this.messages.push({
    sender: this.expert,
    message: `Market Update: Current price Rs ${insights.currentPrice}, Trend: ${trendText}`,
    messageType: 'recommendation'
  })
  
  return this.save()
}

// Mark as resolved
consultationSchema.methods.resolve = function(summary, outcome = 'successful', followUpRequired = false, followUpDate = null) {
  this.status = 'resolved'
  this.resolution = {
    summary,
    outcome,
    followUpRequired,
    followUpDate,
    resolvedAt: new Date(),
    resolvedBy: this.expert,
    implementationStatus: 'not_started'
  }
  
  // Calculate actual resolution time
  const createdTime = new Date(this.createdAt).getTime()
  const resolvedTime = new Date().getTime()
  this.actualResolutionTime = Math.round((resolvedTime - createdTime) / (1000 * 60 * 60)) // hours
  
  return this.save()
}

// Schedule call
consultationSchema.methods.scheduleCall = function(dateTime, duration = 30, platform = 'phone') {
  this.scheduledCall = {
    dateTime,
    duration,
    platform,
    status: 'scheduled'
  }
  
  this.messages.push({
    sender: this.expert,
    message: `Call scheduled for ${new Date(dateTime).toLocaleString()} via ${platform}`,
    messageType: 'text'
  })
  
  return this.save()
}

// Rate consultation
consultationSchema.methods.addRating = function(score, feedback = '', aspects = {}) {
  this.rating = {
    score,
    feedback,
    ratedAt: new Date(),
    aspects
  }
  
  // Calculate satisfaction score
  const avgAspectScore = Object.values(aspects).length > 0 
    ? Object.values(aspects).reduce((a, b) => a + b, 0) / Object.values(aspects).length 
    : score
  
  this.analytics.satisfactionScore = avgAspectScore
  this.status = 'closed'
  
  return this.save()
}

// Get consultation summary
consultationSchema.methods.getSummary = function() {
  return {
    id: this._id,
    type: this.type,
    status: this.status,
    priority: this.priority,
    subject: this.subject,
    farmer: this.farmer,
    expert: this.expert,
    createdAt: this.createdAt,
    resolvedAt: this.resolution?.resolvedAt,
    rating: this.rating?.score,
    recommendationsCount: this.recommendations.length,
    messagesCount: this.messages.length,
    hasFollowUp: this.resolution?.followUpRequired
  }
}

// Get active recommendations
consultationSchema.methods.getActiveRecommendations = function() {
  return this.recommendations.filter(rec => !rec.isImplemented)
}

// Mark recommendation as implemented
consultationSchema.methods.markRecommendationImplemented = function(recommendationId, effectiveness = null) {
  const recommendation = this.recommendations.id(recommendationId)
  if (recommendation) {
    recommendation.isImplemented = true
    recommendation.implementedAt = new Date()
    if (effectiveness) {
      recommendation.effectiveness = effectiveness
    }
  }
  return this.save()
}

// Get consultation analytics
consultationSchema.methods.getAnalytics = function() {
  const duration = this.actualResolutionTime || 
    (this.status === 'closed' ? Math.round((new Date() - this.createdAt) / (1000 * 60 * 60)) : null)
  
  return {
    duration,
    responseTime: this.analytics.responseTime,
    messagesExchanged: this.messages.length,
    recommendationsGiven: this.recommendations.length,
    satisfactionScore: this.analytics.satisfactionScore,
    implementationRate: this.recommendations.length > 0 
      ? (this.recommendations.filter(r => r.isImplemented).length / this.recommendations.length) * 100 
      : 0
  }
}

module.exports = mongoose.models.Consultation || mongoose.model("Consultation", consultationSchema)