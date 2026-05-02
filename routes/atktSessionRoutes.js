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
  getAtktSubjectConfigsForLinking,
  linkAtktSubjectInConfig,
  bulkLinkAtktSubjectsInConfig,
} from "../controllers/atktExamSessionController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const router = express.Router();

router.post("/sessions", authMiddleware, createExamSession);
router.get("/sessions", authMiddleware, getAllExamSessions);
router.get("/sessions/active", getActiveExamSession);
router.get("/sessions/:id", authMiddleware, getExamSessionById);
router.put("/sessions/:id", authMiddleware, updateExamSession);
router.delete("/sessions/:id", authMiddleware, deleteExamSession);
router.put("/sessions/:id/activate", authMiddleware, activateExamSession);
router.put("/sessions/:id/deactivate", authMiddleware, deactivateExamSession);
router.put("/sessions/:id/close", authMiddleware, closeExamSession);

router.post("/subject-configs", authMiddleware, createSubjectConfig);
router.post("/subject-configs/bulk", authMiddleware, bulkCreateSubjectConfigs);
router.get("/subject-configs", authMiddleware, getSubjectConfigs);
router.get("/subject-configs/:id", authMiddleware, getSubjectConfigById);
router.put("/subject-configs/:id", authMiddleware, updateSubjectConfig);
router.delete("/subject-configs/:id", authMiddleware, deleteSubjectConfig);

// Subject linking routes for ATKT
router.get("/subject-configs-for-linking", authMiddleware, getAtktSubjectConfigsForLinking);
router.put("/subject-configs/:configId/link-subject/:examSubjectId", authMiddleware, linkAtktSubjectInConfig);
router.put("/subject-configs/:configId/bulk-link-subjects", authMiddleware, bulkLinkAtktSubjectsInConfig);

export default router;
