import mongoose from "mongoose";

const AtktExamSessionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Exam session title is required"],
      trim: true,
    },
    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      trim: true,
    },
    term: {
      type: String,
      enum: ["Term 1", "Term 2", "Annual"],
      required: true,
      default: "Term 1",
    },
    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "draft",
      index: true,
    },
    registrationStartDate: {
      type: Date,
      required: [true, "Registration start date is required"],
    },
    registrationEndDate: {
      type: Date,
      required: [true, "Registration end date is required"],
    },
    examStartDate: {
      type: Date,
      required: [true, "Exam start date is required"],
    },
    examEndDate: {
      type: Date,
      required: [true, "Exam end date is required"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: false,
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

AtktExamSessionSchema.index({ academicYear: 1, term: 1 });
AtktExamSessionSchema.index({ status: 1, isActive: 1 });

AtktExamSessionSchema.pre("save", function (next) {
  if (this.registrationEndDate <= this.registrationStartDate) {
    return next(new Error("Registration end date must be after start date"));
  }
  if (this.examEndDate <= this.examStartDate) {
    return next(new Error("Exam end date must be after start date"));
  }
  next();
});

const ATKTExamSession = mongoose.model(
  "ATKTExamSession",
  AtktExamSessionSchema,
);

export default ATKTExamSession;
