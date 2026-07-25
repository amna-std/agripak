const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageLogSchema = new Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "MessageTemplate",
    },
    templateName: {
      type: String,
      trim: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipientPhone: {
      type: String,
      required: true,
      trim: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    senderPhone: {
      type: String,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    originalContent: {
      type: String,
      trim: true,
    },
    variables: {
      type: Map,
      of: String,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "read", "failed", "undelivered"],
      default: "pending",
      required: true,
    },
    statusUpdates: [
      {
        status: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        details: {
          type: String,
          trim: true,
        },
        error: {
          code: String,
          message: String,
          details: String,
        },
      },
    ],
    provider: {
      type: String,
      enum: ["twilio", "whatsapp", "sms", "email", "other"],
      default: "whatsapp",
    },
    providerId: {
      type: String,
      trim: true,
    },
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },
    mediaUrls: [
      {
        url: {
          type: String,
          required: true,
          trim: true,
        },
        contentType: {
          type: String,
          trim: true,
        },
        caption: {
          type: String,
          trim: true,
        },
      },
    ],
    cost: {
      amount: {
        type: Number,
        min: 0,
      },
      currency: {
        type: String,
        default: "USD",
        trim: true,
      },
    },
    metadata: {
      type: Map,
      of: String,
    },
    error: {
      code: {
        type: String,
        trim: true,
      },
      message: {
        type: String,
        trim: true,
      },
      details: {
        type: String,
        trim: true,
      },
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextRetryAt: {
      type: Date,
    },
    isAutomated: {
      type: Boolean,
      default: false,
    },
    campaignId: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Indexes for better query performance
messageLogSchema.index({ messageId: 1 }, { unique: true });
messageLogSchema.index({ recipient: 1 });
messageLogSchema.index({ sender: 1 });
messageLogSchema.index({ status: 1 });
messageLogSchema.index({ direction: 1 });
messageLogSchema.index({ provider: 1 });
messageLogSchema.index({ "statusUpdates.timestamp": 1 });
messageLogSchema.index({ createdAt: 1 });
messageLogSchema.index({ updatedAt: 1 });
messageLogSchema.index({ templateId: 1 });
messageLogSchema.index({ recipientPhone: 1 });
messageLogSchema.index({ providerId: 1 });

// Virtual for message delivery time
messageLogSchema.virtual("deliveryTime").get(function () {
  if (this.status !== "delivered" || !this.statusUpdates) return null;
  
  const deliveredUpdate = this.statusUpdates.find(
    (update) => update.status === "delivered"
  );
  
  return deliveredUpdate ? deliveredUpdate.timestamp : null;
});

// Method to update message status
messageLogSchema.methods.updateStatus = function (status, details = {}) {
  this.status = status;
  this.statusUpdates.push({
    status,
    details: details.message || "",
    error: details.error
      ? {
          code: details.error.code,
          message: details.error.message,
          details: details.error.details,
        }
      : undefined,
  });

  // Update retry information if this is a retry
  if (status === "pending" && details.isRetry) {
    this.retryCount += 1;
    this.nextRetryAt = details.nextRetryAt;
  }

  return this.save();
};

// Static method to find failed messages that need to be retried
messageLogSchema.statics.findMessagesToRetry = function (maxRetries = 3) {
  return this.find({
    status: { $in: ["failed", "undelivered"] },
    retryCount: { $lt: maxRetries },
    $or: [
      { nextRetryAt: { $lte: new Date() } },
      { nextRetryAt: { $exists: false } },
    ],
  }).limit(100);
};

// Pre-save hook to set default values
messageLogSchema.pre("save", function (next) {
  // Set the original content on first save if it's an outbound message
  if (this.isNew && this.direction === "outbound" && !this.originalContent) {
    this.originalContent = this.content;
  }
  
  next();
});

// Post-save hook to trigger notifications or other actions
messageLogSchema.post("save", function (doc) {
  // Implementation for triggering notifications or other actions would go here
  console.log(`Message ${doc._id} saved with status: ${doc.status}`);
});

const MessageLog = mongoose.models.MessageLog || mongoose.model("MessageLog", messageLogSchema);

module.exports = MessageLog;
