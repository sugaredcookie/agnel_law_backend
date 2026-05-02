import mongoose from "mongoose";

const markChangeRequestSchema = new mongoose.Schema(
  {
    examSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "examSessionType",
      default: null,
    },
    examSessionType: {
      type: String,
      enum: ["RegularExamSession", "ATKTExamSession"],
      default: null,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    examResultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamResult",
      default: null,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    currentMarks: [
      {
        schemeName: String,
        obtainedMarks: Number,
        maxMarks: Number,
      },
    ],
    proposedMarks: [
      {
        schemeName: String,
        obtainedMarks: Number,
        maxMarks: Number,
      },
    ],
    remark: {
      type: String,
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
    },
    reviewedByType: {
      type: String,
      enum: ["Examiner", "Admin"],
    },
    reviewedAt: Date,
    reviewRemark: String,
  },
  { timestamps: true }
);

markChangeRequestSchema.index(
  { examSessionId: 1, studentId: 1, subjectId: 1, status: 1 }
);

const MarkChangeRequest = mongoose.model(
  "MarkChangeRequest",
  markChangeRequestSchema
);

export default MarkChangeRequest;
