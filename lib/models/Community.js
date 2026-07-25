const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  images: [{
    url: String,
    caption: String
  }],
  category: {
    type: String,
    enum: ['tips', 'experience', 'question', 'success-story', 'problem', 'general'],
    default: 'general'
  },
  tags: [String],
  likes: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  comments: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  shares: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  location: {
    state: String,
    district: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  isResolved: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  reportCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Indexes for performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ category: 1, createdAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ 'location.state': 1, 'location.district': 1 });
postSchema.index({ isActive: 1, isPinned: -1, createdAt: -1 });

// Methods
postSchema.methods.toggleLike = function(userId) {
  const existingLike = this.likes.find(like => like.user.toString() === userId.toString());
  if (existingLike) {
    this.likes = this.likes.filter(like => like.user.toString() !== userId.toString());
    return false;
  } else {
    this.likes.push({ user: userId });
    return true;
  }
};

postSchema.methods.addComment = function(userId, content) {
  this.comments.push({
    author: userId,
    content: content
  });
  return this.comments[this.comments.length - 1];
};

postSchema.methods.getEngagementStats = function() {
  return {
    likes: this.likes.length,
    comments: this.comments.length,
    shares: this.shares.length,
    engagement: this.likes.length + this.comments.length + this.shares.length
  };
};

// Static methods
postSchema.statics.getPopularPosts = function(limit = 10) {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $addFields: {
        engagement: {
          $add: [
            { $size: '$likes' },
            { $size: '$comments' },
            { $size: '$shares' }
          ]
        }
      }
    },
    { $sort: { engagement: -1, createdAt: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        as: 'author'
      }
    },
    { $unwind: '$author' }
  ]);
};

postSchema.statics.getPostsByLocation = function(state, district) {
  const query = { isActive: true };
  if (state) query['location.state'] = state;
  if (district) query['location.district'] = district;
  
  return this.find(query)
    .populate('author', 'name profilePicture location')
    .sort({ isPinned: -1, createdAt: -1 });
};

module.exports = mongoose.models.CommunityPost || mongoose.model("CommunityPost", postSchema);