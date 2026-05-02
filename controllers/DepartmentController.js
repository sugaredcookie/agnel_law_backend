import departmentModel from "../models/departmentModel.js";
import { v4 as uuidv4 } from "uuid";

export const createDepartment = async (req, res) => {
  try {
    const { departmentName, description } = req.body;
    const uniqueId = uuidv4();
    const department = new departmentModel({
      departmentName,
      description,
      uniqueId,
    });
    await department.save();
    res.json({ department });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllDepartments = async (req, res) => {
  try {
    const departments = await departmentModel.find({});
    if (departments) {
      res.status(200).json({ departments });
    } else {
      res.status(500).json({ error: "Departments Not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const department = await departmentModel.findByIdAndDelete(id);
    if (department) {
      res.status(200).json({ message: "Department deleted successfully." });
    } else {
      res.status(404).json({ error: "Department not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const { departmentName, description } = req.body;
    const department = await departmentModel.findByIdAndUpdate(
      id,
      { departmentName, description },
      { new: true },
    );

    if (department) {
      res.status(200).json({ department });
    } else {
      res.status(404).json({ error: "Department not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const department = await departmentModel.findById(id);
    if (department) {
      res.status(200).json({ department });
    } else {
      res.status(404).json({ error: "Department not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
