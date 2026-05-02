import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  sequenceName: { type: String, required: true, unique: true },
  sequenceValue: { type: Number, required: true },
});

const counter = mongoose.model("counter", counterSchema);

export default counter;
