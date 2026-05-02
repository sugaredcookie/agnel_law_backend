import express from "express";
import multer from "multer";
const nonTeachingStaffRouter = express.Router();
import {
  createNonTeachingStaff,
  deleteNonTeachingStaffById,
  nonTeachingStaffLogin,
  getAllNonTeachingStaff,
  getNonTeachingStaffById,
  mailNonTeachingStaffLoginDetails,
  updateNonTeachingStaffById,
  updateNonTeachingStaffFromExcel,
  downloadNonTeachingStaffExcel,
  forgotNonTeachingStaffPassword,
} from "../controllers/nonTeachingStaffController.js";
import { nonTeachingStaffAuthMiddleware } from "../middlewares/AuthMiddleware.js";

const upload = multer({ storage: multer.memoryStorage() });

// Authentication routes
nonTeachingStaffRouter.post("/forgot-password", forgotNonTeachingStaffPassword);
nonTeachingStaffRouter.post("/login", nonTeachingStaffLogin);

// CRUD operations
nonTeachingStaffRouter.post("/create", createNonTeachingStaff);
nonTeachingStaffRouter.get("/all", getAllNonTeachingStaff);
nonTeachingStaffRouter.get("/download-excel", downloadNonTeachingStaffExcel);
nonTeachingStaffRouter.get("/:id", getNonTeachingStaffById);
nonTeachingStaffRouter.put("/update/:id", updateNonTeachingStaffById);
nonTeachingStaffRouter.delete("/delete/:id", deleteNonTeachingStaffById);

// Email and Excel operations
nonTeachingStaffRouter.post("/mail-details/:id", mailNonTeachingStaffLoginDetails);
nonTeachingStaffRouter.post(
  "/upload-excel",
  upload.single("file"),
  updateNonTeachingStaffFromExcel
);

export default nonTeachingStaffRouter;