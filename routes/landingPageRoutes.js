import express from "express";
import {
  captureLeadFromLandingPage,
  getAllLandingPageLeads,
} from "../controllers/LandingPageController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const landingPageRouter = express.Router();

landingPageRouter.post(
  "/capture-landing-page-lead",
  captureLeadFromLandingPage,
);
landingPageRouter.post(
  "/get-all-landing-page-leads",
  authMiddleware,
  getAllLandingPageLeads,
);

export default landingPageRouter;
