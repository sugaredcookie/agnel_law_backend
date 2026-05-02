import express from "express";
import {
  fetchAtktCatalog,
  submitAtktForm,
  createManualAtktForm,
  fetchAtktForms,
  getAtktStatus,
  toggleAtktStatus,
  getMyAtktForm,
  updateAtktForm,
  deleteAtktForm,
  getUniqueBatchNames,
  downloadHallTicket,
  bulkDownloadHallTickets,
  downloadAtktFormsExcel,
  startAtktBulkHallTicketGeneration,
  getAtktBulkHallTicketStatus,
  downloadAtktBulkHallTicketResult,
} from "../controllers/atktController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const router = express.Router();

router.get("/catalog", fetchAtktCatalog);
router.get("/batch-names", authMiddleware, getUniqueBatchNames);
router.get("/status", authMiddleware, getAtktStatus);
router.put("/status", authMiddleware, toggleAtktStatus);
router.get("/my-form", authMiddleware, getMyAtktForm);
router.post("/forms", authMiddleware, submitAtktForm);
router.post("/forms/manual", authMiddleware, createManualAtktForm);
router.get("/forms", authMiddleware, fetchAtktForms);
router.get("/forms/download-excel", authMiddleware, downloadAtktFormsExcel);
router.get(
  "/forms/bulk-download-hall-tickets",
  authMiddleware,
  bulkDownloadHallTickets,
);

// Job-based bulk hall ticket generation endpoints
router.get("/start-bulk-hall-ticket-generation", authMiddleware, startAtktBulkHallTicketGeneration);
router.get("/bulk-hall-ticket-status/:jobId", authMiddleware, getAtktBulkHallTicketStatus);
router.get("/bulk-download-result/:jobId", authMiddleware, downloadAtktBulkHallTicketResult);

router.get("/forms/:id/hall-ticket", authMiddleware, downloadHallTicket);
router.put("/forms/:id", authMiddleware, updateAtktForm);
router.delete("/forms/:id", authMiddleware, deleteAtktForm);

export default router;
