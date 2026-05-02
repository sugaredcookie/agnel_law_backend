import GradeScheme from "../models/gradeSchemeModel.js";

export const createGradeScheme = async (req, res) => {
  try {
    const gradeScheme = new GradeScheme(req.body);
    await gradeScheme.save();
    res.status(201).json({ gradeScheme });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addGradeToScheme = async (req, res) => {
  try {
    const { id } = req.params;
    const gradeScheme = await GradeScheme.findById(id);
    if (!gradeScheme) {
      return res.status(404).json({ error: "Grade Scheme not found." });
    }
    gradeScheme.grades.push(req.body);
    await gradeScheme.save();
    res.status(201).json({ gradeScheme });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllGradeSchemes = async (req, res) => {
  try {
    const gradeSchemes = await GradeScheme.find({});
    res.status(200).json({ gradeSchemes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getGradeSchemeById = async (req, res) => {
  try {
    const { id } = req.params;
    const gradeScheme = await GradeScheme.findById(id);
    if (!gradeScheme) {
      return res.status(404).json({ error: "Grade Scheme not found." });
    }
    res.status(200).json({ gradeScheme });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateGradeScheme = async (req, res) => {
  try {
    const { id } = req.params;
    const gradeScheme = await GradeScheme.findById(id);
    if (!gradeScheme) {
      return res.status(404).json({ error: "Grade Scheme not found." });
    }
    Object.keys(req.body).forEach((key) => {
      gradeScheme[key] = req.body[key];
    });
    await gradeScheme.save();
    res.status(200).json({ gradeScheme });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteGradeScheme = async (req, res) => {
  try {
    const { id } = req.params;
    const gradeScheme = await GradeScheme.findByIdAndDelete(id);
    if (!gradeScheme) {
      return res.status(404).json({ error: "Grade Scheme not found." });
    }
    res.status(200).json({ message: "Grade Scheme deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
