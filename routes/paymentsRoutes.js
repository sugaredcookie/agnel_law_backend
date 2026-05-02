import express from "express";
import {
  captureRazorPayPayment,
  createCheckoutRazorpay,
  createStudentFeeCheckout,
  createApplicationFeeCheckoutStudent,
  getPaymentStatus,
  getStudentFeePaymentStatus,
  getRazorPayKey,
  verifyHostedPayment,
  getRazorPayACCKeyStudent,
  handleWebhook,
  getInstallmentOptions,
  getPaymentTypes,
} from "../controllers/PaymentController.js";
import {
  getAllInstallmentSettings,
  getInstallmentSettingsById,
  createInstallmentSettings,
  updateInstallmentSettings,
  deleteInstallmentSettings,
  toggleInstallmentSettings,
} from "../controllers/InstallmentSettingsController.js";
import { facultyAuthMiddleware } from "../middlewares/AuthMiddleware.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const paymentRouter = express.Router();

paymentRouter.get("/payment-types", getPaymentTypes);
paymentRouter.post("/get-key", authMiddleware, getRazorPayKey);
paymentRouter.get("/get-key-student", authMiddleware, getRazorPayACCKeyStudent);
paymentRouter.post("/verify-hosted-payment", verifyHostedPayment);
paymentRouter.post("/webhook", handleWebhook);

paymentRouter.post("/create-checkout", authMiddleware, createCheckoutRazorpay);
paymentRouter.post("/capture-payment", authMiddleware, captureRazorPayPayment);
paymentRouter.get(
  "/status/:paymentType/:referenceId",
  authMiddleware,
  getPaymentStatus,
);
paymentRouter.get("/status/:referenceId", authMiddleware, (req, res) => {
  req.params.paymentType = "application";
  return getPaymentStatus(req, res);
});

paymentRouter.post(
  "/student-fee/create-checkout",
  authMiddleware,
  createStudentFeeCheckout,
);
paymentRouter.post(
  "/student/application-fee/create-checkout",
  authMiddleware,
  createApplicationFeeCheckoutStudent,
);
paymentRouter.get(
  "/student-fee/status/:feeStructureId/:academicYear",
  authMiddleware,
  getStudentFeePaymentStatus,
);

paymentRouter.get(
  "/installment-options/:programId/:paymentType?",
  getInstallmentOptions,
);

paymentRouter.get(
  "/get-all-installment-settings",
  facultyAuthMiddleware,
  getAllInstallmentSettings,
);
paymentRouter.get(
  "/get-installment-setting/:id",
  facultyAuthMiddleware,
  getInstallmentSettingsById,
);
paymentRouter.post(
  "/create-installment-setting",
  facultyAuthMiddleware,
  createInstallmentSettings,
);
paymentRouter.put(
  "/update-installment-setting/:id",
  facultyAuthMiddleware,
  updateInstallmentSettings,
);
paymentRouter.patch(
  "/toggle-installment-setting/:id",
  facultyAuthMiddleware,
  toggleInstallmentSettings,
);
paymentRouter.delete(
  "/delete-installment-setting/:id",
  facultyAuthMiddleware,
  deleteInstallmentSettings,
);

export default paymentRouter;
