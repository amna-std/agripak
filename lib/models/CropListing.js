const mongoose = require("mongoose")

const cropListingSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cropName: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: ["vegetables", "fruits", "grains", "pulses", "spices", "cash_crops"],
      index: true,
    },
    variety: {
      type: String,
      required: true,
    },
    quantity: {
      available: {
        type: Number,
        required: true,
        min: 0,
      },
      sold: {
        type: Number,
        default: 0,
      },
      unit: {
        type: String,
        required: true,
        // "maund" (~40 kg) is the unit Pakistani mandis actually trade in.
        enum: ["kg", "maund", "quintal", "ton", "pieces", "bags"],
      },
    },
    pricing: {
      basePrice: {
        type: Number,
        required: true,
      },
      negotiable: {
        type: Boolean,
        default: true,
      },
      minPrice: {
        type: Number,
      },
      bulkDiscount: [{
        minQuantity: Number,
        discountPercent: Number,
      }],
    },
    quality: {
      grade: {
        type: String,
        enum: ["A", "B", "C"],
        required: true,
      },
      organic: {
        type: Boolean,
        default: false,
      },
      certifications: [String],
      harvestDate: {
        type: Date,
        required: true,
      },
      shelfLife: {
        type: Number, // days
      },
    },
    location: {
      farmAddress: {
        type: String,
        required: true,
      },
      village: {
        type: String,
        required: true,
      },
      district: {
        type: String,
        required: true,
        index: true,
      },
      state: {
        type: String,
        required: true,
        index: true,
      },
      pincode: {
        type: String,
        required: true,
      },
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },
    images: [{
      url: {
        type: String,
        required: true,
      },
      caption: String,
      isPrimary: {
        type: Boolean,
        default: false,
      },
    }],
    availability: {
      readyForHarvest: {
        type: Boolean,
        default: false,
      },
      availableFrom: {
        type: Date,
        required: true,
      },
      availableTill: {
        type: Date,
        required: true,
      },
    },
    delivery: {
      farmPickup: {
        type: Boolean,
        default: true,
      },
      homeDelivery: {
        type: Boolean,
        default: false,
      },
      deliveryRadius: {
        type: Number, // km
        default: 50,
      },
      deliveryCharges: {
        type: Number,
        default: 0,
      },
    },
    orders: [{
      buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      quantity: Number,
      price: Number,
      status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "completed"],
        default: "pending",
      },
      orderDate: {
        type: Date,
        default: Date.now,
      },
      deliveryDate: Date,
      notes: String,
    }],
    status: {
      type: String,
      enum: ["active", "sold_out", "expired", "inactive"],
      default: "active",
      index: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    inquiries: {
      type: Number,
      default: 0,
    },
    ratings: {
      average: {
        type: Number,
        default: 0,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    reviews: [{
      buyer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: String,
      date: {
        type: Date,
        default: Date.now,
      },
    }],
  },
  {
    timestamps: true,
  }
)

cropListingSchema.index({ cropName: "text", variety: "text" })
cropListingSchema.index({ "location.district": 1, "location.state": 1 })
cropListingSchema.index({ category: 1, status: 1 })
cropListingSchema.index({ "availability.availableFrom": 1, "availability.availableTill": 1 })

// Auto-expire listings
cropListingSchema.pre('save', function(next) {
  if (new Date() > this.availability.availableTill) {
    this.status = 'expired'
  }
  if (this.quantity.available <= 0) {
    this.status = 'sold_out'
  }
  next()
})

// Calculate remaining quantity
cropListingSchema.virtual('remainingQuantity').get(function() {
  return this.quantity.available - this.quantity.sold
})

// Check if listing is available
cropListingSchema.methods.isAvailable = function(requestedQuantity = 0) {
  const now = new Date()
  return this.status === 'active' && 
         now >= this.availability.availableFrom && 
         now <= this.availability.availableTill &&
         this.remainingQuantity >= requestedQuantity
}

// Add order to listing
cropListingSchema.methods.addOrder = function(buyerId, quantity, price, notes = '') {
  if (!this.isAvailable(quantity)) {
    throw new Error('Insufficient quantity or listing not available')
  }
  
  this.orders.push({
    buyer: buyerId,
    quantity,
    price,
    notes,
    status: 'pending'
  })
  
  this.inquiries += 1
  return this.save()
}

// Accept/reject order
cropListingSchema.methods.updateOrderStatus = function(orderId, status, deliveryDate = null) {
  const order = this.orders.id(orderId)
  if (!order) throw new Error('Order not found')
  
  order.status = status
  if (deliveryDate) order.deliveryDate = deliveryDate
  
  if (status === 'accepted') {
    this.quantity.sold += order.quantity
    if (this.quantity.sold >= this.quantity.available) {
      this.status = 'sold_out'
    }
  }
  
  return this.save()
}

// Update ratings
cropListingSchema.methods.updateRatings = function() {
  if (this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, review) => sum + review.rating, 0)
    this.ratings.average = (total / this.reviews.length).toFixed(1)
    this.ratings.count = this.reviews.length
  }
}

module.exports = mongoose.models.CropListing || mongoose.model("CropListing", cropListingSchema)