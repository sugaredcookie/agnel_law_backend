import express from "express";
import authMiddleware from "../middlewares/AuthMiddleware.js";
import { adminAuthMiddleware } from "../middlewares/AuthMiddleware.js";
import {
  createProfileRequest,
  getAllProfileRequests,
  getProfileRequestById,
  updateProfileRequest,
  getMyProfileRequests,
  submitProfileRequest,
} from "../controllers/profileUpdateRequestController.js";

const profileRequestRouter = express.Router();

// Student routes (must be before parameterized /:id)
profileRequestRouter.get("/student/pending", authMiddleware, getMyProfileRequests);
profileRequestRouter.post("/student/:id/submit", authMiddleware, submitProfileRequest);

// Admin routes
profileRequestRouter.post("/", adminAuthMiddleware, createProfileRequest);
profileRequestRouter.get("/", adminAuthMiddleware, getAllProfileRequests);
profileRequestRouter.get("/:id", adminAuthMiddleware, getProfileRequestById);
profileRequestRouter.patch("/:id", adminAuthMiddleware, updateProfileRequest);

export default profileRequestRouter;
