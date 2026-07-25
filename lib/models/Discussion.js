const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const commentSchema = new Schema(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isSolution: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const discussionSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    group: {
      type: Schema.Types.ObjectId,
      ref: "CommunityGroup",
      required: true,
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    category: {
      type: String,
      required: true,
      enum: ["question", "discussion", "announcement", "help"],
    },
    views: {
      type: Number,
      default: 0,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isClosed: {
      type: Boolean,
      default: false,
    },
    comments: [commentSchema],
    upvotes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    downvotes: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    attachments: [
      {
        url: String,
        type: {
          type: String,
          enum: ["image", "video", "document", "link"],
        },
        name: String,
      },
    ],
  },
  { timestamps: true }
);

// Indexes for better query performance
discussionSchema.index({ title: "text", content: "text" });
discussionSchema.index({ author: 1 });
discussionSchema.index({ group: 1 });
discussionSchema.index({ tags: 1 });
discussionSchema.index({ category: 1 });
discussionSchema.index({ createdAt: -1 });
discussionSchema.index({ views: -1 });

// Virtual for comment count
discussionSchema.virtual("commentCount").get(function () {
  return this.comments.length;
});

// Method to add a comment
discussionSchema.methods.addComment = function (userId, content) {
  this.comments.push({
    author: userId,
    content,
  });
  return this.save();
};

// Method to like a comment
discussionSchema.methods.likeComment = function (commentId, userId) {
  const comment = this.comments.id(commentId);
  if (!comment) throw new Error("Comment not found");
  
  const likeIndex = comment.likes.indexOf(userId);
  if (likeIndex === -1) {
    comment.likes.push(userId);
  } else {
    comment.likes.splice(likeIndex, 1);
  }
  
  return this.save();
};

// Method to mark a comment as solution
discussionSchema.methods.markAsSolution = function (commentId, userId) {
  // Only the discussion author can mark a solution
  if (this.author.toString() !== userId.toString()) {
    throw new Error("Only the discussion author can mark a solution");
  }
  
  const comment = this.comments.id(commentId);
  if (!comment) throw new Error("Comment not found");
  
  // Unmark any existing solution
  this.comments.forEach((c) => {
    c.isSolution = false;
  });
  
  // Mark the selected comment as solution
  comment.isSolution = true;
  this.isClosed = true;
  
  return this.save();
};

// Static method to get discussions by author
discussionSchema.statics.findByAuthor = function (authorId, page = 1, limit = 10) {
  return this.find({ author: authorId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("author", "name avatar")
    .populate("group", "name");
};

// Static method to get popular discussions
discussionSchema.statics.getPopular = function (limit = 10) {
  return this.find()
    .sort({ views: -1, "comments.length": -1 })
    .limit(limit)
    .populate("author", "name avatar")
    .populate("group", "name");
};

module.exports = mongoose.models.Discussion || mongoose.model("Discussion", discussionSchema);
