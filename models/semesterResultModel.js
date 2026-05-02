import mongoose from "mongoose";

/**
 * SemesterResult Model
 * Stores per-student, per-semester summary data (credits, SGPA, subjects).
 * Used to compute cumulative CGPA across semesters on result cards.
 * Upsert semantics: (rollNo + programme + semesterNumber) is unique --
 * latest exam (regular or ATKT) overwrites the previous record.
 */

const SubjectSummarySchema = new mongoose.Schema(
  {
    code: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    credit: { type: Number, required: true },
    internal: { type: Number, default: 0 },
    external: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    grade: { type: String, default: "F" },
    gp: { type: Number, default: 0 },
    earned: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
  },
  { _id: false }
);

const PracticalSummarySchema = new mongoose.Schema(
  {
    code: { type: Number },
    name: { type: String, trim: true },
    credit: { type: Number },
    total: { type: Number, default: 0 },
    grade: { type: String, default: "F" },
    gp: { type: Number, default: 0 },
    earned: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
  },
  { _id: false }
);

const SemesterResultSchema = new mongoose.Schema(
  {
    rollNo: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    programme: {
      type: String,
      required: true,
      trim: true,
    },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    semesterNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },

    // Aggregated semester totals
    totalCredits: { type: Number, default: 0 },
    earnedCredits: { type: Number, default: 0 },
    totalCG: { type: Number, default: 0 },
    sgpa: { type: Number, default: 0 },
    finalGrade: { type: String, default: "F" },
    remark: { type: String, default: "" },

    // Per-subject breakdown
    subjects: [SubjectSummarySchema],
    practical: { type: PracticalSummarySchema, default: null },

    // Source tracking
    resultConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResultConfig",
    },
    examType: {
      type: String,
      enum: ["regular", "atkt", "reval"],
      default: "regular",
    },
    academicYear: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Latest exam for a student+programme+semester overwrites
SemesterResultSchema.index(
  { rollNo: 1, programId: 1, semesterNumber: 1 },
  { unique: true }
);

const SemesterResult = mongoose.model("SemesterResult", SemesterResultSchema);
export default SemesterResult;
