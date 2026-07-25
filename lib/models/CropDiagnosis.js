const mongoose = require("mongoose")

const cropDiagnosisSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cropName: {
      type: String,
      required: true,
      index: true,
    },
    images: [{
      url: {
        type: String,
        required: true,
      },
      type: {
        type: String,
        enum: ["leaf", "fruit", "stem", "root", "whole_plant"],
        required: true,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    location: {
      district: String,
      state: String,
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },
    symptoms: {
      observed: [{
        type: String,
        enum: [
          "yellowing_leaves", "brown_spots", "wilting", "stunted_growth",
          "leaf_curl", "holes_in_leaves", "white_powder", "black_spots",
          "fruit_rot", "stem_borer", "root_rot", "pest_infestation"
        ],
      }],
      severity: {
        type: String,
        enum: ["mild", "moderate", "severe"],
        required: true,
      },
      affectedArea: {
        type: String,
        enum: ["leaves", "fruits", "stems", "roots", "whole_plant"],
        required: true,
      },
    },
    aiDiagnosis: {
      disease: {
        name: String,
        confidence: {
          type: Number,
          min: 0,
          max: 100,
        },
        category: {
          type: String,
          enum: ["fungal", "bacterial", "viral", "pest", "nutrient_deficiency", "environmental"],
        },
      },
      alternativeDiagnoses: [{
        name: String,
        confidence: Number,
        category: String,
      }],
      processedAt: {
        type: Date,
        default: Date.now,
      },
      modelVersion: String,
    },
    expertReview: {
      expert: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      diagnosis: String,
      confidence: {
        type: String,
        enum: ["low", "medium", "high"],
      },
      notes: String,
      reviewedAt: Date,
    },
    treatment: {
      recommended: [{
        type: {
          type: String,
          enum: ["organic", "chemical", "biological", "cultural"],
        },
        method: String,
        product: String,
        dosage: String,
        frequency: String,
        duration: String,
        cost: Number,
        priority: {
          type: String,
          enum: ["immediate", "within_week", "preventive"],
        },
      }],
      preventive: [{
        measure: String,
        timing: String,
        frequency: String,
      }],
    },
    followUp: [{
      date: {
        type: Date,
        default: Date.now,
      },
      status: {
        type: String,
        enum: ["improved", "same", "worsened", "resolved"],
      },
      images: [String],
      notes: String,
      treatmentApplied: String,
    }],
    status: {
      type: String,
      enum: ["pending", "diagnosed", "under_treatment", "resolved", "expert_required"],
      default: "pending",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    weatherContext: {
      temperature: Number,
      humidity: Number,
      rainfall: Number,
      conditions: String,
      recordedAt: Date,
    },
  },
  {
    timestamps: true,
  }
)

cropDiagnosisSchema.index({ farmer: 1, createdAt: -1 })
cropDiagnosisSchema.index({ cropName: 1, "aiDiagnosis.disease.name": 1 })
cropDiagnosisSchema.index({ status: 1, priority: 1 })

// AI diagnosis simulation (replace with actual AI service)
cropDiagnosisSchema.methods.processAIDiagnosis = async function() {
  // Simulate AI processing based on symptoms and crop type
  const diseases = {
    rice: [
      { name: "Blast Disease", category: "fungal", treatments: ["Tricyclazole", "Carbendazim"] },
      { name: "Brown Spot", category: "fungal", treatments: ["Mancozeb", "Copper Oxychloride"] },
      { name: "Bacterial Blight", category: "bacterial", treatments: ["Streptocycline", "Copper compounds"] }
    ],
    wheat: [
      { name: "Rust Disease", category: "fungal", treatments: ["Propiconazole", "Tebuconazole"] },
      { name: "Powdery Mildew", category: "fungal", treatments: ["Sulfur", "Triadimefon"] }
    ],
    tomato: [
      { name: "Late Blight", category: "fungal", treatments: ["Metalaxyl", "Mancozeb"] },
      { name: "Early Blight", category: "fungal", treatments: ["Chlorothalonil", "Azoxystrobin"] }
    ]
  }

  const cropDiseases = diseases[this.cropName.toLowerCase()] || diseases.rice
  const primaryDisease = cropDiseases[Math.floor(Math.random() * cropDiseases.length)]
  
  this.aiDiagnosis = {
    disease: {
      name: primaryDisease.name,
      confidence: Math.floor(Math.random() * 30) + 70, // 70-100%
      category: primaryDisease.category
    },
    alternativeDiagnoses: cropDiseases.filter(d => d.name !== primaryDisease.name).slice(0, 2).map(d => ({
      name: d.name,
      confidence: Math.floor(Math.random() * 40) + 30,
      category: d.category
    })),
    processedAt: new Date(),
    modelVersion: "v2.1"
  }

  // Generate treatment recommendations
  this.treatment.recommended = primaryDisease.treatments.map((treatment, index) => ({
    type: primaryDisease.category === 'fungal' ? 'chemical' : 'organic',
    method: 'spray',
    product: treatment,
    dosage: '2-3 ml/liter',
    frequency: 'twice_weekly',
    duration: '2-3 weeks',
    cost: Math.floor(Math.random() * 500) + 200,
    priority: index === 0 ? 'immediate' : 'within_week'
  }))

  this.status = 'diagnosed'
  return this.save()
}

// Add follow-up
cropDiagnosisSchema.methods.addFollowUp = function(status, notes, images = [], treatmentApplied = '') {
  this.followUp.push({
    status,
    notes,
    images,
    treatmentApplied
  })
  
  if (status === 'resolved') {
    this.status = 'resolved'
  } else if (status === 'worsened') {
    this.priority = 'high'
    this.status = 'expert_required'
  }
  
  return this.save()
}

module.exports = mongoose.models.CropDiagnosis || mongoose.model("CropDiagnosis", cropDiagnosisSchema)