import express from "express";
import multer from "multer";
const facultyRouter = express.Router();
import {
  createFaculty,
  deleteFacultyById,
  facultyLogin,
  getAllFaculties,
  getFacultyById,
  getFacultyDetails,
  getFacultySubjectsByBatch,
  mailFacultyLoginDetails,
  updateFacultyById,
  updateFacultiesFromExcel,
  downloadFacultiesExcel,
  forgotFacultyPassword,
} from "../controllers/facultyController.js";
import authMiddleware, {
  facultyAuthMiddleware,
  adminAuthMiddleware,
} from "../middlewares/AuthMiddleware.js";

const upload = multer({ storage: multer.memoryStorage() });

// ─── Public ───────────────────────────────────────────────────
facultyRouter.post("/login", facultyLogin);
facultyRouter.post("/forgot-password", forgotFacultyPassword);

// ─── Faculty self-service ─────────────────────────────────────
facultyRouter.get("/my-details", facultyAuthMiddleware, getFacultyDetails);
facultyRouter.get(
  "/batch/:batchId/subjects",
  facultyAuthMiddleware,
  getFacultySubjectsByBatch,
);

// ─── Read routes — any authenticated user ─────────────────────
facultyRouter.get("/get-all-faculties", authMiddleware, getAllFaculties);
facultyRouter.get("/get-faculty/:id", authMiddleware, getFacultyById);
facultyRouter.get("/download-excel", authMiddleware, downloadFacultiesExcel);

// ─── Admin write routes ───────────────────────────────────────
facultyRouter.post("/create-new-faculty", adminAuthMiddleware, createFaculty);
facultyRouter.delete("/delete-a-faculty/:id", adminAuthMiddleware, deleteFacultyById);
facultyRouter.put("/update-a-faculty/:id", adminAuthMiddleware, updateFacultyById);
facultyRouter.post("/mail-details-faculty/:id", adminAuthMiddleware, mailFacultyLoginDetails);
facultyRouter.post(
  "/upload-excel",
  adminAuthMiddleware,
  upload.single("file"),
  updateFacultiesFromExcel,
);

export default facultyRouter;
