import mongoose from "mongoose";

const landingPageSchema = new mongoose.Schema(
  {
    stuName: {
      type: String,
      required: true,
    },
    stuPhone: {
      type: String,
      required: true,
    },
    stuEmail: {
      type: String,
      required: true,
    },
    compExam: {
      type: String,
    },
    compScore: {
      type: String,
    },
    uniqueId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

const landingModel = mongoose.model("Landing", landingPageSchema);

export default landingModel;
