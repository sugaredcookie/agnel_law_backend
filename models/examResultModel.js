import mongoose from "mongoose";

/**
 * ExamResult Model
 * Stores marks for each student-subject combination per exam session
 * Supports both Regular and ATKT exam types with attempt tracking
 */
const MarkEntrySchema = new mongoose.Schema(
  {
    schemeName: {
      type: String,
      required: true,
      trim: true,
    },
    obtainedMarks: {
      type: Number,
      required: true,
      min: 0,
    },
    maxMarks: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const ExamResultSchema = new mongoose.Schema(
  {
    // Core identifiers
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },

    // Exam session reference (one of these will be set)
    examSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "examSessionType",
      required: true,
      index: true,
    },
    examSessionType: {
      type: String,
      enum: ["RegularExamSession", "ATKTExamSession"],
      required: true,
    },

    // Exam type for quick filtering
    examType: {
      type: String,
      enum: ["regular", "atkt"],
      required: true,
      index: true,
    },

    // For ATKT - track which attempt this is
    attemptNumber: {
      type: Number,
      default: 1,
      min: 1,
    },

    // Academic context
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
    term: {
      type: String,
      enum: ["Term 1", "Term 2", "Annual"],
      required: true,
    },

    // Student context at time of exam (denormalized for historical accuracy)
    studentSnapshot: {
      rollNumber: String,
      name: String,
      batch: String,
      course: String,
      pattern: String,
    },

    // Marks data
    marks: {
      type: [MarkEntrySchema],
      validate: {
        validator: (marks) => Array.isArray(marks) && marks.length > 0,
        message: "At least one mark entry is required",
      },
    },

    // Calculated fields
    totalObtained: {
      type: Number,
      default: 0,
    },
    totalMaximum: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },

    // Internal vs External breakdown
    internalObtained: {
      type: Number,
      default: 0,
    },
    internalMaximum: {
      type: Number,
      default: 0,
    },
    externalObtained: {
      type: Number,
      default: 0,
    },
    externalMaximum: {
      type: Number,
      default: 0,
    },

    // Result
    grade: {
      type: String,
      trim: true,
    },
    gradePoint: {
      type: Number,
    },
    result: {
      type: String,
      enum: ["pass", "fail", "absent", "withheld", "pending"],
      default: "pending",
      index: true,
    },

    // Grace marks applied
    graceMarks: {
      type: Number,
      default: 0,
    },
    graceAppliedTo: {
      type: String,
      trim: true,
    },

    // Status tracking
    status: {
      type: String,
      enum: ["draft", "submitted", "verified", "published"],
      default: "draft",
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: {
      type: Date,
    },
    isRestricted: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Audit trail
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "enteredByType",
    },
    enteredByType: {
      type: String,
      enum: ["User", "Faculty", "Examiner"],
      default: "User",
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    verifiedAt: {
      type: Date,
    },

    // Remarks
    remarks: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
ExamResultSchema.index({ examSessionId: 1, studentId: 1, subjectId: 1 }, { unique: true });
ExamResultSchema.index({ examSessionId: 1, examType: 1 });
ExamResultSchema.index({ studentId: 1, examType: 1, academicYear: 1 });
ExamResultSchema.index({ subjectId: 1, examSessionId: 1 });
ExamResultSchema.index({ "studentSnapshot.batch": 1, examSessionId: 1 });

// Pre-save hook to calculate totals, grace marks, and pass/fail
ExamResultSchema.pre("save", function (next) {
  if (this.marks && this.marks.length > 0) {
    let internalObtained = 0;
    let internalMax = 0;
    let externalObtained = 0;
    let externalMax = 0;

    this.marks.forEach((mark) => {
      if (mark.schemeName.toLowerCase() === "external") {
        externalObtained += mark.obtainedMarks || 0;
        externalMax += mark.maxMarks || 0;
      } else {
        internalObtained += mark.obtainedMarks || 0;
        internalMax += mark.maxMarks || 0;
      }
    });

    this.internalObtained = internalObtained;
    this.internalMaximum = internalMax;
    this.externalObtained = externalObtained;
    this.externalMaximum = externalMax;
    this.totalObtained = internalObtained + externalObtained;
    this.totalMaximum = internalMax + externalMax;
    this.percentage =
      this.totalMaximum > 0
        ? Math.round((this.totalObtained / this.totalMaximum) * 10000) / 100
        : 0;

    // Grace marks: if external is within 2 marks of 30, bridge the gap
    const MIN_EXTERNAL_PASS = 30;
    const GRACE_LIMIT = 2;
    let graceMarks = 0;
    let graceAppliedTo = "";

    if (
      externalObtained < MIN_EXTERNAL_PASS &&
      externalObtained >= MIN_EXTERNAL_PASS - GRACE_LIMIT &&
      internalObtained >= 10
    ) {
      graceMarks = MIN_EXTERNAL_PASS - externalObtained;
      graceAppliedTo = "External";
    }

    this.graceMarks = graceMarks;
    this.graceAppliedTo = graceAppliedTo;

    // Pass/fail evaluation using effective marks (with grace)
    const effectiveExternal = externalObtained + graceMarks;
    const effectiveTotal = this.totalObtained + graceMarks;

    if (effectiveExternal < 30 || internalObtained < 10 || effectiveTotal < 40) {
      this.result = "fail";
    } else {
      this.result = "pass";
    }
  }
  next();
});

// Static method to get or create result
ExamResultSchema.statics.findOrCreate = async function (query, defaults) {
  let result = await this.findOne(query);
  if (!result) {
    result = new this({ ...query, ...defaults });
  }
  return result;
};

// Instance method to check pass/fail based on criteria
ExamResultSchema.methods.evaluateResult = function (passingCriteria = { internalMin: 40, externalMin: 40 }) {
  const internalPercentage =
    this.internalMaximum > 0
      ? (this.internalObtained / this.internalMaximum) * 100
      : 100;
  const externalPercentage =
    this.externalMaximum > 0
      ? (this.externalObtained / this.externalMaximum) * 100
      : 100;

  if (internalPercentage >= passingCriteria.internalMin && externalPercentage >= passingCriteria.externalMin) {
    this.result = "pass";
  } else {
    this.result = "fail";
  }

  return this.result;
};

const ExamResult = mongoose.model("ExamResult", ExamResultSchema);

export default ExamResult;
