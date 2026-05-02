import programModel from "../models/programModel.js";
import { v4 as uuidv4 } from "uuid";

export const incrementStudentCount = async (programName) => {
  try {
    const program = await programModel.findOne({ programName });
    if (program) {
      if (program.currentStudents >= program.intakeCapacity) {
        throw new Error("Program has reached maximum capacity");
      }
      program.currentStudents += 1;
      await program.save();
      return program;
    } else {
      throw new Error("Program not found");
    }
  } catch (error) {
    console.error("Error incrementing student count:", error);
    throw error;
  }
};

export const decrementStudentCount = async (programName) => {
  try {
    const program = await programModel.findOne({ programName });
    if (program) {
      if (program.currentStudents > 0) {
        program.currentStudents -= 1;
        await program.save();
        return program;
      } else {
        throw new Error("No students to decrement");
      }
    } else {
      throw new Error("Program not found");
    }
  } catch (error) {
    console.error("Error decrementing student count:", error);
    throw error;
  }
};

export const createProgram = async (req, res) => {
  try {
    const { programName, description, applicationFee, developmentFee } = req.body;
    let capacity = 0;
    if (programName === "LLM") {
      capacity = 60;
    } else if (programName === "LLB" || programName === "BA LLB") {
      capacity = 180;
    }
    const uniqueId = uuidv4();
    const program = new programModel({
      programName,
      description,
      uniqueId,
      intakeCapacity: capacity,
      applicationFee,
      developmentFee: developmentFee || 0,
    });
    await program.save();
    res.json({ program });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllPrograms = async (req, res) => {
  try {
    const programs = await programModel.find({});
    if (programs) {
      res.status(200).json({ programs });
    } else {
      res.status(500).json({ error: "Programs Not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProgramById = async (req, res) => {
  try {
    const { id } = req.params;
    const program = await programModel.findById(id);

    if (program) {
      res.status(200).json({ program });
    } else {
      res.status(404).json({ error: "Program not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteProgramById = async (req, res) => {
  try {
    const { id } = req.params;
    const program = await programModel.findByIdAndDelete(id);
    if (program) {
      res.status(200).json({ message: "Program deleted successfully." });
    } else {
      res.status(404).json({ error: "Program not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProgramById = async (req, res) => {
  try {
    const { id } = req.params;
    const { programName, description, applicationFee, developmentFee } = req.body;
    const program = await programModel.findByIdAndUpdate(
      id,
      { programName, description, applicationFee, developmentFee: developmentFee ?? 0 },
      { new: true },
    );

    if (program) {
      res.status(200).json({ program });
    } else {
      res.status(404).json({ error: "Program not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const isProgramFull = async (req, res) => {
  try {
    const { programName } = req.params;
    const program = await programModel.findOne({ programName });

    if (!program) {
      return res.status(404).json({ error: "Program not found" });
    }

    const isFull = program.currentStudents >= program.intakeCapacity;
    res.json({ isFull });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProgramFeeByName = async (req, res) => {
  try {
    const { programName } = req.params;
    const program = await programModel.findOne({ programName });
    if (!program) {
      return res.status(404).json({ error: "Program not found" });
    }
    res.json({
      _id: program._id,
      programName: program.programName,
      applicationFee: program.applicationFee,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
