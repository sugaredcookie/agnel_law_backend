import express from "express";
import {
  createLink,
  deleteLinkById,
  getLinkById,
  getLinkByIdAndUniqueId,
  linkLists,
  updateLinkById,
} from "../controllers/LeadCaptureController.js";
const leadCaptureRouter = express.Router();

leadCaptureRouter.post("/create-new-link", createLink);
leadCaptureRouter.get("/get-all-links", linkLists);
leadCaptureRouter.get("/get-link/:id", getLinkById);
leadCaptureRouter.put("/update-link/:id", updateLinkById);
leadCaptureRouter.delete("/delete-link/:id", deleteLinkById);

leadCaptureRouter.get(
  "/get-link-with-id-unique/:id/:uniqueId",
  getLinkByIdAndUniqueId,
);

export default leadCaptureRouter;
