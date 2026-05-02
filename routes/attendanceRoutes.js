import express from "express";
import {
  fetchAttendanceOfABatch,
  markAttendance,
  uploadStudentAttendance,
  getAllStudentAttendance,
  clearAllStudentAttendance,
} from "../controllers/AttendanceController.js";

const attendanceRouter = express.Router();

attendanceRouter.post("/mark-attendance", markAttendance);
attendanceRouter.get("/fetch-attendance", fetchAttendanceOfABatch);

attendanceRouter.post("/student/upload", uploadStudentAttendance);
attendanceRouter.get("/student/all", getAllStudentAttendance);
attendanceRouter.delete("/student/clear", clearAllStudentAttendance);

export default attendanceRouter;
