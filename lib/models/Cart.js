const mongoose = require("mongoose")

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      price: {
        type: Number,
        required: true,
      },
      addedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    totalAmount: {
      type: Number,
      default: 0,
    },
    totalItems: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
)

cartSchema.methods.calculateTotal = function() {
  this.totalAmount = this.items.reduce((total, item) => total + (item.price * item.quantity), 0)
  this.totalItems = this.items.reduce((total, item) => total + item.quantity, 0)
}

module.exports = mongoose.models.Cart || mongoose.model("Cart", cartSchema)