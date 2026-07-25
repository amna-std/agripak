const mongoose = require("mongoose")

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
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
      status: {
        type: String,
        enum: ["pending", "confirmed", "shipped", "delivered", "cancelled"],
        default: "pending",
      },
    }],
    shippingAddress: {
      name: String,
      mobile: String,
      address: String,
      village: String,
      district: String,
      state: String,
      pincode: String,
    },
    payment: {
      method: {
        type: String,
        enum: ["cod", "online", "upi"],
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "pending",
      },
      transactionId: String,
      amount: Number,
    },
    pricing: {
      subtotal: Number,
      shipping: Number,
      discount: Number,
      total: Number,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    tracking: {
      awbNumber: String,
      courier: String,
      estimatedDelivery: Date,
    },
    notes: String,
  },
  { timestamps: true }
)

orderSchema.pre("save", function(next) {
  if (!this.orderId) {
    this.orderId = "KM" + Date.now() + Math.floor(Math.random() * 1000)
  }
  next()
})

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema)