import mongoose from "mongoose";

const batchSchema = new mongoose.Schema(
  {
    batchName: String,
    description: String,
    program: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Program",
      },
      name: String,
    },
    department: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
      },
      name: String,
    },
    term: Number,
    uniqueId: {
      type: String,
      unique: true,
    },
    subjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
      },
    ],
    timetable: {
      type: Map,
      of: new mongoose.Schema({
        subjectName: String,
        subjectCode: String,
        faculty: String,
        from: String,
        to: String,
      }),
    },
    marksVisible: {
      type: Boolean,
      default: false,
    },
    maxElectives: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

const batchModel = mongoose.model("Batch", batchSchema);

export default batchModel;
