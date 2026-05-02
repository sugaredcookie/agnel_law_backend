import Attendance from "../models/attendanceModel.js";
import StudentAttendance from "../models/StudentAttendance.js";

export const markAttendance = async (req, res) => {
  const { batch, subjectId, date, attendance } = req.body;
  try {
    const attendanceRecord = new Attendance({
      batch,
      subjectId,
      date,
      attendance,
    });
    await attendanceRecord.save();
    res.status(201).json({ attendanceRecord });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const fetchAttendanceOfABatch = async (req, res) => {
  const { batchId, date, subjectId } = req.query;
  try {
    const attendance = await Attendance.find({
      "batch.batchId": batchId,
      date,
      subjectId,
    });
    console.log("Attendance: ", attendance);
    res.json({ attendance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const uploadStudentAttendance = async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records))
      return res.status(400).json({ error: "Invalid data" });

    for (const record of records) {
      await StudentAttendance.updateOne(
        { rollNo: record.rollNo },
        { $set: record },
        { upsert: true },
      );
    }

    res.status(201).json({ message: "Attendance uploaded successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getAllStudentAttendance = async (req, res) => {
  try {
    const data = await StudentAttendance.find({});
    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const clearAllStudentAttendance = async (req, res) => {
  try {
    await StudentAttendance.deleteMany({});
    res.status(200).json({ message: "All student attendance cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
