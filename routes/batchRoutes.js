import express from "express";
import {
  addSubjectsToBatch,
  addTimetableToBatch,
  createBatch,
  deleteBatchById,
  demoteBatch,
  getAllBatches,
  getAllSubjectsOfBatch,
  getBatchById,
  getTimetableOfBatch,
  promoteBatch,
  updateBatchById,
  toggleMarksVisibility,
} from "../controllers/BatchController.js";
import authMiddleware, { adminAuthMiddleware } from "../middlewares/AuthMiddleware.js";

const batchRouter = express.Router();

// Read routes — any authenticated user
batchRouter.get("/get-all-batches", authMiddleware, getAllBatches);
batchRouter.get("/get-batch/:id", authMiddleware, getBatchById);
batchRouter.get("/get-all-subjects-of-batch/:id", authMiddleware, getAllSubjectsOfBatch);
batchRouter.get("/get-timetable-of-batch/:id", authMiddleware, getTimetableOfBatch);

// Write routes — admin only
batchRouter.post("/create-new-batch", adminAuthMiddleware, createBatch);
batchRouter.delete("/delete-a-batch/:id", adminAuthMiddleware, deleteBatchById);
batchRouter.put("/promote-batch/:id", adminAuthMiddleware, promoteBatch);
batchRouter.put("/demote-batch/:id", adminAuthMiddleware, demoteBatch);
batchRouter.put("/update-a-batch/:id", adminAuthMiddleware, updateBatchById);
batchRouter.put("/add-subjects-to-batch/:id", adminAuthMiddleware, addSubjectsToBatch);
batchRouter.put("/add-timetable-to-batch/:id", adminAuthMiddleware, addTimetableToBatch);
batchRouter.put("/toggle-marks-visibility/:batchId", adminAuthMiddleware, toggleMarksVisibility);

export default batchRouter;
