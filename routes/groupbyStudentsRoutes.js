import express from "express";
import {
  createGroup,
  getGroupsBySubject,
  getAllGroups,
  updateGroup,
  deleteGroup,
  getStudentsForRandomSelection,
} from "../controllers/groupbyStudentsController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const groupbyStudentsRouter = express.Router();

groupbyStudentsRouter.use(authMiddleware);

groupbyStudentsRouter.post("/", createGroup);

groupbyStudentsRouter.get("/subject/:subjectId", getGroupsBySubject);

groupbyStudentsRouter.get("/", getAllGroups);

groupbyStudentsRouter.put("/:groupId", updateGroup);

groupbyStudentsRouter.delete("/:groupId", deleteGroup);

groupbyStudentsRouter.get("/students/random", getStudentsForRandomSelection);

export default groupbyStudentsRouter;
