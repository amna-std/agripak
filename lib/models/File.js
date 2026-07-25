const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
// Node's built-in UUID generator — avoids pulling in the `uuid` package,
// which only existed in the old standalone server's dependencies.
const { randomUUID: uuidv4 } = require("crypto");

const fileSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    path: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    mimetype: {
      type: String,
      required: true,
      trim: true,
    },
    extension: {
      type: String,
      trim: true,
    },
    encoding: {
      type: String,
      trim: true,
    },
    md5: {
      type: String,
      trim: true,
    },
    sha256: {
      type: String,
      trim: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    accessKey: {
      type: String,
      default: () => uuidv4(),
      unique: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "ownerModel",
    },
    ownerModel: {
      type: String,
      enum: ["User", "Farmer", "Expert", "Consultation", "Product", "Post"],
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    metadata: {
      type: Map,
      of: String,
    },
    description: {
      type: String,
      trim: true,
    },
    width: {
      type: Number,
    },
    height: {
      type: Number,
    },
    duration: {
      type: Number,
      min: 0,
    },
    status: {
      type: String,
      enum: ["processing", "ready", "error", "deleted"],
      default: "processing",
    },
    error: {
      code: {
        type: String,
        trim: true,
      },
      message: {
        type: String,
        trim: true,
      },
      details: {
        type: String,
        trim: true,
      },
    },
    versions: [
      {
        width: Number,
        height: Number,
        path: String,
        size: Number,
        quality: {
          type: String,
          enum: ["original", "high", "medium", "low", "thumbnail"],
          default: "original",
        },
        format: String,
      },
    ],
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
fileSchema.index({ filename: 1 });
fileSchema.index({ mimetype: 1 });
fileSchema.index({ createdBy: 1 });
fileSchema.index({ owner: 1, ownerModel: 1 });
fileSchema.index({ isPublic: 1 });
fileSchema.index({ tags: 1 });
fileSchema.index({ md5: 1 });
fileSchema.index({ sha256: 1 });
fileSchema.index({ accessKey: 1 }, { unique: true });
fileSchema.index({ status: 1 });

// Virtual for file URL
fileSchema.virtual("url").get(function () {
  if (this.isPublic) {
    return `/api/files/public/${this.accessKey}`;
  }
  return `/api/files/${this._id}`;
});

// Virtual for thumbnail URL
fileSchema.virtual("thumbnailUrl").get(function () {
  if (this.versions && this.versions.length > 0) {
    const thumbnail = this.versions.find((v) => v.quality === "thumbnail");
    if (thumbnail) {
      return `/api/files/thumbnails/${this._id}`;
    }
  }
  return this.url;
});

// Pre-save hook to set file metadata
fileSchema.pre("save", async function (next) {
  // Set file extension if not provided
  if (!this.extension && this.filename) {
    this.extension = path.extname(this.filename).toLowerCase().substring(1);
  }

  // Calculate file hashes if not provided
  if (!this.md5 || !this.sha256) {
    try {
      const fileBuffer = fs.readFileSync(this.path);
      
      if (!this.md5) {
        this.md5 = crypto.createHash("md5").update(fileBuffer).digest("hex");
      }
      
      if (!this.sha256) {
        this.sha256 = crypto
          .createHash("sha256")
          .update(fileBuffer)
          .digest("hex");
      }
    } catch (error) {
      console.error("Error calculating file hashes:", error);
    }
  }

  next();
});

// Pre-remove hook to delete physical files
fileSchema.pre("remove", async function (next) {
  try {
    // Delete main file
    if (fs.existsSync(this.path)) {
      fs.unlinkSync(this.path);
    }

    // Delete all versions
    if (this.versions && this.versions.length > 0) {
      this.versions.forEach((version) => {
        if (version.path && fs.existsSync(version.path)) {
          fs.unlinkSync(version.path);
        }
      });
    }
  } catch (error) {
    console.error("Error deleting file:", error);
  }
  
  next();
});

// Static method to find files by owner
fileSchema.statics.findByOwner = function (ownerId, ownerModel) {
  return this.find({ owner: ownerId, ownerModel });
};

// Static method to find duplicate files by hash
fileSchema.statics.findDuplicates = function (hashType = "md5") {
  const aggregation = [
    {
      $group: {
        _id: `$${hashType}`,
        count: { $sum: 1 },
        files: { $push: "$$ROOT" },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
        _id: { $ne: null },
      },
    },
    {
      $sort: { count: -1 },
    },
  ];

  return this.aggregate(aggregation);
};

// Method to check if file exists on disk
fileSchema.methods.existsOnDisk = function () {
  return fs.existsSync(this.path);
};

// Method to get file stats
fileSchema.methods.getStats = function () {
  try {
    return fs.statSync(this.path);
  } catch (error) {
    return null;
  }
};

// Method to get file content as buffer
fileSchema.methods.getBuffer = function () {
  try {
    return fs.readFileSync(this.path);
  } catch (error) {
    throw new Error(`Error reading file: ${error.message}`);
  }
};

// Method to get file stream
fileSchema.methods.getStream = function () {
  try {
    return fs.createReadStream(this.path);
  } catch (error) {
    throw new Error(`Error creating read stream: ${error.message}`);
  }
};

const File = mongoose.models.File || mongoose.model("File", fileSchema);

module.exports = File;
