import express from "express";
import {
  generateReportCard,
  getStudentReportCards,
  calculateSgpa,
} from "../controllers/reportCardController.js";

const reportCardRouter = express.Router();

reportCardRouter.post("/create", generateReportCard);
reportCardRouter.get("/:studentId", getStudentReportCards);
reportCardRouter.get("/sgpa/:studentId", calculateSgpa);

export default reportCardRouter;
