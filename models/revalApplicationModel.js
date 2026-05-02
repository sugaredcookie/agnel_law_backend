import mongoose from "mongoose";

const RevalSubjectSelectionSchema = new mongoose.Schema(
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
  },
  { _id: false },
);

const RevalApplicationSchema = new mongoose.Schema(
  {
    studentName: {
      type: String,
      required: [true, "Student name is required"],
      trim: true,
    },
    rollNumber: {
      type: String,
      required: [true, "Roll number is required"],
      trim: true,
    },
    contactNumber: {
      type: String,
      required: [true, "Contact number is required"],
      trim: true,
      validate: {
        validator: (value) => /^(\+?\d{10,15})$/.test(value),
        message: "Provide a valid contact number (10-15 digits)",
      },
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
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RevalSession",
      required: true,
      index: true,
    },
    applicationType: {
      type: String,
      enum: ["revaluation", "photocopy"],
      required: [true, "Application type is required"],
      index: true,
    },
    subjects: {
      type: [RevalSubjectSelectionSchema],
      validate: {
        validator: (subjects) => Array.isArray(subjects) && subjects.length > 0,
        message: "Select at least one subject",
      },
    },
    submittedBy: {
      type: String,
      default: null,
      index: true,
    },
    submittedByRole: {
      type: String,
      enum: ["student", "examiner", "unknown"],
      default: "unknown",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
      index: true,
    },
    amount: {
      type: Number,
      default: 0,
    },
    paymentRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "payment",
      default: null,
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

RevalApplicationSchema.index({ batch: 1, course: 1 });
RevalApplicationSchema.index({
  sessionId: 1,
  submittedBy: 1,
  submittedByRole: 1,
  applicationType: 1,
});

const RevalApplication = mongoose.model(
  "RevalApplication",
  RevalApplicationSchema,
);

export default RevalApplication;
