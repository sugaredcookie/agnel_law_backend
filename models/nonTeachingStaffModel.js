import mongoose from "mongoose";

const nonTeachingStaffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    designation: {
      type: String,
      required: [true, "Designation is required"],
    },
    salary: {
      type: Number,
      required: [true, "Salary is required"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
    },
    salaryDisbursementDate: {
      type: Number,
      required: [true, "Salary disbursement date is required"],
      min: [1, "Date must be between 1 and 31"],
      max: [31, "Date must be between 1 and 31"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    uniqueId: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);

const nonTeachingStaffModel = mongoose.model("NonTeachingStaff", nonTeachingStaffSchema);

export default nonTeachingStaffModel;