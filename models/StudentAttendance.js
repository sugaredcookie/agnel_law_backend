import mongoose from "mongoose";

const studentAttendanceSchema = new mongoose.Schema({
  rollNo: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  program: { type: String },
  batch: { type: String },
  attendance: { type: Number, required: true },
});

const StudentAttendance = mongoose.model(
  "StudentAttendance",
  studentAttendanceSchema,
);

export default StudentAttendance;
