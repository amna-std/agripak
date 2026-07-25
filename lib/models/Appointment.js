const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const appointmentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expert: {
      type: Schema.Types.ObjectId,
      ref: "Expert",
      required: true,
    },
    dateTime: {
      type: Date,
      required: true,
    },
    duration: {
      // in minutes
      type: Number,
      required: true,
      min: 15,
      max: 240, // 4 hours max
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled", "rejected", "expired"],
      default: "pending",
    },
    meetingType: {
      type: String,
      enum: ["video", "chat", "in_person"],
      required: true,
    },
    meetingLink: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "refunded", "failed"],
      default: "pending",
    },
    paymentId: {
      type: String,
      trim: true,
    },
    notes: [
      {
        content: {
          type: String,
          required: true,
        },
        addedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        isPrivate: {
          type: Boolean,
          default: false,
        },
      },
    ],
    reminderSent: {
      type: Boolean,
      default: false,
    },
    followUpDate: {
      type: Date,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
appointmentSchema.index({ user: 1 });
appointmentSchema.index({ expert: 1 });
appointmentSchema.index({ dateTime: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ user: 1, status: 1 });
appointmentSchema.index({ expert: 1, status: 1 });
appointmentSchema.index({ "paymentStatus": 1 });

// Virtual for end time
appointmentSchema.virtual("endTime").get(function () {
  return new Date(this.dateTime.getTime() + this.duration * 60000);
});

// Method to check if appointment is upcoming
appointmentSchema.methods.isUpcoming = function () {
  const now = new Date();
  return this.dateTime > now && this.status === "confirmed";
};

// Method to check if appointment is completed
appointmentSchema.methods.isCompleted = function () {
  return this.status === "completed";
};

// Method to check if appointment can be cancelled
appointmentSchema.methods.canBeCancelled = function () {
  const now = new Date();
  const hoursUntilAppointment = (this.dateTime - now) / (1000 * 60 * 60);
  return ["pending", "confirmed"].includes(this.status) && hoursUntilAppointment > 24;
};

// Static method to find available slots
appointmentSchema.statics.findAvailableSlots = async function (expertId, date, duration = 60) {
  const Expert = mongoose.model("Expert");
  const expert = await Expert.findById(expertId);
  
  if (!expert || !expert.isAvailable) {
    return [];
  }

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get all appointments for the expert on the given date
  const appointments = await this.find({
    expert: expertId,
    dateTime: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ["confirmed", "pending"] },
  }).sort({ dateTime: 1 });

  // Get expert's availability for the day
  const day = date.toLocaleString("en-US", { weekday: "long" }).toLowerCase();
  const availableSlots = expert.availability
    .filter(slot => slot.day.toLowerCase() === day && slot.isAvailable)
    .flatMap(slot => {
      const [startHour, startMinute] = slot.startTime.split(":").map(Number);
      const [endHour, endMinute] = slot.endTime.split(":").map(Number);
      
      const slotStart = new Date(date);
      slotStart.setHours(startHour, startMinute, 0, 0);
      
      const slotEnd = new Date(date);
      slotEnd.setHours(endHour, endMinute, 0, 0);
      
      const slots = [];
      let currentSlot = new Date(slotStart);
      
      while (currentSlot.getTime() + duration * 60000 <= slotEnd.getTime()) {
        slots.push(new Date(currentSlot));
        currentSlot = new Date(currentSlot.getTime() + duration * 60000);
      }
      
      return slots;
    });

  // Filter out slots that conflict with existing appointments
  return availableSlots.filter(slot => {
    const slotEnd = new Date(slot.getTime() + duration * 60000);
    
    return !appointments.some(apt => {
      const aptEnd = new Date(apt.dateTime.getTime() + apt.duration * 60000);
      return (
        (slot >= apt.dateTime && slot < aptEnd) ||
        (slotEnd > apt.dateTime && slotEnd <= aptEnd) ||
        (slot <= apt.dateTime && slotEnd >= aptEnd)
      );
    });
  });
};

// Pre-save hook to validate appointment time
appointmentSchema.pre("save", async function (next) {
  if (this.isModified("dateTime") || this.isNew) {
    // Use mongoose.model() to avoid circular dependency
    const Expert = mongoose.model("Expert");
    const expert = await Expert.findById(this.expert).select('isAvailable availability');
    
    if (!expert) {
      throw new Error("Expert not found");
    }
    
    if (!expert.isAvailable) {
      throw new Error("Expert is not currently available for appointments");
    }
    
    const day = this.dateTime.toLocaleString("en-US", { weekday: "long" }).toLowerCase();
    const time = this.dateTime.toTimeString().slice(0, 5);
    const endTime = new Date(this.dateTime.getTime() + this.duration * 60000).toTimeString().slice(0, 5);
    
    const isAvailable = expert.availability.some(
      slot =>
        slot.day.toLowerCase() === day &&
        slot.isAvailable &&
        time >= slot.startTime &&
        endTime <= slot.endTime
    );
    
    if (!isAvailable) {
      throw new Error("Selected time slot is not available");
    }
    
    // Check for conflicting appointments
    const conflictingAppointment = await this.constructor.findOne({
      expert: this.expert,
      dateTime: { $lt: new Date(this.dateTime.getTime() + this.duration * 60000) },
      endTime: { $gt: this.dateTime },
      status: { $in: ["pending", "confirmed"] },
      _id: { $ne: this._id },
    });
    
    if (conflictingAppointment) {
      throw new Error("Conflicting appointment exists");
    }
  }
  
  next();
});

// Post-save hook to send notifications
appointmentSchema.post("save", async function (doc) {
  // Implementation for sending notifications would go here
  // This could involve sending emails, push notifications, etc.
  console.log(`Appointment ${doc._id} saved with status: ${doc.status}`);
});

module.exports = mongoose.models.Appointment || mongoose.model("Appointment", appointmentSchema);
