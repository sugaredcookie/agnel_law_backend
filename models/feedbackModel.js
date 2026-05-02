import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    feedbackType: {
      type: String,
      required: true,
    },
    questions: {
      type: [String],
    },
  },
  { timestamps: true },
);

const feedbackModel = mongoose.model("Feedback", feedbackSchema);

export default feedbackModel;
