import mongoose from "mongoose";

const programSchema = new mongoose.Schema(
  {
    programName: { type: String, unique: true },
    description: String,
    intakeCapacity: Number,

    uniqueId: String,
    currentStudents: {
      type: Number,
      default: 0,
      min: 0,
    },
    applicationFee: {
      type: Number,
      default: 0,
    },
    developmentFee: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

const programModel = mongoose.model("Program", programSchema);

export default programModel;
