import express from "express";
import {
  fetchRevalCatalog,
  submitRevalApplication,
  getMyRevalApplications,
} from "../controllers/revalController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// Public: get active session catalog
router.get("/catalog", fetchRevalCatalog);

// Student: submit application (creates Razorpay order)
router.post("/apply", authMiddleware, submitRevalApplication);

// Student: view own applications
router.get("/my-applications", authMiddleware, getMyRevalApplications);

export default router;
