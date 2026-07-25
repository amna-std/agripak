const mongoose = require("mongoose")

const marketPriceSchema = new mongoose.Schema(
  {
    cropName: {
      type: String,
      required: true,
      index: true,
    },
    variety: {
      type: String,
      required: true,
    },
    market: {
      name: {
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
      marketCode: String,
    },
    prices: {
      minimum: {
        type: Number,
        required: true,
      },
      maximum: {
        type: Number,
        required: true,
      },
      modal: {
        type: Number,
        required: true,
      },
      average: {
        type: Number,
        required: true,
      },
    },
    unit: {
      type: String,
      default: "quintal",
      enum: ["quintal", "kg", "ton"],
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    arrivals: {
      type: Number,
      default: 0,
    },
    trend: {
      direction: {
        type: String,
        enum: ["up", "down", "stable"],
        default: "stable",
      },
      percentage: {
        type: Number,
        default: 0,
      },
    },
    quality: {
      type: String,
      enum: ["poor", "average", "good", "excellent"],
      default: "average",
    },
    source: {
  type: String,
  default: "amis",
  // `amis` = AMIS Punjab wholesale mandi rates, `pbs` = PBS weekly SPI retail
  // prices. Both are needed as distinct values: the read layer maps source to
  // wholesale-vs-retail, and collapsing them would make the UI badge lie about
  // what a figure actually represents.
  enum: ["manual", "api", "scraping", "seeded", "amis", "pbs"],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    metadata: {
      humidity: Number,
      temperature: Number,
      weatherCondition: String,
      festivalSeason: Boolean,
      harvestSeason: Boolean,
    },
  },
  {
    timestamps: true,
  },
)

marketPriceSchema.index({ cropName: 1, date: -1 })
marketPriceSchema.index({ "market.district": 1, "market.state": 1, date: -1 })
marketPriceSchema.index({ cropName: 1, "market.district": 1, date: -1 })

marketPriceSchema.statics.calculateTrend = async function (cropName, district, days = 7) {
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)

  const prices = await this.find({
    cropName,
    "market.district": district,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: 1 })

  if (prices.length < 2) return { direction: "stable", percentage: 0 }

  const firstPrice = prices[0].prices.modal
  const lastPrice = prices[prices.length - 1].prices.modal
  const percentage = ((lastPrice - firstPrice) / firstPrice) * 100

  let direction = "stable"
  if (percentage > 2) direction = "up"
  else if (percentage < -2) direction = "down"

  return { direction, percentage: Math.abs(percentage).toFixed(2) }
}

marketPriceSchema.statics.getPriceHistory = function (cropName, district, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  return this.find({
    cropName,
    "market.district": district,
    date: { $gte: startDate },
  })
    .sort({ date: 1 })
    .select("prices.modal date arrivals")
}

marketPriceSchema.statics.getNearbyPrices = function (district, state, cropName = null) {
  const query = {
    "market.state": state,
    date: {
      $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  }

  if (cropName) query.cropName = cropName
  if (district) query["market.district"] = district

  return this.find(query).sort({ date: -1, "prices.modal": -1 }).limit(50)
}

marketPriceSchema.statics.getTopMovers = async function (type = "gainers", limit = 5) {
  const pipeline = [
    {
      $match: {
        date: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    },
    {
      $group: {
        _id: "$cropName",
        latestPrice: { $last: "$prices.modal" },
        earliestPrice: { $first: "$prices.modal" },
        market: { $last: "$market" },
        date: { $last: "$date" },
      },
    },
    {
      $addFields: {
        changePercent: {
          $multiply: [
            {
              $divide: [{ $subtract: ["$latestPrice", "$earliestPrice"] }, "$earliestPrice"],
            },
            100,
          ],
        },
      },
    },
    {
      $sort: type === "gainers" ? { changePercent: -1 } : { changePercent: 1 },
    },
    {
      $limit: limit,
    },
  ]

  return this.aggregate(pipeline)
}

marketPriceSchema.virtual("priceChange").get(function () {
  return this.prices.maximum - this.prices.minimum
})

marketPriceSchema.virtual("volatility").get(function () {
  const range = this.prices.maximum - this.prices.minimum
  return (range / this.prices.average) * 100
})

module.exports = mongoose.models.MarketPrice || mongoose.model("MarketPrice", marketPriceSchema)