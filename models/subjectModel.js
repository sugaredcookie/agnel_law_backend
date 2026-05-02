import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema(
  {
    subjectName: { type: String },
    subjectCode: { type: String },
    description: String,
    isElective: { type: Boolean, default: false },
    rubricsMarking: { type: Boolean, default: false },
    credits: Number,
    passCriteria: String,
    markingScheme: [
      {
        name: String,
        value: Number,
        breakdown: [
          {
            name: String,
            value: Number,
          },
        ],
      },
    ],
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
    },
    uniqueId: String,
  },
  { timestamps: true },
);

const subjectModel = mongoose.model("Subject", subjectSchema);

export default subjectModel;
