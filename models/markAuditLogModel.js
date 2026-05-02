import mongoose from "mongoose";

const markAuditLogSchema = new mongoose.Schema(
  {
    examResultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamResult",
    },
    examSessionId: {
      type: mongoose.Schema.Types.ObjectId,
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
    action: {
      type: String,
      enum: [
        "marks_entered",
        "marks_updated",
        "change_requested",
        "change_approved",
        "change_rejected",
        "marks_published",
      ],
      required: true,
    },
    previousMarks: [
      {
        schemeName: String,
        obtainedMarks: Number,
        maxMarks: Number,
      },
    ],
    newMarks: [
      {
        schemeName: String,
        obtainedMarks: Number,
        maxMarks: Number,
      },
    ],
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    performedByType: {
      type: String,
      enum: ["Faculty", "Examiner", "Admin"],
      required: true,
    },
    remark: String,
    changeRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarkChangeRequest",
    },
  },
  { timestamps: true }
);

markAuditLogSchema.index({ examResultId: 1, createdAt: -1 });

const MarkAuditLog = mongoose.model("MarkAuditLog", markAuditLogSchema);

export default MarkAuditLog;
