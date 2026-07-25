const mongoose = require("mongoose")

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    category: {
      type: String,
      required: true,
      enum: ["seeds", "fertilizers", "pesticides", "tools", "equipment", "organic", "irrigation"],
      index: true,
    },
    subcategory: {
      type: String,
      required: true,
      index: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    images: [{
      url: String,
      alt: String,
      isPrimary: { type: Boolean, default: false }
    }],
    price: {
      mrp: { type: Number, required: true },
      selling: { type: Number, required: true },
      discount: { type: Number, default: 0 },
    },
    specifications: {
      weight: String,
      dimensions: String,
      material: String,
      composition: String,
      usage: String,
      dosage: String,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    stock: {
      quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true, enum: ["kg", "gm", "ltr", "ml", "pieces", "packets", "bags", "bottles", "kits"] },
      lowStockAlert: { type: Number, default: 10 },
    },
    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    reviews: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rating: { type: Number, required: true, min: 1, max: 5 },
      comment: String,
      date: { type: Date, default: Date.now },
      verified: { type: Boolean, default: false }
    }],
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    tags: [String],
    seoUrl: { type: String, unique: true, sparse: true },
    views: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    location: {
      state: String,
      district: String,
      pincode: String,
    },
    shipping: {
      freeShipping: { type: Boolean, default: false },
      shippingCost: { type: Number, default: 0 },
      deliveryDays: { type: Number, default: 7 },
    },
    negotiable: { type: Boolean, default: false },
    bulkDiscount: [{
      minQuantity: Number,
      discount: Number,
    }],
  },
  { timestamps: true }
)

productSchema.index({ name: "text", description: "text", tags: "text" })
productSchema.index({ category: 1, subcategory: 1 })
productSchema.index({ "price.selling": 1 })
productSchema.index({ "ratings.average": -1 })
productSchema.index({ createdAt: -1 })

// Calculate discount percentage
productSchema.pre('save', function(next) {
  if (this.price.mrp && this.price.selling) {
    this.price.discount = Math.round(((this.price.mrp - this.price.selling) / this.price.mrp) * 100)
  }
  next()
})

// Generate a unique SEO slug from the product name.
// seoUrl is a unique index, so leaving it unset made every product after the
// first collide on a null key.
productSchema.pre('save', function(next) {
  if (!this.seoUrl && this.name) {
    const slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    this.seoUrl = `${slug}-${this._id.toString().slice(-6)}`
  }
  next()
})

// Update ratings average
productSchema.methods.updateRatings = function() {
  if (this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, review) => sum + review.rating, 0)
    this.ratings.average = (total / this.reviews.length).toFixed(1)
    this.ratings.count = this.reviews.length
  }
}

// Check stock availability
productSchema.methods.isInStock = function(quantity = 1) {
  return this.stock.quantity >= quantity
}

// Reduce stock after purchase
productSchema.methods.reduceStock = function(quantity) {
  if (this.isInStock(quantity)) {
    this.stock.quantity -= quantity
    this.sales += quantity
    return true
  }
  return false
}

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema)