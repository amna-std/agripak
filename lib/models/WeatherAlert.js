const mongoose = require("mongoose")

const weatherAlertSchema = new mongoose.Schema(
  {
    location: {
      district: { type: String, required: true, index: true },
      state: { type: String, required: true, index: true },
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    weather: {
      temperature: { type: Number, required: true },
      humidity: { type: Number, required: true },
      rainfall: { type: Number, default: 0 },
      windSpeed: { type: Number, default: 0 },
      condition: {
        type: String,
        enum: ["sunny", "cloudy", "rainy", "stormy", "foggy"],
        required: true
      },
      pressure: Number,
      uvIndex: Number
    },
    forecast: [{
      date: { type: Date, required: true },
      temperature: {
        min: Number,
        max: Number
      },
      humidity: Number,
      rainfall: Number,
      condition: String
    }],
    cropAlerts: [{
      cropName: { type: String, required: true },
      alertType: {
        type: String,
        enum: ["pest_risk", "disease_risk", "irrigation_needed", "harvest_ready", "weather_warning"],
        required: true
      },
      severity: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        default: "medium"
      },
      message: { type: String, required: true },
      recommendations: [String],
      validUntil: { type: Date, required: true }
    }],
    pestDiseaseRisk: {
      pestRisk: {
        level: { type: String, enum: ["low", "medium", "high"], default: "low" },
        pests: [String],
        conditions: String
      },
      diseaseRisk: {
        level: { type: String, enum: ["low", "medium", "high"], default: "low" },
        diseases: [String],
        conditions: String
      }
    },
    advisories: [{
      category: {
        type: String,
        enum: ["irrigation", "fertilization", "pest_control", "harvesting", "sowing"],
        required: true
      },
      message: { type: String, required: true },
      priority: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "medium"
      },
      validFor: [String] // crop names
    }],
    isActive: { type: Boolean, default: true },
    source: { type: String, default: "openweather" },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
)

weatherAlertSchema.index({ "location.district": 1, "location.state": 1 })
weatherAlertSchema.index({ createdAt: -1 })
weatherAlertSchema.index({ "cropAlerts.cropName": 1 })

// Generate crop-specific alerts based on weather conditions
weatherAlertSchema.methods.generateCropAlerts = function() {
  const alerts = []
  const { temperature, humidity, rainfall, condition } = this.weather
  
  // High humidity + warm temperature = fungal disease risk
  if (humidity > 80 && temperature > 25) {
    alerts.push({
      cropName: "rice",
      alertType: "disease_risk",
      severity: "high",
      message: "High risk of blast disease due to high humidity and temperature",
      recommendations: ["Apply fungicide", "Ensure proper drainage", "Monitor crop closely"],
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })
  }
  
  // Heavy rainfall = pest risk
  if (rainfall > 50) {
    alerts.push({
      cropName: "cotton",
      alertType: "pest_risk",
      severity: "medium",
      message: "Heavy rainfall may increase bollworm activity",
      recommendations: ["Check for pest damage", "Apply organic pesticide if needed"],
      validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    })
  }
  
  // Low humidity = irrigation needed
  if (humidity < 40 && rainfall < 5) {
    alerts.push({
      cropName: "tomato",
      alertType: "irrigation_needed",
      severity: "medium",
      message: "Low humidity and no rainfall - irrigation recommended",
      recommendations: ["Increase irrigation frequency", "Mulch around plants"],
      validUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    })
  }
  
  this.cropAlerts = alerts
  return this.save()
}

// Calculate pest and disease risk
weatherAlertSchema.methods.calculateRisks = function() {
  const { temperature, humidity, rainfall } = this.weather
  
  // Pest risk calculation
  let pestRisk = "low"
  const pestConditions = []
  
  if (temperature > 30 && humidity > 70) {
    pestRisk = "high"
    pestConditions.push("High temperature and humidity favor pest multiplication")
  } else if (temperature > 25 && humidity > 60) {
    pestRisk = "medium"
    pestConditions.push("Moderate conditions for pest activity")
  }
  
  // Disease risk calculation
  let diseaseRisk = "low"
  const diseaseConditions = []
  
  if (humidity > 85 && temperature > 20 && rainfall > 10) {
    diseaseRisk = "high"
    diseaseConditions.push("High humidity, warm temperature, and moisture create ideal conditions for fungal diseases")
  } else if (humidity > 70 && temperature > 15) {
    diseaseRisk = "medium"
    diseaseConditions.push("Moderate risk for bacterial and fungal infections")
  }
  
  this.pestDiseaseRisk = {
    pestRisk: {
      level: pestRisk,
      pests: pestRisk === "high" ? ["aphids", "thrips", "whitefly"] : ["general_pests"],
      conditions: pestConditions.join(". ")
    },
    diseaseRisk: {
      level: diseaseRisk,
      diseases: diseaseRisk === "high" ? ["blast", "blight", "rust"] : ["general_diseases"],
      conditions: diseaseConditions.join(". ")
    }
  }
  
  return this.save()
}

module.exports = mongoose.models.WeatherAlert || mongoose.model("WeatherAlert", weatherAlertSchema)