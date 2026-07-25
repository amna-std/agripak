const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "document", "voice", "location"],
      default: "text",
    },
    attachments: [
      {
        url: String,
        type: String,
        size: Number,
        filename: String,
      },
    ],
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        emoji: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
  },
  { timestamps: true },
)

const communityGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    avatar: {
      type: String,
      default: null,
    },

    // Group Classification
    category: {
      type: String,
      enum: ["crop_specific", "location_based", "technique_based", "general", "expert_led", "disease_support"],
      required: true,
    },
    subcategory: {
      type: String, // e.g., 'rice', 'wheat', 'organic', 'hydroponics'
    },

    // Location-based grouping
    location: {
      state: String,
      district: String,
      village: String,
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },

    // Group Settings
    privacy: {
      type: String,
      enum: ["public", "private", "invite_only"],
      default: "public",
    },
    maxMembers: {
      type: Number,
      default: 500,
      max: 1000,
    },
    language: {
      type: String,
      enum: ["en", "hi", "te", "mixed"],
      default: "mixed",
    },

    // Members Management
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["member", "moderator", "admin", "expert"],
          default: "member",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
        lastSeen: {
          type: Date,
          default: Date.now,
        },
        messageCount: {
          type: Number,
          default: 0,
        },
        reputation: {
          type: Number,
          default: 0,
        },
      },
    ],

    // Group Creator
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // WhatsApp Integration
    whatsappGroup: {
      isConnected: { type: Boolean, default: false },
      groupId: String,
      inviteLink: String,
      adminPhone: String,
      lastSync: Date,
    },

    // Group Rules and Guidelines
    rules: [
      {
        title: String,
        description: String,
        priority: {
          type: String,
          enum: ["low", "medium", "high"],
          default: "medium",
        },
      },
    ],

    // Activity and Engagement
    stats: {
      totalMessages: { type: Number, default: 0 },
      activeMembers: { type: Number, default: 0 },
      dailyMessages: { type: Number, default: 0 },
      weeklyMessages: { type: Number, default: 0 },
      lastActivity: { type: Date, default: Date.now },
    },

    // Featured Content
    pinnedMessages: [
      {
        message: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
        pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        pinnedAt: { type: Date, default: Date.now },
      },
    ],

    // Group Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Tags for better discovery
    tags: [String],

    // Seasonal Information
    seasonalFocus: [
      {
        season: {
          type: String,
          enum: ["kharif", "rabi", "zaid", "summer"],
        },
        crops: [String],
        isActive: Boolean,
      },
    ],

    // Expert Sessions
    expertSessions: [
      {
        expert: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        topic: String,
        scheduledAt: Date,
        duration: Number, // in minutes
        isCompleted: { type: Boolean, default: false },
        attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        recording: String, // URL to recording
      },
    ],

    // Group Achievements
    achievements: [
      {
        title: String,
        description: String,
        achievedAt: Date,
        icon: String,
      },
    ],

    // Moderation
    moderationSettings: {
      autoModeration: { type: Boolean, default: false },
      bannedWords: [String],
      requireApproval: { type: Boolean, default: false },
      maxMessagesPerHour: { type: Number, default: 50 },
    },

    // Analytics
    analytics: {
      memberGrowth: [
        {
          date: Date,
          count: Number,
        },
      ],
      messageActivity: [
        {
          date: Date,
          count: Number,
        },
      ],
      topContributors: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          messageCount: Number,
          helpfulAnswers: Number,
        },
      ],
    },
  },
  {
    timestamps: true,
  },
)

// Indexes
communityGroupSchema.index({ category: 1, subcategory: 1 })
communityGroupSchema.index({ "location.state": 1, "location.district": 1 })
communityGroupSchema.index({ privacy: 1, isActive: 1 })
communityGroupSchema.index({ tags: 1 })
communityGroupSchema.index({ "members.user": 1 })
communityGroupSchema.index({ createdAt: -1 })

// Virtual for member count
communityGroupSchema.virtual("memberCount").get(function () {
  return this.members.filter((member) => member.isActive).length
})

// Virtual for active members today
communityGroupSchema.virtual("activeMembersToday").get(function () {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return this.members.filter((member) => member.isActive && member.lastSeen >= today).length
})

// Method to add member
communityGroupSchema.methods.addMember = function (userId, role = "member") {
  const existingMember = this.members.find((member) => member.user.toString() === userId.toString())

  if (existingMember) {
    if (!existingMember.isActive) {
      existingMember.isActive = true
      existingMember.joinedAt = new Date()
    }
    return existingMember
  }

  if (this.memberCount >= this.maxMembers) {
    throw new Error("Group has reached maximum member limit")
  }

  const newMember = {
    user: userId,
    role: role,
    joinedAt: new Date(),
    isActive: true,
    lastSeen: new Date(),
    messageCount: 0,
    reputation: 0,
  }

  this.members.push(newMember)
  return newMember
}

// Method to remove member
communityGroupSchema.methods.removeMember = function (userId) {
  const memberIndex = this.members.findIndex((member) => member.user.toString() === userId.toString())

  if (memberIndex !== -1) {
    this.members[memberIndex].isActive = false
    return true
  }
  return false
}

// Method to update member role
communityGroupSchema.methods.updateMemberRole = function (userId, newRole) {
  const member = this.members.find((member) => member.user.toString() === userId.toString() && member.isActive)

  if (member) {
    member.role = newRole
    return true
  }
  return false
}

// Method to check if user is member
communityGroupSchema.methods.isMember = function (userId) {
  return this.members.some((member) => member.user.toString() === userId.toString() && member.isActive)
}

// Method to check if user is admin or moderator
communityGroupSchema.methods.canModerate = function (userId) {
  const member = this.members.find((member) => member.user.toString() === userId.toString() && member.isActive)

  return member && ["admin", "moderator"].includes(member.role)
}

// Method to get member role
communityGroupSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find((member) => member.user.toString() === userId.toString() && member.isActive)

  return member ? member.role : null
}

// Method to update activity stats
communityGroupSchema.methods.updateActivity = function () {
  this.stats.lastActivity = new Date()
  this.stats.activeMembers = this.activeMembersToday
}

// Method to add points to member
communityGroupSchema.methods.addMemberPoints = function (userId, points) {
  const member = this.members.find((member) => member.user.toString() === userId.toString() && member.isActive)

  if (member) {
    member.reputation += points
    return true
  }
  return false
}

// Static method to find groups by location
communityGroupSchema.statics.findByLocation = function (state, district = null) {
  const query = {
    "location.state": state,
    isActive: true,
    privacy: { $in: ["public", "invite_only"] },
  }

  if (district) {
    query["location.district"] = district
  }

  return this.find(query).populate("members.user", "name role profilePicture")
}

// Static method to find groups by category
communityGroupSchema.statics.findByCategory = function (category, subcategory = null) {
  const query = {
    category: category,
    isActive: true,
    privacy: { $in: ["public", "invite_only"] },
  }

  if (subcategory) {
    query.subcategory = subcategory
  }

  return this.find(query).populate("members.user", "name role profilePicture")
}

// Static method to get trending groups
communityGroupSchema.statics.getTrendingGroups = function (limit = 10) {
  return this.find({
    isActive: true,
    privacy: { $in: ["public", "invite_only"] },
  })
    .sort({
      "stats.weeklyMessages": -1,
      "stats.activeMembers": -1,
      memberCount: -1,
    })
    .limit(limit)
    .populate("members.user", "name role profilePicture")
}

module.exports = mongoose.models.CommunityGroup || mongoose.model("CommunityGroup", communityGroupSchema)
