import express from "express";
import { upload } from "../middlewares/upload.js";
import {
  uploadNote,
  getNotes,
  getFacultyNotes,
  deleteNote,
} from "../controllers/noteController.js";
import { facultyAuthMiddleware } from "../middlewares/AuthMiddleware.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const noteRouter = express.Router();

noteRouter.post(
  "/upload",
  facultyAuthMiddleware,
  upload.single("file"),
  uploadNote,
);
noteRouter.get("/faculty", facultyAuthMiddleware, getFacultyNotes);
noteRouter.delete("/:id", facultyAuthMiddleware, deleteNote);

noteRouter.get("/:batchId/:subjectId", authMiddleware, getNotes);

export default noteRouter;
