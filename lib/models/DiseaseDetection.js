const mongoose = require("mongoose");

const treatmentSchema = new mongoose.Schema({
  organic: [String],
  chemical: [String],
  cultural: [String]
});

const detectionResultSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  severity: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    required: true
  },
  crop: String,
  description: String,
  symptoms: [String],
  treatments: treatmentSchema,
  prevention: [String],
  weatherImpact: String
});

const diseaseDetectionSchema = new mongoose.Schema({
  farmer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  imagePath: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  cropType: {
    type: String,
    required: true
  },
  location: {
    latitude: Number,
    longitude: Number,
    address: String
  },
  detectionResult: {
    type: detectionResultSchema,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending"
  },
  processingTime: {
    type: Number // in milliseconds
  },
  isFavorite: {
    type: Boolean,
    default: false
  },
  notes: String,
  sharedWith: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sharedAt: { type: Date, default: Date.now }
  }],
  consultationRequested: {
    type: Boolean,
    default: false
  },
  consultation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Consultation"
  }
}, {
  timestamps: true
});

// Indexes for better performance
diseaseDetectionSchema.index({ farmer: 1, createdAt: -1 });
diseaseDetectionSchema.index({ "detectionResult.severity": 1 });
diseaseDetectionSchema.index({ cropType: 1 });
diseaseDetectionSchema.index({ status: 1 });

// Virtual for getting relative time
diseaseDetectionSchema.virtual("timeAgo").get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
});

// Method to toggle favorite status
diseaseDetectionSchema.methods.toggleFavorite = function() {
  this.isFavorite = !this.isFavorite;
  return this.save();
};

// Static method to get user statistics
diseaseDetectionSchema.statics.getUserStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { farmer: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$detectionResult.severity",
        count: { $sum: 1 }
      }
    }
  ]);
  
  const total = await this.countDocuments({ farmer: userId });
  
  return {
    total,
    severityBreakdown: stats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, { low: 0, medium: 0, high: 0, critical: 0 })
  };
};

// Static method to get trending diseases
diseaseDetectionSchema.statics.getTrendingDiseases = async function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          disease: "$detectionResult.name",
          crop: "$cropType"
        },
        count: { $sum: 1 },
        avgConfidence: { $avg: "$detectionResult.confidence" },
        severity: { $first: "$detectionResult.severity" }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
};

module.exports = mongoose.models.DiseaseDetection || mongoose.model("DiseaseDetection", diseaseDetectionSchema);