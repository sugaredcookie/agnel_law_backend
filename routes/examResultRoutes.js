import express from "express";
import {
  getExamSessionsForMarks,
  getSessionStudentsForMarks,
  getSessionFilters,
  getSessionSubjects,
  getStudentsForSubjectMarks,
  saveStudentMarks,
  bulkSaveMarks,
  getSessionResults,
  getStudentResultHistory,
  getMyExamSessions,
  getMyPublishedResults,
  downloadSubjectMarksTemplate,
  parseUploadedMarks,
} from "../controllers/examResultController.js";
import authMiddleware, { requireRole } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// ─── Read routes — any authenticated user ─────────────────────

// Get all exam sessions available for marks entry
router.get("/sessions", authMiddleware, getExamSessionsForMarks);

// Get filters (batches, courses) for a session
router.get("/sessions/:sessionId/:sessionType/filters", authMiddleware, getSessionFilters);

// Get subjects for a session
router.get("/sessions/:sessionId/:sessionType/subjects", authMiddleware, getSessionSubjects);

// Get students enrolled in a session
router.get("/sessions/:sessionId/:sessionType/students", authMiddleware, getSessionStudentsForMarks);

// Get students for a specific subject in a session
router.get(
  "/sessions/:sessionId/:sessionType/subjects/:subjectId/students",
  authMiddleware,
  getStudentsForSubjectMarks
);

// Download marks template for a subject
router.get(
  "/sessions/:sessionId/:sessionType/subjects/:subjectId/template",
  authMiddleware,
  downloadSubjectMarksTemplate
);

// Parse uploaded marks Excel (preview changes)
router.post(
  "/sessions/:sessionId/:sessionType/subjects/:subjectId/parse-upload",
  authMiddleware,
  parseUploadedMarks
);

// Get all results for a session
router.get("/sessions/:sessionId/results", authMiddleware, getSessionResults);

// Get student's result history
router.get("/students/:studentId/history", authMiddleware, getStudentResultHistory);

// Student routes - get my enrolled exam sessions
router.get("/my-sessions", authMiddleware, getMyExamSessions);

// Student routes - get my published results for a session
router.get("/my-results/:sessionId", authMiddleware, getMyPublishedResults);

// ─── Write routes — faculty, examiner, or admin ──────────────

// Save marks for a single student
router.post("/marks", requireRole("faculty", "examiner", "admin"), saveStudentMarks);

// Bulk save marks for multiple students
router.post("/marks/bulk", requireRole("faculty", "examiner", "admin"), bulkSaveMarks);

export default router;
