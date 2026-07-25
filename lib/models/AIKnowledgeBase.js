const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ['crops', 'diseases', 'pests', 'weather', 'market', 'schemes', 'techniques', 'general']
  },
  subcategory: String,
  question: {
    type: String,
    required: true,
    index: 'text'
  },
  answer: {
    en: { type: String, required: true },
    hi: String,
    te: String
  },
  keywords: [String],
  tags: [String],
  confidence: {
    type: Number,
    default: 0.8,
    min: 0,
    max: 1
  },
  relatedQuestions: [String],
  sources: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  usage: {
    count: { type: Number, default: 0 },
    lastUsed: Date,
    feedback: {
      helpful: { type: Number, default: 0 },
      notHelpful: { type: Number, default: 0 }
    }
  }
}, {
  timestamps: true
});

knowledgeBaseSchema.index({ category: 1, subcategory: 1 });
knowledgeBaseSchema.index({ keywords: 1 });
knowledgeBaseSchema.index({ tags: 1 });
knowledgeBaseSchema.index({ question: 'text', 'answer.en': 'text' });

knowledgeBaseSchema.methods.incrementUsage = function() {
  this.usage.count += 1;
  this.usage.lastUsed = new Date();
  return this.save();
};

knowledgeBaseSchema.statics.searchByKeywords = function(keywords, category = null, limit = 5) {
  const query = {
    isActive: true,
    $or: [
      { keywords: { $in: keywords } },
      { question: { $regex: keywords.join('|'), $options: 'i' } },
      { 'answer.en': { $regex: keywords.join('|'), $options: 'i' } }
    ]
  };
  
  if (category) {
    query.category = category;
  }
  
  return this.find(query)
    .sort({ confidence: -1, 'usage.count': -1 })
    .limit(limit);
};

module.exports = mongoose.models.AIKnowledgeBase || mongoose.model("AIKnowledgeBase", knowledgeBaseSchema);