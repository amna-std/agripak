const mongoose = require('mongoose');

const forumCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  icon: String,
  color: String,
  isActive: { type: Boolean, default: true },
  moderators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  postCount: { type: Number, default: 0 },
  lastActivity: { type: Date, default: Date.now }
}, {
  timestamps: true
});

const forumTopicSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  content: { type: String, required: true, maxlength: 5000 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumCategory', required: true },
  tags: [String],
  isPinned: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  isSolved: { type: Boolean, default: false },
  solvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  views: { type: Number, default: 0 },
  replies: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 2000 },
    isAcceptedAnswer: { type: Boolean, default: false },
    votes: {
      up: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      down: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },
    attachments: [{
      type: String,
      url: String,
      name: String
    }],
    createdAt: { type: Date, default: Date.now },
    editedAt: Date,
    isEdited: { type: Boolean, default: false }
  }],
  lastReply: {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  },
  attachments: [{
    type: String,
    url: String,
    name: String
  }],
  reportCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Indexes
forumCategorySchema.index({ isActive: 1, name: 1 });
forumTopicSchema.index({ category: 1, isPinned: -1, updatedAt: -1 });
forumTopicSchema.index({ author: 1, createdAt: -1 });
forumTopicSchema.index({ tags: 1 });
forumTopicSchema.index({ isActive: 1, isSolved: 1 });

// Methods
forumTopicSchema.methods.addReply = function(userId, content, attachments = []) {
  const reply = {
    author: userId,
    content: content,
    attachments: attachments
  };
  
  this.replies.push(reply);
  this.lastReply = {
    author: userId,
    createdAt: new Date()
  };
  
  return this.replies[this.replies.length - 1];
};

forumTopicSchema.methods.markAsSolved = function(replyId, userId) {
  const reply = this.replies.id(replyId);
  if (reply) {
    // Remove previous accepted answer
    this.replies.forEach(r => r.isAcceptedAnswer = false);
    reply.isAcceptedAnswer = true;
    this.isSolved = true;
    this.solvedBy = userId;
  }
};

forumTopicSchema.methods.voteReply = function(replyId, userId, voteType) {
  const reply = this.replies.id(replyId);
  if (!reply) return false;

  // Remove existing votes
  reply.votes.up = reply.votes.up.filter(id => id.toString() !== userId.toString());
  reply.votes.down = reply.votes.down.filter(id => id.toString() !== userId.toString());

  // Add new vote
  if (voteType === 'up') {
    reply.votes.up.push(userId);
  } else if (voteType === 'down') {
    reply.votes.down.push(userId);
  }

  return true;
};

forumTopicSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Static methods
forumTopicSchema.statics.getPopularTopics = function(limit = 10) {
  return this.find({ isActive: true })
    .populate('author', 'name profilePicture')
    .populate('category', 'name color')
    .sort({ views: -1, replies: -1 })
    .limit(limit);
};

forumTopicSchema.statics.getRecentTopics = function(categoryId = null, limit = 20) {
  const query = { isActive: true };
  if (categoryId) query.category = categoryId;

  return this.find(query)
    .populate('author', 'name profilePicture')
    .populate('category', 'name color')
    .populate('lastReply.author', 'name')
    .sort({ isPinned: -1, updatedAt: -1 })
    .limit(limit);
};

forumTopicSchema.statics.searchTopics = function(searchTerm, categoryId = null) {
  const query = {
    isActive: true,
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { content: { $regex: searchTerm, $options: 'i' } },
      { tags: { $in: [new RegExp(searchTerm, 'i')] } }
    ]
  };

  if (categoryId) query.category = categoryId;

  return this.find(query)
    .populate('author', 'name profilePicture')
    .populate('category', 'name color')
    .sort({ updatedAt: -1 });
};

const ForumCategory = mongoose.models.ForumCategory || mongoose.model("ForumCategory", forumCategorySchema);
const ForumTopic = mongoose.models.ForumTopic || mongoose.model("ForumTopic", forumTopicSchema);

module.exports = { ForumCategory, ForumTopic };