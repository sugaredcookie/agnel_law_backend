import mongoose from "mongoose";

// BatchGroup Model - Groups multiple batches together for organizational purposes
// Example: "FY-LLA" group containing "FY-LLA-A" and "FY-LLA-B" batches
const batchGroupSchema = new mongoose.Schema(
  {
    groupName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    batches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
      },
    ],
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
  },
  { timestamps: true }
);

const batchGroupModel = mongoose.model("BatchGroup", batchGroupSchema);

export default batchGroupModel;
