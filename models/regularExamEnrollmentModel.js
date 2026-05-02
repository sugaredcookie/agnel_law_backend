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

const RegularExamEnrollmentSchema = new mongoose.Schema(
  {
    examSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RegularExamSession",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
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
      trim: true,
    },
    course: {
      type: String,
      required: true,
      trim: true,
      enum: ["BA LLB", "LLB", "LLM"],
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
    batchLabel: {
      type: String,
      required: true,
      trim: true,
    },
    subjects: {
      type: [SubjectSelectionSchema],
      validate: {
        validator: (subjects) => Array.isArray(subjects) && subjects.length > 0,
        message: "At least one subject must be assigned",
      },
    },
    hallTicketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    hallTicketGenerated: {
      type: Boolean,
      default: false,
    },
    hallTicketGeneratedAt: {
      type: Date,
      default: null,
    },
    enrollmentStatus: {
      type: String,
      enum: ["enrolled", "completed"],
      default: "enrolled",
      index: true,
    },
    enrolledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

RegularExamEnrollmentSchema.index({ batch: 1, pattern: 1, course: 1 });
RegularExamEnrollmentSchema.index({ examSessionId: 1, studentId: 1 }, { unique: true });

const RegularExamEnrollment = mongoose.model(
  "RegularExamEnrollment",
  RegularExamEnrollmentSchema,
);

export default RegularExamEnrollment;
