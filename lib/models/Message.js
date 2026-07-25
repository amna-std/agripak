const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  type: {
    type: String,
    enum: ['buyer-seller', 'farmer-farmer', 'expert-consultation'],
    required: true
  },
  relatedItem: {
    itemType: {
      type: String,
      enum: ['product', 'crop-listing', 'consultation', 'community-post']
    },
    itemId: mongoose.Schema.Types.ObjectId
  },
  lastMessage: {
    content: String,
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  },
  isActive: { type: Boolean, default: true },
  isBlocked: { type: Boolean, default: false },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'audio', 'location', 'contact'],
    default: 'text'
  },
  attachments: [{
    type: String,
    url: String,
    size: Number
  }],
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  isEdited: { type: Boolean, default: false },
  editedAt: Date,
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date
}, {
  timestamps: true
});

// Indexes
conversationSchema.index({ participants: 1, updatedAt: -1 });
conversationSchema.index({ type: 1, isActive: 1 });
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

// Methods
conversationSchema.methods.addParticipant = function(userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
  }
};

conversationSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(p => p.toString() !== userId.toString());
};

conversationSchema.methods.updateLastMessage = function(messageContent, senderId) {
  this.lastMessage = {
    content: messageContent,
    sender: senderId,
    timestamp: new Date()
  };
  this.updatedAt = new Date();
};

messageSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(r => r.user.toString() === userId.toString());
  if (!existingRead) {
    this.readBy.push({ user: userId });
  }
};

// Static methods
conversationSchema.statics.findOrCreateConversation = async function(participants, type, relatedItem = null) {
  let conversation = await this.findOne({
    participants: { $all: participants, $size: participants.length },
    type: type,
    isActive: true
  });

  if (!conversation) {
    conversation = new this({
      participants,
      type,
      relatedItem
    });
    await conversation.save();
  }

  return conversation;
};

conversationSchema.statics.getUserConversations = function(userId) {
  return this.find({
    participants: userId,
    isActive: true
  })
  .populate('participants', 'name profilePicture isOnline lastSeen')
  .populate('lastMessage.sender', 'name')
  .sort({ updatedAt: -1 });
};

messageSchema.statics.getConversationMessages = function(conversationId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  return this.find({
    conversation: conversationId,
    isDeleted: false
  })
  .populate('sender', 'name profilePicture')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);

module.exports = { Conversation, Message };