const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const availabilitySlotSchema = new Schema({
  day: {
    type: String,
    enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    required: true,
  },
  startTime: {
    type: String, // Format: "HH:MM" in 24-hour format
    required: true,
  },
  endTime: {
    type: String, // Format: "HH:MM" in 24-hour format
    required: true,
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
});

const expertSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    specialization: [
      {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },
    ],
    experience: {
      type: Number, // in years
      required: true,
      min: 0,
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    bio: {
      type: String,
      required: true,
      trim: true,
      minlength: 50,
      maxlength: 2000,
    },
    languages: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    availability: [availabilitySlotSchema],
    isAvailable: {
      type: Boolean,
      default: true,
    },
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    consultationFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    education: [
      {
        degree: {
          type: String,
          required: true,
          trim: true,
        },
        institution: {
          type: String,
          required: true,
          trim: true,
        },
        year: {
          type: Number,
          required: true,
        },
      },
    ],
    certifications: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        issuingOrganization: {
          type: String,
          required: true,
          trim: true,
        },
        issueDate: {
          type: Date,
          required: true,
        },
        credentialId: {
          type: String,
          trim: true,
        },
      },
    ],
    consultationMethods: {
      video: {
        type: Boolean,
        default: false,
      },
      chat: {
        type: Boolean,
        default: false,
      },
      inPerson: {
        type: Boolean,
        default: false,
      },
    },
    responseTime: {
      // in hours
      type: Number,
      default: 24,
      min: 1,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "on_leave"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
expertSchema.index({ specialization: 1 });
expertSchema.index({ "rating.average": -1 });
expertSchema.index({ experience: -1 });
expertSchema.index({ isAvailable: 1 });

// Virtual for total consultations
expertSchema.virtual("totalConsultations", {
  ref: "Appointment",
  localField: "_id",
  foreignField: "expert",
  count: true,
});

// Method to calculate average rating
expertSchema.methods.calculateAverageRating = async function () {
  const stats = await this.model("Review").aggregate([
    {
      $match: { expert: this._id },
    },
    {
      $group: {
        _id: "$expert",
        averageRating: { $avg: "$rating" },
        numOfReviews: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    this.rating.average = stats[0].averageRating;
    this.rating.count = stats[0].numOfReviews;
  } else {
    this.rating.average = 0;
    this.rating.count = 0;
  }

  await this.save();
};

// Method to check availability
expertSchema.methods.isAvailableAt = function (date) {
  if (!this.availability || this.availability.length === 0) return false;
  if (!this.isAvailable || this.status !== "active") return false;

  const day = date.toLocaleString("en-US", { weekday: "long" }).toLowerCase();
  const time = date.toTimeString().slice(0, 5); // Get HH:MM format

  return this.availability.some(
    (slot) =>
      slot.day.toLowerCase() === day &&
      slot.isAvailable &&
      time >= slot.startTime &&
      time <= slot.endTime
  );
};

// Static method to find available experts
expertSchema.statics.findAvailableExperts = function (specialization) {
  return this.find({
    isAvailable: true,
    status: "active",
    specialization: { $in: [specialization] },
  })
    .sort({ "rating.average": -1, experience: -1 })
    .populate("user", "name avatar email phone");
};

// Pre-save hook to ensure user role is set to 'expert'
expertSchema.pre("save", async function (next) {
  if (this.isNew) {
    const User = mongoose.model("User");
    await User.findByIdAndUpdate(this.user, { role: "expert" });
  }
  next();
});

// Pre-remove hook to handle cleanup
expertSchema.pre("remove", async function (next) {
  // Update user role if needed
  const User = mongoose.model("User");
  await User.findByIdAndUpdate(this.user, { role: "user" });
  
  // Handle any other cleanup (e.g., cancel future appointments)
  next();
});

module.exports = mongoose.models.Expert || mongoose.model("Expert", expertSchema);
