import express from "express";
import {
  createRevalSession,
  getAllRevalSessions,
  getRevalSessionById,
  updateRevalSession,
  deleteRevalSession,
  activateRevalSession,
  deactivateRevalSession,
  closeRevalSession,
  createRevalSubjectConfig,
  getRevalSubjectConfigs,
  updateRevalSubjectConfig,
  deleteRevalSubjectConfig,
  bulkCreateRevalSubjectConfigs,
  fetchRevalApplications,
  fetchBatchGroupsWithSubjects,
  downloadRevalApplicationsExcel,
} from "../controllers/revalController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// Session management (examiner)
router.post("/sessions", authMiddleware, createRevalSession);
router.get("/sessions", authMiddleware, getAllRevalSessions);
router.get("/sessions/:id", authMiddleware, getRevalSessionById);
router.put("/sessions/:id", authMiddleware, updateRevalSession);
router.delete("/sessions/:id", authMiddleware, deleteRevalSession);
router.put("/sessions/:id/activate", authMiddleware, activateRevalSession);
router.put("/sessions/:id/deactivate", authMiddleware, deactivateRevalSession);
router.put("/sessions/:id/close", authMiddleware, closeRevalSession);

// Subject config management (examiner)
router.post("/subject-configs", authMiddleware, createRevalSubjectConfig);
router.post("/subject-configs/bulk", authMiddleware, bulkCreateRevalSubjectConfigs);
router.get("/subject-configs", authMiddleware, getRevalSubjectConfigs);
router.put("/subject-configs/:id", authMiddleware, updateRevalSubjectConfig);
router.delete("/subject-configs/:id", authMiddleware, deleteRevalSubjectConfig);

// View applications (examiner)
router.get("/applications", authMiddleware, fetchRevalApplications);
router.get("/applications/download-excel", authMiddleware, downloadRevalApplicationsExcel);

// Fetch batch groups with subjects (for subject config)
router.get("/batch-groups-with-subjects", authMiddleware, fetchBatchGroupsWithSubjects);

export default router;
