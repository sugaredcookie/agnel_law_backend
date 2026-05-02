import express from "express";
import {
  getExamConfigs,
  getResultPdf,
  getResultData,
  verifyResult,
  listStudents,
  downloadLinksExcel,
  startBulkGeneration,
  getBulkStatus,
  downloadBulkResult,
} from "../controllers/multiResultController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// Public
router.get("/configs", getExamConfigs);
router.get("/pdf/:token", getResultPdf);
router.get("/data/:token", getResultData);
router.get("/verify/:token", verifyResult);

// Admin
router.get("/:configId/list", authMiddleware, listStudents);
router.get("/:configId/download-links", authMiddleware, downloadLinksExcel);
router.get("/:configId/bulk-download/start", authMiddleware, startBulkGeneration);

// Admin — job status / download (no configId needed)
router.get("/bulk-download-status/:jobId", authMiddleware, getBulkStatus);
router.get("/bulk-download-result/:jobId", authMiddleware, downloadBulkResult);

export default router;
