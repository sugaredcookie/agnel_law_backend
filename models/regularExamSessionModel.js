import mongoose from "mongoose";

const RegularExamSessionSchema = new mongoose.Schema(
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
    examType: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "draft",
      index: true,
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

RegularExamSessionSchema.index({ academicYear: 1, term: 1 });
RegularExamSessionSchema.index({ status: 1, isActive: 1 });

RegularExamSessionSchema.pre("save", function (next) {
  if (this.examEndDate <= this.examStartDate) {
    return next(new Error("Exam end date must be after start date"));
  }
  next();
});

const RegularExamSession = mongoose.model(
  "RegularExamSession",
  RegularExamSessionSchema,
);

export default RegularExamSession;
