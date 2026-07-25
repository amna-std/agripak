const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['like', 'love', 'helpful', 'thanks'], default: 'like' },
  createdAt: { type: Date, default: Date.now }
});

const commentSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, maxlength: 1000 },
  reactions: [reactionSchema],
  isAnswer: { type: Boolean, default: false },
  attachments: [{
    url: String,
    type: { type: String, enum: ['image', 'video', 'document'] },
    filename: String
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const communityPostSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  content: { type: String, required: true, maxlength: 5000 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityGroup' },
  
  type: {
    type: String,
    enum: ['question', 'discussion', 'tip', 'experience', 'problem', 'success_story'],
    default: 'discussion'
  },
  
  category: {
    type: String,
    enum: ['crops', 'livestock', 'equipment', 'weather', 'market', 'government', 'general'],
    required: true
  },
  
  tags: [{ type: String, lowercase: true, trim: true }],
  
  location: {
    state: String,
    district: String,
    village: String
  },
  
  attachments: [{
    url: String,
    type: { type: String, enum: ['image', 'video', 'document'] },
    filename: String,
    size: Number
  }],
  
  reactions: [reactionSchema],
  comments: [commentSchema],
  
  views: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  
  isPinned: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  isResolved: { type: Boolean, default: false },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  language: { type: String, enum: ["en", "ur", "pa", "sd", "ps"], default: 'en' },
  
  metadata: {
    cropType: String,
    season: String,
    farmingMethod: String,
    problemSeverity: String,
    estimatedLoss: String
  },
  
  isActive: { type: Boolean, default: true },
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'approved'
  }
}, {
  timestamps: true
});

// Indexes
communityPostSchema.index({ title: 'text', content: 'text' });
communityPostSchema.index({ author: 1, createdAt: -1 });
communityPostSchema.index({ group: 1, createdAt: -1 });
communityPostSchema.index({ category: 1, type: 1 });
communityPostSchema.index({ tags: 1 });
communityPostSchema.index({ 'location.state': 1, 'location.district': 1 });
communityPostSchema.index({ views: -1, createdAt: -1 });

// Virtuals
communityPostSchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

communityPostSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

communityPostSchema.virtual('score').get(function() {
  const likes = this.reactions.filter(r => r.type === 'like').length;
  const helpful = this.reactions.filter(r => r.type === 'helpful').length * 2;
  return likes + helpful + this.comments.length;
});

// Methods
communityPostSchema.methods.addReaction = function(userId, type = 'like') {
  const existingReaction = this.reactions.find(r => r.user.toString() === userId.toString());
  
  if (existingReaction) {
    if (existingReaction.type === type) {
      this.reactions.pull(existingReaction._id);
    } else {
      existingReaction.type = type;
    }
  } else {
    this.reactions.push({ user: userId, type });
  }
  
  return this.save();
};

communityPostSchema.methods.addComment = function(userId, content, attachments = []) {
  this.comments.push({
    author: userId,
    content,
    attachments
  });
  return this.save();
};

communityPostSchema.methods.markAsResolved = function(commentId) {
  if (commentId) {
    const comment = this.comments.id(commentId);
    if (comment) {
      this.comments.forEach(c => c.isAnswer = false);
      comment.isAnswer = true;
    }
  }
  this.isResolved = true;
  return this.save();
};

// Static methods
communityPostSchema.statics.getTrending = function(limit = 10, timeframe = 7) {
  const since = new Date(Date.now() - timeframe * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    { $match: { createdAt: { $gte: since }, isActive: true } },
    {
      $addFields: {
        score: {
          $add: [
            { $size: '$reactions' },
            { $multiply: [{ $size: '$comments' }, 2] },
            { $divide: ['$views', 10] }
          ]
        }
      }
    },
    { $sort: { score: -1 } },
    { $limit: limit }
  ]);
};

communityPostSchema.statics.getByLocation = function(state, district = null, limit = 20) {
  const query = { 'location.state': state, isActive: true };
  if (district) query['location.district'] = district;
  
  return this.find(query)
    .populate('author', 'name profilePicture location')
    .populate('group', 'name')
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.models.CommunityPost || mongoose.model("CommunityPost", communityPostSchema);