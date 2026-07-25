const mongoose = require('mongoose')

const schemeSchema = new mongoose.Schema({
  schemeId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  titleHi: String,
  titleTe: String,
  description: { type: String, required: true },
  descriptionHi: String,
  descriptionTe: String,
  category: { 
    type: String, 
    enum: ['financial', 'insurance', 'credit', 'technical', 'subsidy', 'training'],
    required: true 
  },
  level: { 
    type: String, 
    enum: ['central', 'state', 'district'],
    required: true 
  },
  ministry: String,
  department: String,
  launchDate: Date,
  deadline: Date,
  amount: {
    min: Number,
    max: Number,
    unit: String,
    description: String
  },
  eligibility: {
    landSize: { min: Number, max: Number },
    income: { min: Number, max: Number },
    age: { min: Number, max: Number },
    category: [String], // SC, ST, OBC, General
    gender: String,
    state: [String],
    district: [String],
    crops: [String]
  },
  benefits: [String],
  documents: [String],
  applicationProcess: {
    online: Boolean,
    offline: Boolean,
    url: String,
    steps: [String]
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'upcoming', 'expired'],
    default: 'active' 
  },
  featured: { type: Boolean, default: false },
  applicationCount: { type: Number, default: 0 },
  successRate: { type: Number, default: 0 },
  tags: [String],
  contactInfo: {
    phone: String,
    email: String,
    address: String
  },
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true
})

schemeSchema.index({ title: 'text', description: 'text' })
schemeSchema.index({ category: 1, level: 1, status: 1 })
schemeSchema.index({ deadline: 1 })

module.exports = mongoose.models.Scheme || mongoose.model("Scheme", schemeSchema)