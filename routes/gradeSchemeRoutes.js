import express from "express";
import {
  addGradeToScheme,
  createGradeScheme,
  deleteGradeScheme,
  getAllGradeSchemes,
  getGradeSchemeById,
  updateGradeScheme,
} from "../controllers/GradeSchemeController.js";

const gradeRouter = express.Router();

gradeRouter.post("/create-new-scheme", createGradeScheme);
gradeRouter.post("/add-new-grade/:id", addGradeToScheme);
gradeRouter.get("/get-all-gradeSchemes", getAllGradeSchemes);
gradeRouter.get("/get-gradeScheme/:id", getGradeSchemeById);
gradeRouter.put("/update-gradeScheme/:id", updateGradeScheme);
gradeRouter.delete("/delete-gradeScheme/:id", deleteGradeScheme);

export default gradeRouter;
