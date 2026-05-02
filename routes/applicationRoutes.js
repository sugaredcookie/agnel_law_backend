import express from "express";
import {
  getApplicationFormsForAdmin,
  getApplicationFormsForAdminFilters,
  getApplicationforms,
  getSingleApplicationFormForAdmin,
  getSingleApplicationform,
  registerApplicationForm,
  registerUpdateApplicationForm,
  updateCertificateStatus,
  rejectApplication,
  downloadApplicationsAsExcel,
} from "../controllers/ApplicationController.js";
import { upload } from "../middlewares/Multer.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const applicationRouter = express.Router();

applicationRouter.post(
  "/register-application",
  authMiddleware,
  upload.fields([
    { name: "studentImage", maxCount: 2 },
    { name: "certificates", maxCount: 10 },
  ]),
  registerApplicationForm,
);
applicationRouter.post(
  "/update-application",
  upload.fields([
    { name: "studentImage", maxCount: 2 },
    { name: "certificates", maxCount: 28 },
  ]),
  registerUpdateApplicationForm,
);

applicationRouter.get("/get-applications", getApplicationforms);
applicationRouter.get("/get-single-application/:id", getSingleApplicationform);

applicationRouter.get(
  "/get-applications-for-admin",
  getApplicationFormsForAdmin,
);
applicationRouter.get(
  "/get-single-application-for-admin/:id",
  getSingleApplicationFormForAdmin,
);
applicationRouter.post(
  "/get-applications-for-admin-filters",
  getApplicationFormsForAdminFilters,
);
applicationRouter.put(
  "/verify-certificate/:applicationId/:certificateId",
  updateCertificateStatus,
);

applicationRouter.post("/reject-application/:id", rejectApplication);

applicationRouter.get("/download-excel", downloadApplicationsAsExcel);

export default applicationRouter;
