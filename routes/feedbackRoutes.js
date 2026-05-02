import express from "express";
import {
  addQuestion,
  getAllFacultyFeedbackQuestions,
  getAllSubjectFeedbackQuestions,
  removeQuestion,
} from "../controllers/FeedbackController.js";

const feedbackRouter = express.Router();

feedbackRouter.post("/add-question", addQuestion);
feedbackRouter.put("/remove-question", removeQuestion);
feedbackRouter.get("/get-faculty-questions", getAllFacultyFeedbackQuestions);
feedbackRouter.get("/get-subject-questions", getAllSubjectFeedbackQuestions);

export default feedbackRouter;
