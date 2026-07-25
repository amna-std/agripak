const mongoose = require("mongoose")

const cropGuidanceSchema = new mongoose.Schema(
  {
    cropName: { type: String, required: true, index: true },
    variety: String,
    location: {
      district: { type: String, required: true, index: true },
      state: { type: String, required: true, index: true },
      soilType: String,
      climateZone: String
    },
    growthStage: {
      type: String,
      enum: ["seedling", "vegetative", "flowering", "fruiting", "maturity"],
      required: true,
      index: true
    },
    healthStatus: {
      overall: {
        type: String,
        enum: ["excellent", "good", "fair", "poor", "critical"],
        default: "good"
      },
      issues: [{
        type: {
          type: String,
          enum: ["disease", "pest", "nutrient_deficiency", "water_stress", "weather_damage"]
        },
        severity: {
          type: String,
          enum: ["mild", "moderate", "severe"]
        },
        description: String,
        identifiedAt: { type: Date, default: Date.now }
      }]
    },
    recommendations: {
      fertilizers: [{
        name: String,
        type: { type: String, enum: ["organic", "chemical", "bio"] },
        dosage: String,
        applicationMethod: String,
        timing: String,
        frequency: String,
        cost: Number,
        priority: { type: String, enum: ["immediate", "within_week", "routine"] }
      }],
      pesticides: [{
        name: String,
        type: { type: String, enum: ["organic", "chemical", "biological"] },
        targetPest: String,
        dosage: String,
        applicationMethod: String,
        timing: String,
        safetyPeriod: String,
        cost: Number,
        priority: { type: String, enum: ["immediate", "within_week", "preventive"] }
      }],
      careSteps: [{
        activity: String,
        description: String,
        timing: String,
        frequency: String,
        importance: { type: String, enum: ["critical", "important", "optional"] }
      }],
      irrigation: {
        frequency: String,
        amount: String,
        method: String,
        timing: String,
        notes: String
      }
    },
    localizedAdvice: {
      seasonalTips: [String],
      localPractices: [String],
      marketInsights: [String],
      weatherConsiderations: [String]
    },
    nextActions: [{
      action: String,
      deadline: Date,
      priority: { type: String, enum: ["high", "medium", "low"] },
      category: String,
      completed: { type: Boolean, default: false }
    }],
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    expert: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    images: [{
      url: String,
      type: { type: String, enum: ["plant", "leaf", "fruit", "pest", "disease"] },
      analysisResult: String,
      uploadedAt: { type: Date, default: Date.now }
    }],
    aiAnalysis: {
      confidence: Number,
      detectedIssues: [String],
      recommendations: [String],
      processedAt: Date,
      modelVersion: String
    },
    followUpSchedule: {
      nextCheckDate: Date,
      frequency: String,
      reminders: [Date]
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
)

cropGuidanceSchema.index({ farmer: 1, cropName: 1 })
cropGuidanceSchema.index({ "location.district": 1, "location.state": 1 })
cropGuidanceSchema.index({ growthStage: 1, createdAt: -1 })

// Generate localized crop advice based on location and season
cropGuidanceSchema.methods.generateLocalizedAdvice = function() {
  const { district, state, soilType } = this.location
  const currentMonth = new Date().getMonth()
  
  const seasonalTips = []
  const localPractices = []
  const weatherConsiderations = []
  
  // Season-based advice
  if (currentMonth >= 5 && currentMonth <= 9) { // Monsoon
    seasonalTips.push("Monitor for fungal diseases during monsoon")
    seasonalTips.push("Ensure proper drainage to prevent waterlogging")
    weatherConsiderations.push("High humidity may increase disease risk")
  } else if (currentMonth >= 10 && currentMonth <= 2) { // Winter
    seasonalTips.push("Protect crops from cold stress")
    seasonalTips.push("Reduce irrigation frequency in winter")
    weatherConsiderations.push("Monitor for frost damage in northern regions")
  } else { // Summer
    seasonalTips.push("Increase irrigation frequency during summer")
    seasonalTips.push("Provide shade protection during peak heat")
    weatherConsiderations.push("High temperatures may cause heat stress")
  }
  
  // Location-specific advice
  if (state.toLowerCase().includes("punjab") || state.toLowerCase().includes("haryana")) {
    localPractices.push("Follow wheat-rice rotation system")
    localPractices.push("Use laser land leveling for water efficiency")
  } else if (state.toLowerCase().includes("maharashtra")) {
    localPractices.push("Implement drip irrigation for water conservation")
    localPractices.push("Use organic farming practices popular in the region")
  }
  
  // Soil-specific advice
  if (soilType === "clay") {
    localPractices.push("Improve drainage in clay soils")
    localPractices.push("Add organic matter to improve soil structure")
  } else if (soilType === "sandy") {
    localPractices.push("Increase organic matter for water retention")
    localPractices.push("Apply fertilizers in split doses")
  }
  
  this.localizedAdvice = {
    seasonalTips,
    localPractices,
    marketInsights: [
      "Check local mandi prices before harvest",
      "Consider contract farming opportunities"
    ],
    weatherConsiderations
  }
  
  return this.save()
}

// Generate care recommendations based on growth stage
cropGuidanceSchema.methods.generateCareRecommendations = function() {
  const stage = this.growthStage
  const crop = this.cropName.toLowerCase()
  
  const fertilizers = []
  const pesticides = []
  const careSteps = []
  
  // Stage-specific recommendations
  switch (stage) {
    case "seedling":
      fertilizers.push({
        name: "Starter fertilizer (NPK 10:26:26)",
        type: "chemical",
        dosage: "50 kg per acre",
        applicationMethod: "soil application",
        timing: "at sowing",
        frequency: "once",
        cost: 800,
        priority: "immediate"
      })
      careSteps.push({
        activity: "Thinning",
        description: "Remove weak seedlings to ensure proper spacing",
        timing: "15-20 days after sowing",
        frequency: "once",
        importance: "important"
      })
      break
      
    case "vegetative":
      fertilizers.push({
        name: "Urea",
        type: "chemical",
        dosage: "25 kg per acre",
        applicationMethod: "top dressing",
        timing: "30-35 days after sowing",
        frequency: "twice",
        cost: 600,
        priority: "within_week"
      })
      careSteps.push({
        activity: "Weeding",
        description: "Remove weeds to reduce competition",
        timing: "25-30 days after sowing",
        frequency: "as needed",
        importance: "critical"
      })
      break
      
    case "flowering":
      fertilizers.push({
        name: "Potash (MOP)",
        type: "chemical",
        dosage: "15 kg per acre",
        applicationMethod: "soil application",
        timing: "at flowering initiation",
        frequency: "once",
        cost: 400,
        priority: "immediate"
      })
      pesticides.push({
        name: "Neem oil",
        type: "organic",
        targetPest: "thrips and aphids",
        dosage: "3 ml per liter",
        applicationMethod: "foliar spray",
        timing: "evening hours",
        safetyPeriod: "3 days",
        cost: 200,
        priority: "preventive"
      })
      break
  }
  
  this.recommendations = {
    fertilizers,
    pesticides,
    careSteps,
    irrigation: {
      frequency: stage === "flowering" ? "alternate days" : "twice a week",
      amount: "25-30 mm per week",
      method: "drip or furrow",
      timing: "early morning or evening",
      notes: "Avoid waterlogging during flowering"
    }
  }
  
  return this.save()
}

// Process AI analysis results
cropGuidanceSchema.methods.processAIAnalysis = function(analysisResult) {
  const issues = []
  const recommendations = []
  
  // Simulate AI analysis processing
  if (analysisResult.diseaseDetected) {
    issues.push(`${analysisResult.diseaseDetected} detected with ${analysisResult.confidence}% confidence`)
    recommendations.push(`Apply appropriate fungicide for ${analysisResult.diseaseDetected}`)
    recommendations.push("Improve air circulation around plants")
  }
  
  if (analysisResult.pestDetected) {
    issues.push(`${analysisResult.pestDetected} infestation detected`)
    recommendations.push(`Use targeted pesticide for ${analysisResult.pestDetected}`)
    recommendations.push("Monitor crop regularly for pest activity")
  }
  
  if (analysisResult.nutrientDeficiency) {
    issues.push(`${analysisResult.nutrientDeficiency} deficiency symptoms`)
    recommendations.push(`Apply ${analysisResult.nutrientDeficiency} fertilizer`)
  }
  
  this.aiAnalysis = {
    confidence: analysisResult.confidence || 85,
    detectedIssues: issues,
    recommendations,
    processedAt: new Date(),
    modelVersion: "v2.1"
  }
  
  return this.save()
}

module.exports = mongoose.models.CropGuidance || mongoose.model("CropGuidance", cropGuidanceSchema)