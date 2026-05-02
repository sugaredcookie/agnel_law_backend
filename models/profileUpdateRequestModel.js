import mongoose from "mongoose";

const profileUpdateRequestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    fieldPath: { type: String, required: true },
    fieldLabel: { type: String, required: true },
    fieldType: {
      type: String,
      enum: ["text", "date", "select", "file"],
      default: "text",
    },
    selectOptions: [String],
    validationRegex: String,
    placeholder: String,

    // Targeting
    targetType: {
      type: String,
      enum: ["all", "batch", "program", "individual"],
      required: true,
    },
    targetBatches: [{ type: mongoose.Schema.Types.ObjectId, ref: "Batch" }],
    targetProgram: String,
    targetStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],

    // Track completions
    completedBy: [
      {
        student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
        value: String,
        completedAt: { type: Date, default: Date.now },
      },
    ],

    deadline: Date,
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

profileUpdateRequestSchema.index({ isActive: 1 });
profileUpdateRequestSchema.index({ targetBatches: 1 });
profileUpdateRequestSchema.index({ "completedBy.student": 1 });

const ProfileUpdateRequest = mongoose.model(
  "ProfileUpdateRequest",
  profileUpdateRequestSchema,
);

export default ProfileUpdateRequest;
