import mongoose from "mongoose";

/**
 * ResultConfig Model
 * DB-driven replacement for the hardcoded resultExamConfigs.js registry.
 * Each document maps ONE exam (programme + semester + session + type)
 * to either an Excel file (legacy) or an ExamResult DB query (new pipeline).
 */

const SubjectColumnSchema = new mongoose.Schema(
  {
    code: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    credit: { type: Number, required: true, default: 4 },
    iCol: { type: Number },
    eCol: { type: Number },
    tCol: { type: Number },
    gpCol: { type: Number },
    elective: { type: Boolean, default: false },
  },
  { _id: false }
);

const PracticalDefSchema = new mongoose.Schema(
  {
    code: { type: Number },
    name: { type: String, trim: true },
    type: { type: String, enum: ["single", "split"], default: "single" },
    // single-type fields
    col: { type: Number },
    // split-type fields
    iCol: { type: Number },
    eCol: { type: Number },
    tCol: { type: Number },
    maxI: { type: Number },
    minI: { type: Number },
    maxE: { type: Number },
    minE: { type: Number },
    // shared
    max: { type: Number },
    min: { type: Number },
    credit: { type: Number, default: 4 },
  },
  { _id: false }
);

const LimitsSchema = new mongoose.Schema(
  {
    maxI: { type: Number, default: 25 },
    minI: { type: Number, default: 10 },
    maxE: { type: Number, default: 75 },
    minE: { type: Number, default: 30 },
    maxT: { type: Number, default: 100 },
    minT: { type: Number, default: 40 },
  },
  { _id: false }
);

const ColumnsSchema = new mongoose.Schema(
  {
    studentId: { type: Number, default: null },
    name: { type: Number, default: null },
    rollNo: { type: Number, default: null },
    grNo: { type: Number, default: null },
    grandTotal: { type: Number, default: null },
    remarks: { type: Number, default: null },
    prn: { type: Number, default: null },
  },
  { _id: false }
);

const ResultConfigSchema = new mongoose.Schema(
  {
    // Unique slug for backward-compatible token lookup
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    label: {
      type: String,
      required: true,
      trim: true,
    },
    programme: {
      type: String,
      required: true,
      trim: true,
    },
    // Degree-level grouping key (same across all years/semesters of one degree)
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    semester: {
      type: String,
      required: true,
      trim: true,
    },
    semesterNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    totalSemesters: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    examType: {
      type: String,
      enum: ["regular", "atkt", "reval"],
      required: true,
    },

    // Session metadata
    year: { type: String, trim: true },
    examMonth: { type: String, trim: true },
    resultDeclaredOn: { type: String, default: "" },
    resultAmendedOn: { type: String, default: "" },
    place: { type: String, default: "" },

    // ─── Data Source ──────────────────────────────────────────────
    dataSource: {
      type: String,
      enum: ["excel", "exam-session", "manual", "db"],
      required: true,
      default: "excel",
    },

    // Excel source fields (used when dataSource = "excel")
    excelFormat: {
      type: String,
      enum: ["legacy", "standard"],
      default: "legacy",
    },
    excelFile: { type: String, trim: true },
    sheetIndex: { type: mongoose.Schema.Types.Mixed, default: 0 },
    dataStartRow: { type: Number },
    columns: { type: ColumnsSchema },
    subjects: [SubjectColumnSchema],
    limits: { type: LimitsSchema },
    practical: { type: PracticalDefSchema, default: null },
    remarkMap: { type: Map, of: String, default: null },

    // Exam session source fields (used when dataSource = "exam-session")
    examSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "examSessionType",
    },
    examSessionType: {
      type: String,
      enum: ["RegularExamSession", "ATKTExamSession", "RevalSession"],
    },
    // Sync helper fields (persisted so edit modal can restore selections)
    syncBatch: { type: String, trim: true, default: "" },
    practicalSubjectId: { type: String, trim: true, default: "" },
    practicalType: { type: String, enum: ["single", "split"], default: "single" },

    // Lifecycle
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft",
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ResultConfigSchema.index({ programId: 1, semesterNumber: 1, examType: 1, year: 1 });

const ResultConfig = mongoose.model("ResultConfig", ResultConfigSchema);
export default ResultConfig;
