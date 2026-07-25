const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  sender: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    intent: String,
    confidence: Number,
    entities: [String],
    language: {
      type: String,
      default: 'en'
    }
  }
});

const conversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  messages: [messageSchema],
  context: {
    currentTopic: String,
    userProfile: {
      farmingExperience: String,
      primaryCrops: [String],
      location: {
        state: String,
        district: String
      },
      soilType: String,
      farmSize: Number
    },
    preferences: {
      language: {
        type: String,
        default: 'en'
      },
      voiceEnabled: {
        type: Boolean,
        default: false
      }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

conversationSchema.index({ userId: 1, sessionId: 1 });
conversationSchema.index({ lastActivity: -1 });

conversationSchema.methods.addMessage = function(text, sender, metadata = {}) {
  this.messages.push({
    text,
    sender,
    metadata,
    timestamp: new Date()
  });
  this.lastActivity = new Date();
  return this.save();
};

conversationSchema.statics.getActiveConversation = function(userId, sessionId) {
  return this.findOne({ userId, sessionId, isActive: true });
};

conversationSchema.statics.createNewConversation = function(userId, sessionId, context = {}) {
  return this.create({
    userId,
    sessionId,
    context,
    messages: []
  });
};

module.exports = mongoose.models.AIConversation || mongoose.model("AIConversation", conversationSchema);