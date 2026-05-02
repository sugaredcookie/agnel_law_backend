import mongoose from "mongoose";

const NoteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    batch: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
        required: true,
      },
      name: { type: String, required: true },
    },
    subject: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
        required: true,
      },
      name: { type: String, required: true },
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },
    resourceType: {
      type: String,
      default: "raw",
    },
    type: {
      type: String,
      enum: ["image", "pdf", "document", null],
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const Note = mongoose.model("Note", NoteSchema);

export default Note;
