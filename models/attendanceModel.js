import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
  batch: {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
    },
    batchName: String,
    term: Number,
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subject",
  },
  date: Date,
  attendance: [
    {
      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
      status: {
        type: String,
        enum: ["present", "absent", "OD"],
      },
    },
  ],
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
