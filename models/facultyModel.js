import mongoose from "mongoose";

const facultySchema = new mongoose.Schema(
  {
    facultyName: String,
    department: String,
    email: String,
    phone: String,
    uniqueId: String,
    password: String,
    dateOfBirth: {
      type: Date,
      required: [true, "Date of birth is required"],
    },
  },
  { timestamps: true },
);

const facultyModel = mongoose.model("Faculty", facultySchema);

export default facultyModel;
