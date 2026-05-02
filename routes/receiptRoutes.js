import express from "express";
import {
  getStudentReceipts,
  getReceiptById,
  getAllAtktPayments,
  getAtktReceipt,
  getAllReceipts,
  downloadReceiptsExcel,
  getPendingPayments,
  downloadPendingPaymentsExcel,
  getUnifiedReceipts,
  getReceiptByIdUnified,
  downloadReceiptPDF,
  downloadAllReceiptsPDF,
  downloadUnifiedReceiptsExcel,
  recordManualPayment,
  reverseManualPayment,
  getStudentFeeDetails,
  getManualPayments,
} from "../controllers/ReceiptController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const receiptRouter = express.Router();

// Manual Payment Routes
receiptRouter.post("/manual-payment", authMiddleware, recordManualPayment);
receiptRouter.post("/manual-payment/:paymentId/reverse", authMiddleware, reverseManualPayment);
receiptRouter.get("/manual-payments", authMiddleware, getManualPayments);
receiptRouter.get("/student-fee-details/:studentId", authMiddleware, getStudentFeeDetails);

receiptRouter.get("/unified", authMiddleware, getUnifiedReceipts);
receiptRouter.get(
  "/unified/download-excel",
  authMiddleware,
  downloadUnifiedReceiptsExcel,
);
receiptRouter.get("/unified/:receiptId", authMiddleware, getReceiptByIdUnified);
receiptRouter.get(
  "/unified/:receiptId/download",
  authMiddleware,
  downloadReceiptPDF,
);
receiptRouter.post(
  "/unified/download-bulk",
  authMiddleware,
  downloadAllReceiptsPDF,
);

receiptRouter.get("/student", authMiddleware, getStudentReceipts);
receiptRouter.get("/all", authMiddleware, getAllReceipts);
receiptRouter.get("/download-receipts", authMiddleware, downloadReceiptsExcel);
receiptRouter.get("/pending-payments", authMiddleware, getPendingPayments);
receiptRouter.get(
  "/download-pending-payments",
  authMiddleware,
  downloadPendingPaymentsExcel,
);
receiptRouter.get("/atkt/payments", authMiddleware, getAllAtktPayments);
receiptRouter.get("/atkt/receipt/:atktFormId", authMiddleware, getAtktReceipt);
receiptRouter.get("/:receiptId", authMiddleware, getReceiptById);

export default receiptRouter;
