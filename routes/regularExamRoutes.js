import express from "express";
import {
  createExamSession,
  getAllExamSessions,
  getExamSessionById,
  updateExamSession,
  deleteExamSession,
  activateExamSession,
  deactivateExamSession,
  closeExamSession,
  getActiveExamSession,
  createSubjectConfig,
  getSubjectConfigs,
  getSubjectConfigById,
  updateSubjectConfig,
  deleteSubjectConfig,
  bulkCreateSubjectConfigs,
  autoEnrollStudents,
  removeInactiveEnrollments,
  refreshEnrollmentSubjects,
  startSyncEnrollments,
  getSyncEnrollmentsStatus,
  getAllEnrollments,
  getEnrollmentById,
  getMyEnrollment,
  getUniqueBatchNames,
  getAvailableBatches,
  downloadHallTicket,
  bulkDownloadHallTickets,
  downloadEnrollmentsExcel,
  startBulkHallTicketGeneration,
  getBulkHallTicketStatus,
  downloadBulkHallTicketResult,
  getSubjectsForLinking,
  getSubjectConfigsForLinking,
  linkSubjectInConfig,
  bulkLinkSubjectsInConfig,
} from "../controllers/regularExamSessionController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// ==================== SESSION ROUTES ====================
router.post("/sessions", authMiddleware, createExamSession);
router.get("/sessions", authMiddleware, getAllExamSessions);
router.get("/sessions/active", getActiveExamSession);
router.get("/sessions/:id", authMiddleware, getExamSessionById);
router.put("/sessions/:id", authMiddleware, updateExamSession);
router.delete("/sessions/:id", authMiddleware, deleteExamSession);
router.put("/sessions/:id/activate", authMiddleware, activateExamSession);
router.put("/sessions/:id/deactivate", authMiddleware, deactivateExamSession);
router.put("/sessions/:id/close", authMiddleware, closeExamSession);

// ==================== SUBJECT CONFIG ROUTES ====================
router.post("/subject-configs", authMiddleware, createSubjectConfig);
router.post("/subject-configs/bulk", authMiddleware, bulkCreateSubjectConfigs);
router.get("/subject-configs", authMiddleware, getSubjectConfigs);
router.get("/subject-configs/:id", authMiddleware, getSubjectConfigById);
router.put("/subject-configs/:id", authMiddleware, updateSubjectConfig);
router.delete("/subject-configs/:id", authMiddleware, deleteSubjectConfig);

// ==================== SUBJECT LINKING ROUTES ====================
router.get("/subjects-for-linking", authMiddleware, getSubjectsForLinking);
router.get("/subject-configs-for-linking", authMiddleware, getSubjectConfigsForLinking);
router.put("/subject-configs/:configId/link-subject/:examSubjectId", authMiddleware, linkSubjectInConfig);
router.put("/subject-configs/:configId/bulk-link-subjects", authMiddleware, bulkLinkSubjectsInConfig);

// ==================== ENROLLMENT ROUTES ====================
router.post("/sessions/:sessionId/auto-enroll", authMiddleware, autoEnrollStudents);
router.delete("/sessions/:sessionId/remove-inactive", authMiddleware, removeInactiveEnrollments);
router.put("/sessions/:sessionId/refresh-subjects", authMiddleware, refreshEnrollmentSubjects);
router.post("/sessions/:sessionId/sync-enrollments", authMiddleware, startSyncEnrollments);
router.get("/sync-enrollments/status/:jobId", authMiddleware, getSyncEnrollmentsStatus);
router.get("/enrollments", authMiddleware, getAllEnrollments);
router.get("/enrollments/download-excel", authMiddleware, downloadEnrollmentsExcel);
router.get("/enrollments/my-enrollment", authMiddleware, getMyEnrollment);
router.get("/enrollments/batch-names", authMiddleware, getUniqueBatchNames);
router.get("/enrollments/bulk-download-hall-tickets", authMiddleware, bulkDownloadHallTickets);
router.get("/enrollments/bulk-download-hall-tickets/start", authMiddleware, startBulkHallTicketGeneration);
router.get("/enrollments/bulk-download-status/:jobId", authMiddleware, getBulkHallTicketStatus);
router.get("/enrollments/bulk-download-result/:jobId", authMiddleware, downloadBulkHallTicketResult);
router.get("/enrollments/:id/hall-ticket", authMiddleware, downloadHallTicket);
router.get("/enrollments/:id", authMiddleware, getEnrollmentById);

// Get available batches from student database
router.get("/batches/available", authMiddleware, getAvailableBatches);

export default router;
