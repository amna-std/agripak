const mongoose = require("mongoose")

const negotiationSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    originalPrice: {
      type: Number,
      required: true,
    },
    proposedPrice: {
      type: Number,
      required: true,
    },
    finalPrice: {
      type: Number,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "counter", "expired"],
      default: "pending",
    },
    messages: [{
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      message: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    }],
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
    counterOffers: [{
      price: Number,
      message: String,
      timestamp: { type: Date, default: Date.now },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    }],
  },
  { timestamps: true }
)

negotiationSchema.index({ buyer: 1, seller: 1 })
negotiationSchema.index({ product: 1 })
negotiationSchema.index({ status: 1 })
negotiationSchema.index({ expiresAt: 1 })

// Auto-expire negotiations
negotiationSchema.methods.checkExpiry = function() {
  if (new Date() > this.expiresAt && this.status === "pending") {
    this.status = "expired"
    return this.save()
  }
  return Promise.resolve(this)
}

// Add message to negotiation
negotiationSchema.methods.addMessage = function(senderId, message) {
  this.messages.push({
    sender: senderId,
    message: message,
    timestamp: new Date()
  })
  return this.save()
}

// Accept negotiation
negotiationSchema.methods.accept = function(finalPrice = null) {
  this.status = "accepted"
  this.finalPrice = finalPrice || this.proposedPrice
  return this.save()
}

// Reject negotiation
negotiationSchema.methods.reject = function() {
  this.status = "rejected"
  return this.save()
}

// Counter offer
negotiationSchema.methods.counterOffer = function(senderId, price, message) {
  this.counterOffers.push({
    price: price,
    message: message,
    sender: senderId,
    timestamp: new Date()
  })
  this.proposedPrice = price
  this.status = "counter"
  return this.save()
}

module.exports = mongoose.models.Negotiation || mongoose.model("Negotiation", negotiationSchema)