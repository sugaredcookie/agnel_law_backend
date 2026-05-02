import mongoose from "mongoose";

const RevalSubjectItemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
    },
  },
  { _id: false },
);

const RevalSubjectConfigSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RevalSession",
      required: true,
      index: true,
    },
    course: {
      type: String,
      required: true,
      trim: true,
      enum: ["BA LLB", "LLB"],
    },
    batch: {
      type: String,
      required: true,
      trim: true,
    },
    batchLabel: {
      type: String,
      required: true,
      trim: true,
    },
    subjects: {
      type: [RevalSubjectItemSchema],
      validate: {
        validator: (subjects) => Array.isArray(subjects) && subjects.length > 0,
        message: "At least one subject must be configured",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

RevalSubjectConfigSchema.index(
  { sessionId: 1, course: 1, batch: 1 },
  { unique: true },
);

const RevalSubjectConfig = mongoose.model(
  "RevalSubjectConfig",
  RevalSubjectConfigSchema,
);

export default RevalSubjectConfig;
