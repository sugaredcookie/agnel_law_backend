import mongoose from "mongoose";

/**
 * ParsedResult Model
 * Stores per-config, per-student parsed result data (mirrors parser output).
 * Each document = one student's results for one ResultConfig.
 * Unique on (resultConfigId, rollNo) so upserts are safe.
 */

const SubjectResultSchema = new mongoose.Schema(
  {
    code: { type: Number },
    name: { type: String, trim: true },
    credit: { type: Number, default: 4 },
    internal: { type: mongoose.Schema.Types.Mixed },
    external: { type: mongoose.Schema.Types.Mixed },
    total: { type: Number, default: 0 },
    iDisplay: { type: mongoose.Schema.Types.Mixed },
    eDisplay: { type: mongoose.Schema.Types.Mixed },
    grade: { type: String },
    gp: { type: Number, default: 0 },
    earned: { type: Number, default: 0 },
    cg: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    isAbsent: { type: Boolean, default: false },
    internalAbsent: { type: Boolean, default: false },
    externalAbsent: { type: Boolean, default: false },
  },
  { _id: false }
);

const PracticalResultSchema = new mongoose.Schema(
  {
    code: { type: Number },
    name: { type: String, trim: true },
    type: { type: String, enum: ["single", "split"] },
    // single-type
    marks: { type: mongoose.Schema.Types.Mixed },
    display: { type: mongoose.Schema.Types.Mixed },
    // split-type
    internal: { type: mongoose.Schema.Types.Mixed },
    external: { type: mongoose.Schema.Types.Mixed },
    total: { type: Number, default: 0 },
    iDisplay: { type: mongoose.Schema.Types.Mixed },
    eDisplay: { type: mongoose.Schema.Types.Mixed },
    // shared
    grade: { type: String },
    gp: { type: Number, default: 0 },
    credit: { type: Number, default: 4 },
    earned: { type: Number, default: 0 },
    cg: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    // split limits (carried from config for PDF rendering)
    maxI: { type: Number },
    minI: { type: Number },
    maxE: { type: Number },
    minE: { type: Number },
  },
  { _id: false }
);

const ParsedResultSchema = new mongoose.Schema(
  {
    resultConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResultConfig",
      required: true,
      index: true,
    },
    rowNumber: { type: Number },
    seatNo: { type: mongoose.Schema.Types.Mixed },
    name: { type: String, trim: true },
    rollNo: { type: String, required: true, trim: true },
    grNo: { type: mongoose.Schema.Types.Mixed },
    prn: { type: mongoose.Schema.Types.Mixed },

    subjects: [SubjectResultSchema],
    practical: { type: PracticalResultSchema, default: null },

    totalMarksObt: { type: Number, default: 0 },
    maxMarks: { type: Number, default: 0 },
    totalCG: { type: Number, default: 0 },
    totalCredits: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    sgpa: { type: Number },
    finalGrade: { type: String, default: "F" },
    cgpa: { type: Number, default: 0 },
    remark: {
      type: String,
      enum: ["SUCCESSFUL", "UNSUCCESSFUL", "ABSENT", "RESULT RESTRICTED"],
    },
    allPassed: { type: Boolean, default: false },

    isPublished: { type: Boolean, default: false, index: true },
    isRestricted: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

ParsedResultSchema.index(
  { resultConfigId: 1, rollNo: 1 },
  { unique: true }
);

const ParsedResult = mongoose.model("ParsedResult", ParsedResultSchema);
export default ParsedResult;
