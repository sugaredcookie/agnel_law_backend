import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    departmentName: String,
    description: String,
    uniqueId: String,
  },
  { timestamps: true },
);

const departmentModel = mongoose.model("Department", departmentSchema);

export default departmentModel;
