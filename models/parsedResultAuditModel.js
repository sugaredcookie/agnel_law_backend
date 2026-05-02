import mongoose from "mongoose";

/**
 * Audit trail for ParsedResult edits.
 * Records every add/update/delete with before/after snapshots.
 */
const ParsedResultAuditSchema = new mongoose.Schema({
  resultConfigId: { type: mongoose.Schema.Types.ObjectId, ref: "ResultConfig", required: true, index: true },
  parsedResultId: { type: mongoose.Schema.Types.ObjectId, ref: "ParsedResult" },
  rollNo: { type: String, required: true },
  studentName: { type: String, default: "" },
  action: { type: String, enum: ["ADD", "UPDATE", "DELETE"], required: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  changes: [
    {
      field: { type: String },
      from: { type: mongoose.Schema.Types.Mixed },
      to: { type: mongoose.Schema.Types.Mixed },
      _id: false,
    },
  ],
  performedBy: {
    userId: { type: String },
    email: { type: String },
  },
  createdAt: { type: Date, default: Date.now, index: true },
});

ParsedResultAuditSchema.index({ resultConfigId: 1, createdAt: -1 });

const ParsedResultAudit = mongoose.model("ParsedResultAudit", ParsedResultAuditSchema);
export default ParsedResultAudit;
