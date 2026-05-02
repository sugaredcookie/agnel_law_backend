import express from "express";
import multer from "multer";

import {
  createSubject,
  deleteSubjectById,
  getAllSubjects,
  getSubjectById,
  updateSubjectById,
  updateSubjectsFromExcel,
  downloadSubjectsExcel,
} from "../controllers/SubjectController.js";
import authMiddleware, { adminAuthMiddleware } from "../middlewares/AuthMiddleware.js";

const upload = multer({ storage: multer.memoryStorage() });

const subjectRouter = express.Router();

// Read routes — any authenticated user
subjectRouter.get("/get-all-subjects", authMiddleware, getAllSubjects);
subjectRouter.get("/get-subject/:id", authMiddleware, getSubjectById);
subjectRouter.get("/download-excel", authMiddleware, downloadSubjectsExcel);

// Write routes — admin only
subjectRouter.post("/create-new-subject", adminAuthMiddleware, createSubject);
subjectRouter.delete("/delete-a-subject/:id", adminAuthMiddleware, deleteSubjectById);
subjectRouter.put("/update-a-subject/:id", adminAuthMiddleware, updateSubjectById);
subjectRouter.post(
  "/upload-excel",
  adminAuthMiddleware,
  upload.single("file"),
  updateSubjectsFromExcel,
);

export default subjectRouter;
