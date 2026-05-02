import mongoose from "mongoose";

const electiveSessionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    batchGroup: { type: mongoose.Schema.Types.ObjectId, ref: "BatchGroup", required: true },
    status: {
      type: String,
      enum: ["draft", "open", "closed", "locked"],
      default: "draft",
    },
    openAt: Date,
    closeAt: Date,
    maxSelectionsPerStudent: Number,
    allowReselection: { type: Boolean, default: true },
    capacityPerSubject: { type: Number, default: 0 },
    lockedStudents: [{ type: mongoose.Schema.Types.ObjectId }],
    notifyOnOpen: { type: Boolean, default: false },
    notifyBeforeDeadline: { type: Boolean, default: false },
    deadlineReminderSent: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

electiveSessionSchema.index({ batchGroup: 1, status: 1 });
electiveSessionSchema.index({ status: 1, openAt: 1, closeAt: 1 });

export default mongoose.model("ElectiveSession", electiveSessionSchema);
