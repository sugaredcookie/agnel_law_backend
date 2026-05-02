import express from "express";
import {
  createChangeRequest,
  getMyChangeRequests,
  getPendingRequests,
  reviewChangeRequest,
} from "../controllers/markChangeRequestController.js";
import {
  facultyAuthMiddleware,
  examinerAuthMiddleware,
} from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// Faculty routes
router.post("/", facultyAuthMiddleware, createChangeRequest);
router.get("/my-requests", facultyAuthMiddleware, getMyChangeRequests);

// Examiner/Admin routes
router.get("/pending", examinerAuthMiddleware, getPendingRequests);
router.patch("/:id/review", examinerAuthMiddleware, reviewChangeRequest);

export default router;
