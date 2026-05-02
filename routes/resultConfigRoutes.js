import express from "express";
import {
  listConfigs,
  createConfig,
  updateConfig,
  archiveConfig,
  getConfig,
  uploadExcel,
  deleteExcelData,
  syncFromSession,
  exportExcel,
  compareRolls,
  downloadTemplate,
  getParsedResults,
  updateParsedResult,
  addParsedResult,
  deleteParsedResult,
  lookupStudent,
  getAuditLog,
  revertAudit,
  getPublishStatus,
  publishResults,
  unpublishResults,
  toggleRestricted,
} from "../controllers/resultConfigController.js";
import authMiddleware, { requireRole } from "../middlewares/AuthMiddleware.js";
import { upload } from "../middlewares/Multer.js";

const router = express.Router();

const examinerOrAdmin = requireRole("examiner", "admin");

// ─── Read routes — any authenticated user ─────────────────────
router.post("/download-template", authMiddleware, downloadTemplate);
router.post("/compare-rolls", authMiddleware, compareRolls);
router.get("/lookup-student", authMiddleware, lookupStudent);
router.get("/", authMiddleware, listConfigs);
router.get("/:id", authMiddleware, getConfig);
router.get("/:id/export-excel", authMiddleware, exportExcel);
router.get("/:id/publish-status", authMiddleware, getPublishStatus);
router.get("/:id/parsed-results", authMiddleware, getParsedResults);
router.get("/:id/audit", authMiddleware, getAuditLog);

// ─── Write routes — examiner or admin ─────────────────────────
router.post("/", examinerOrAdmin, createConfig);
router.put("/:id", examinerOrAdmin, updateConfig);
router.delete("/:id", examinerOrAdmin, archiveConfig);
router.post("/:id/upload-excel", examinerOrAdmin, upload.single("file"), uploadExcel);
router.post("/:id/sync-from-session", examinerOrAdmin, syncFromSession);
router.delete("/:id/excel-data", examinerOrAdmin, deleteExcelData);

// Publish/Unpublish
router.post("/:id/publish", examinerOrAdmin, publishResults);
router.post("/:id/unpublish", examinerOrAdmin, unpublishResults);
router.patch("/:id/toggle-restricted", examinerOrAdmin, toggleRestricted);

// Parsed-result CRUD (Table View)
router.post("/:id/parsed-results", examinerOrAdmin, addParsedResult);
router.patch("/:id/parsed-results/:resultId", examinerOrAdmin, updateParsedResult);
router.delete("/:id/parsed-results/:resultId", examinerOrAdmin, deleteParsedResult);

// Audit revert
router.post("/:id/audit/:auditId/revert", examinerOrAdmin, revertAudit);

export default router;
