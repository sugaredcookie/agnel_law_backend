import mongoose from "mongoose";

const linkSchema = new mongoose.Schema(
  {
    agentName: String,
    landingPage: String,
    purpose: String,
    uniqueId: String,
  },
  { timestamps: true },
);

const linkModel = mongoose.model("Link", linkSchema);

export default linkModel;
