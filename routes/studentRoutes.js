import express from "express";
import {
  changeStudentPassword,
  forgotStudentPassword,
} from "../controllers/studentController.js";
import multer from "multer";
import {
  createStudent,
  createStudentByAdmin,
  getAllStudents,
  downloadAllStudents,
  getAllStudentsForABatch,
  getStudentsByBatch,
  getStudentById,
  loginStudent,
  updateAStudentMarks,
  updateStudentDetails,
  updateStudentsFromExcel,
  cancelStudentAdmission,
  getRandomRollNumbers,
  downloadMarksExcelTemplate,
  bulkUpdateMarksFromExcel,
  getMyMarks,
  getMyNotes,
  getStudentPhoto,
  getStudentSign,
  resetStudentPassword,
  startIdCardGenerationJob,
  getIdCardJobStatus,
  downloadIdCardZip,
  cancelIdCardJob,
  admitMultipleStudents,
  getAdmissionJobStatus,
  getAllAdmissionJobs,
  uploadStudentPhotoAndSign,
  getStudentsBySubject,
  downloadMarksTemplate,
  uploadMarks,
  updateStudentCertificateStatus,
  // Elective selection
  getMyProfile,
  getMyElectives,
  submitElectiveSelection,
  // Archived students
  getArchivedStudents,
  restoreArchivedStudent,
  getArchiveStats,
  archiveStudentWithReason,
  getArchivedStudentById,
  getArchivedPermissions,
  updateArchivedPermissions,
  bulkUpdateArchivedPermissions,
} from "../controllers/studentController.js";
import authMiddleware, {
  facultyAuthMiddleware,
  adminAuthMiddleware,
} from "../middlewares/AuthMiddleware.js";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const studentRouter = express.Router();

// ─── Public routes ────────────────────────────────────────────
studentRouter.post("/login", loginStudent);
studentRouter.post("/forgot-password", forgotStudentPassword);
studentRouter.get("/student-photo/:rollNumber", getStudentPhoto);
studentRouter.get("/student-sign/:rollNumber", getStudentSign);

// ─── Student self-service (own token) ─────────────────────────
studentRouter.get("/my-marks", authMiddleware, getMyMarks);
studentRouter.get("/my-notes", authMiddleware, getMyNotes);
studentRouter.get("/my-profile", authMiddleware, getMyProfile);
studentRouter.get("/my-electives", authMiddleware, getMyElectives);
studentRouter.post("/my-electives", authMiddleware, submitElectiveSelection);
studentRouter.post("/change-password", authMiddleware, changeStudentPassword);

// ─── Read routes — any authenticated user ─────────────────────
studentRouter.get("/", authMiddleware, getAllStudents);
studentRouter.get("/download", authMiddleware, downloadAllStudents);
studentRouter.get("/batch/:batchId", authMiddleware, getStudentsByBatch);
studentRouter.get("/subjects/:subjectId", authMiddleware, getStudentsBySubject);
studentRouter.get("/students-for-batch", authMiddleware, getAllStudentsForABatch);
studentRouter.get("/random-roll-numbers", authMiddleware, getRandomRollNumbers);
studentRouter.get("/admission-job/:jobId", authMiddleware, getAdmissionJobStatus);
studentRouter.get("/admission-jobs", authMiddleware, getAllAdmissionJobs);
studentRouter.get("/generate-id-cards/status/:jobId", authMiddleware, getIdCardJobStatus);
studentRouter.get("/generate-id-cards/download/:jobId", authMiddleware, downloadIdCardZip);

// ─── Faculty marks routes (legacy) ───────────────────────────
studentRouter.get("/subjects/:subjectId/marks-template", facultyAuthMiddleware, downloadMarksTemplate);
studentRouter.post(
  "/subjects/:subjectId/upload-marks",
  facultyAuthMiddleware,
  upload.single("marksSheet"),
  uploadMarks,
);
studentRouter.get(
  "/marks-excel-template/:batchId/:subjectId",
  facultyAuthMiddleware,
  downloadMarksExcelTemplate,
);
studentRouter.post(
  "/bulk-update-marks/:subjectId",
  facultyAuthMiddleware,
  upload.single("file"),
  bulkUpdateMarksFromExcel,
);
studentRouter.post("/update-student-marks", facultyAuthMiddleware, updateAStudentMarks);
studentRouter.put("/marks", facultyAuthMiddleware, updateAStudentMarks);

// ─── Admin write routes ───────────────────────────────────────
studentRouter.post(
  "/create-by-admin",
  adminAuthMiddleware,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "sign", maxCount: 1 },
  ]),
  createStudentByAdmin,
);
studentRouter.post("/admitStudent/:id", adminAuthMiddleware, createStudent);
studentRouter.post(
  "/upload-excel",
  adminAuthMiddleware,
  upload.single("file"),
  updateStudentsFromExcel,
);
studentRouter.post("/admit-multiple", adminAuthMiddleware, admitMultipleStudents);
studentRouter.patch("/cancel-admission/:studentId", adminAuthMiddleware, cancelStudentAdmission);
studentRouter.patch("/update-student/:id", adminAuthMiddleware, updateStudentDetails);
studentRouter.post(
  "/update-photo-sign/:id",
  adminAuthMiddleware,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "sign", maxCount: 1 },
  ]),
  uploadStudentPhotoAndSign,
);
studentRouter.post("/reset-password/:id", adminAuthMiddleware, resetStudentPassword);
studentRouter.post("/generate-id-cards", adminAuthMiddleware, startIdCardGenerationJob);
studentRouter.delete("/generate-id-cards/cancel/:jobId", adminAuthMiddleware, cancelIdCardJob);

// ─── Archived students ───────────────────────────────────────
studentRouter.get("/archived", authMiddleware, getArchivedStudents);
studentRouter.get("/archived/stats", authMiddleware, getArchiveStats);
studentRouter.get("/archived/:id", authMiddleware, getArchivedStudentById);
studentRouter.post("/archived/:archivedStudentId/restore", adminAuthMiddleware, restoreArchivedStudent);
studentRouter.post("/archive/:studentId", adminAuthMiddleware, archiveStudentWithReason);

// Archived student permissions (admin only)
studentRouter.patch("/archived/bulk-permissions", adminAuthMiddleware, bulkUpdateArchivedPermissions);
studentRouter.get("/archived/:id/permissions", adminAuthMiddleware, getArchivedPermissions);
studentRouter.patch("/archived/:id/permissions", adminAuthMiddleware, updateArchivedPermissions);

// ─── Parameterized routes (keep last) ────────────────────────
studentRouter.get("/:id", authMiddleware, getStudentById);
studentRouter.patch("/:studentId/certificates/:certificateId", adminAuthMiddleware, updateStudentCertificateStatus);

export default studentRouter;
