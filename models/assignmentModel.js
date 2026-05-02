import mongoose from "mongoose";

const AssignmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    subject: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
        required: true,
      },
      name: { type: String, required: true },
    },
    batch: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
        required: true,
      },
      name: { type: String, required: true },
    },
    dueDate: {
      type: Date,
      required: true,
    },
    fileUrl: {
      type: String,
      default: "",
    },
    fileName: {
      type: String,
      default: "",
    },
    publicId: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["image", "pdf", "document", null],
      default: null,
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    submissions: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Student",
        },
        studentName: String,
        submissionUrl: String,
        fileName: String,
        publicId: String,
        fileType: String,
        submissionDate: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["pending", "submitted", "late"],
          default: "pending",
        },
        remarks: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient querying
AssignmentSchema.index({ "batch.id": 1, "subject.id": 1 });
AssignmentSchema.index({ faculty: 1, "subject.id": 1 });
AssignmentSchema.index({ "batch.id": 1, "subject.id": 1, faculty: 1 });

const Assignment = mongoose.model("Assignment", AssignmentSchema);

export default Assignment;
