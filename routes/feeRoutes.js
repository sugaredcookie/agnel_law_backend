import express from "express";
import {
  createFeeStructure,
  getFeeStructure,
  getAllFeeStructures,
  getStudentFee,
  getAllStudentFees,
  getStudentApplicationFee,
  controlPaymentAcceptance,
  checkPaymentAllowed,
  updateFeeStructure,
} from "../controllers/FeeController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const feeRouter = express.Router();

feeRouter.post("/structure", authMiddleware, createFeeStructure);
feeRouter.put("/structure/:feeStructureId", authMiddleware, updateFeeStructure);
feeRouter.get(
  "/structure/:batchId/:academicYear",
  authMiddleware,
  getFeeStructure,
);
feeRouter.get("/structures", authMiddleware, getAllFeeStructures);

feeRouter.put(
  "/control/:feeStructureId",
  authMiddleware,
  controlPaymentAcceptance,
);
feeRouter.get(
  "/payment-allowed/:feeStructureId",
  authMiddleware,
  checkPaymentAllowed,
);

feeRouter.get("/student/all", authMiddleware, getAllStudentFees);
feeRouter.get("/student/application-fee", authMiddleware, getStudentApplicationFee);
feeRouter.get("/student/:academicYear", authMiddleware, getStudentFee);

export default feeRouter;
