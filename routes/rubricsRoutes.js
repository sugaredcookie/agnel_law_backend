import express from "express";
import {
  getRubrics,
  createRubric,
  updateRubric,
  deleteRubric,
} from "../controllers/rubricsController.js";
import { facultyAuthMiddleware } from "../middlewares/AuthMiddleware.js";

const rubricsRouter = express.Router();

rubricsRouter.use(facultyAuthMiddleware);

rubricsRouter.get("/", getRubrics);
rubricsRouter.post("/", createRubric);
rubricsRouter.put("/:id", updateRubric);
rubricsRouter.delete("/:id", deleteRubric);

export default rubricsRouter;
