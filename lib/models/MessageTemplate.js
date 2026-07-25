const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageTemplateSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "welcome",
        "appointment",
        "reminder",
        "alert",
        "promotional",
        "notification",
        "other",
      ],
      default: "notification",
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    variables: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        description: {
          type: String,
          trim: true,
        },
        required: {
          type: Boolean,
          default: false,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    language: {
      type: String,
      default: "en",
      trim: true,
    },
    platform: {
      type: String,
      enum: ["whatsapp", "sms", "email", "push", "all"],
      default: "whatsapp",
    },
    approvalStatus: {
      type: String,
      enum: ["draft", "pending_approval", "approved", "rejected"],
      default: "draft",
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    metadata: {
      type: Map,
      of: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Indexes for better query performance
messageTemplateSchema.index({ name: 1 }, { unique: true });
messageTemplateSchema.index({ category: 1 });
messageTemplateSchema.index({ isActive: 1 });
messageTemplateSchema.index({ platform: 1 });
messageTemplateSchema.index({ language: 1 });
messageTemplateSchema.index({ approvalStatus: 1 });

// Virtual for formatted content with variables replaced
messageTemplateSchema.virtual("formattedContent").get(function () {
  return this.content;
});

// Method to compile template with variables
messageTemplateSchema.methods.compile = function (variables = {}) {
  let compiledContent = this.content;
  
  // Replace variables in the template
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{${key}}}`, 'g');
    compiledContent = compiledContent.replace(placeholder, value || '');
  }
  
  return compiledContent;
};

// Static method to find templates by category
messageTemplateSchema.statics.findByCategory = function (category, options = {}) {
  const { isActive = true, platform = "whatsapp", language = "en" } = options;
  
  return this.find({
    category,
    isActive,
    platform: { $in: [platform, "all"] },
    language,
    approvalStatus: "approved",
  }).sort({ name: 1 });
};

// Pre-save hook to validate variables in content
messageTemplateSchema.pre("save", function (next) {
  if (this.isModified("content")) {
    // Extract all variables from content
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variablesInContent = [];
    let match;
    
    while ((match = variableRegex.exec(this.content)) !== null) {
      variablesInContent.push(match[1]);
    }
    
    // Validate that all required variables are provided
    const requiredVariables = this.variables
      .filter(v => v.required)
      .map(v => v.name);
    
    const missingVariables = requiredVariables.filter(
      v => !variablesInContent.includes(v)
    );
    
    if (missingVariables.length > 0) {
      throw new Error(
        `Missing required variables in content: ${missingVariables.join(", ")}`
      );
    }
  }
  
  next();
});

// Pre-remove hook to prevent deletion of system templates
messageTemplateSchema.pre("remove", function (next) {
  if (this.isSystem) {
    throw new Error("Cannot delete system templates");
  }
  next();
});

const MessageTemplate = mongoose.models.MessageTemplate || mongoose.model("MessageTemplate", messageTemplateSchema);

module.exports = MessageTemplate;
