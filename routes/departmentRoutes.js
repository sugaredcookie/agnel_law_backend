import express from "express";
import {
  createDepartment,
  deleteDepartmentById,
  getAllDepartments,
  getDepartmentById,
  updateDepartmentById,
} from "../controllers/DepartmentController.js";

const departmentRouter = express.Router();

departmentRouter.post("/create-new-department", createDepartment);
departmentRouter.get("/get-all-departments", getAllDepartments);
departmentRouter.delete("/delete-a-department/:id", deleteDepartmentById);
departmentRouter.get("/get-department/:id", getDepartmentById);
departmentRouter.put("/update-a-department/:id", updateDepartmentById);

export default departmentRouter;
