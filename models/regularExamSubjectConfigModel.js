import mongoose from "mongoose";

const SubjectItemSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ["subject", "section"],
      default: "subject",
    },
    group: {
      type: String,
      trim: true,
      default: null,
    },
    examDate: {
      type: String,
      trim: true,
      default: null,
    },
    examTime: {
      type: String,
      trim: true,
      default: "10:30 AM to 01:00 PM",
    },
    examType: {
      type: String,
      trim: true,
      default: "Semester End Examination",
    },
  },
  { _id: false },
);

const RegularExamSubjectConfigSchema = new mongoose.Schema(
  {
    examSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RegularExamSession",
      required: true,
      index: true,
    },
    course: {
      type: String,
      required: true,
      trim: true,
      enum: ["BA LLB", "LLB", "LLM"],
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
    actualBatches: {
      type: [String],
      default: [],
    },
    pattern: {
      type: String,
      required: true,
      trim: true,
      enum: ["75:25", "60:40"],
    },
    subjects: {
      type: [SubjectItemSchema],
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

RegularExamSubjectConfigSchema.index(
  { examSessionId: 1, course: 1, batch: 1, pattern: 1 },
  { unique: true },
);

const RegularExamSubjectConfig = mongoose.model(
  "RegularExamSubjectConfig",
  RegularExamSubjectConfigSchema,
);

export default RegularExamSubjectConfig;
