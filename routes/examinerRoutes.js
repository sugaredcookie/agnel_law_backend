import express from "express";
import {
  loginExaminer,
  createExaminer,
} from "../controllers/ExaminerController.js";
import { adminAuthMiddleware } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

router.post("/login", loginExaminer);
router.post("/create", adminAuthMiddleware, createExaminer);

export default router;
