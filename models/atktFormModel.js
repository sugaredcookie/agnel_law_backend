import mongoose from "mongoose";

const SubjectSelectionSchema = new mongoose.Schema(
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
    group: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false },
);

const AtktFormSchema = new mongoose.Schema(
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
    pattern: {
      type: String,
      required: true,
      trim: true,
      enum: ["75:25", "60:40"],
    },
    batch: {
      type: String,
      required: true,
      trim: true,
    },
    examSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ATKTExamSession",
      required: true,
      index: true,
    },
    subjects: {
      type: [SubjectSelectionSchema],
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

AtktFormSchema.index({ batch: 1, pattern: 1, course: 1 });
AtktFormSchema.index({ examSessionId: 1, submittedBy: 1, submittedByRole: 1 });

const ATKTForm = mongoose.model("ATKTForm", AtktFormSchema);

export default ATKTForm;
