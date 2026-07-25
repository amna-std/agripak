const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  itemType: {
    type: String,
    enum: ['product', 'expert', 'consultation', 'crop-listing'],
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    maxlength: 1000
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  helpfulVotes: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isHelpful: Boolean
  }]
}, {
  timestamps: true
});

// Compound indexes
ratingSchema.index({ itemId: 1, itemType: 1 });
ratingSchema.index({ itemId: 1, itemType: 1, user: 1 }, { unique: true });
ratingSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.Rating || mongoose.model("Rating", ratingSchema);