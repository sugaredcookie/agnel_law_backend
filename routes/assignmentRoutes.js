import express from "express";
import { upload } from "../middlewares/upload.js";
import {
  createAssignment,
  deleteAssignment,
  getAllAssignments,
  getBatchAssignments,
  getFacultyAssignments,
  getStudentAssignments,
  getSubjectAssignments,
  submitAssignment,
  getAssignmentSubmissions,
  getStudentSubmissionStatus,
  updateAssignment,
  deleteSubmission,
} from "../controllers/assignmentController.js";
import authMiddleware, {
  facultyAuthMiddleware,
  studentAuthMiddleware,
  adminAuthMiddleware,
} from "../middlewares/AuthMiddleware.js";

const assignmentRouter = express.Router();

// Admin only: get all assignments
assignmentRouter.get("/", adminAuthMiddleware, getAllAssignments);

// Faculty routes: protected with faculty auth
assignmentRouter.get("/faculty/:id", facultyAuthMiddleware, getFacultyAssignments);
// Route with batch for proper isolation (preferred)
assignmentRouter.get("/subject/:subjectId/:facultyId/:batchId", facultyAuthMiddleware, getSubjectAssignments);
// Legacy route without batch (will fetch all without batch filter)
assignmentRouter.get("/subject/:subjectId/:facultyId", facultyAuthMiddleware, getSubjectAssignments);
assignmentRouter.get("/submissions/:assignmentId", facultyAuthMiddleware, getAssignmentSubmissions);
assignmentRouter.post("/create", facultyAuthMiddleware, upload.single("file"), createAssignment);
assignmentRouter.put("/:id", facultyAuthMiddleware, updateAssignment);
assignmentRouter.delete("/:id", facultyAuthMiddleware, deleteAssignment);

// Delete submission - both faculty (assignment owner) and students (own submission) can delete
assignmentRouter.delete("/delete-submission/:assignmentId/:studentId", authMiddleware, deleteSubmission);

// Student routes: protected with student auth
assignmentRouter.get("/batchAssignments/:batchId", studentAuthMiddleware, getBatchAssignments);
assignmentRouter.post("/studentAssignments", studentAuthMiddleware, getStudentAssignments);
assignmentRouter.get("/submission-status/:assignmentId/:studentId", studentAuthMiddleware, getStudentSubmissionStatus);
assignmentRouter.post("/submit", studentAuthMiddleware, upload.single("file"), submitAssignment);

export default assignmentRouter;
