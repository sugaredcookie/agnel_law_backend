import mongoose from "mongoose";

const RevalSessionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Session title is required"],
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

RevalSessionSchema.index({ academicYear: 1, term: 1 });
RevalSessionSchema.index({ status: 1, isActive: 1 });

RevalSessionSchema.pre("save", function (next) {
  if (this.registrationEndDate <= this.registrationStartDate) {
    return next(new Error("Registration end date must be after start date"));
  }
  next();
});

const RevalSession = mongoose.model("RevalSession", RevalSessionSchema);

export default RevalSession;
