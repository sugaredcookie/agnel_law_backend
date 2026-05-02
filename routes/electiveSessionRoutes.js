import express from "express";
import { adminAuthMiddleware } from "../middlewares/AuthMiddleware.js";
import {
  createSession,
  listSessions,
  getSession,
  updateSession,
  deleteSession,
  getSessionSelections,
  lockSession,
  lockStudent,
  unlockStudent,
  exportSessionSelections,
} from "../controllers/electiveSessionController.js";

const router = express.Router();

router.post("/", adminAuthMiddleware, createSession);
router.get("/", adminAuthMiddleware, listSessions);
router.get("/:id", adminAuthMiddleware, getSession);
router.patch("/:id", adminAuthMiddleware, updateSession);
router.delete("/:id", adminAuthMiddleware, deleteSession);
router.get("/:id/selections", adminAuthMiddleware, getSessionSelections);
router.get("/:id/selections/export", adminAuthMiddleware, exportSessionSelections);
router.post("/:id/lock", adminAuthMiddleware, lockSession);
router.post("/:id/lock-student/:studentId", adminAuthMiddleware, lockStudent);
router.post("/:id/unlock-student/:studentId", adminAuthMiddleware, unlockStudent);

export default router;
