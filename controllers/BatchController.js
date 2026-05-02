import batchModel from "../models/batchesModel.js";
import { v4 as uuidv4 } from "uuid";
import subjectModel from "../models/subjectModel.js";
import studentModel from "../models/studentModel.js";

export const createBatch = async (req, res) => {
  try {
    const { batchName, description, term, subjects, program, department } =
      req.body;
    const uniqueId = uuidv4();
    const batch = new batchModel({
      batchName,
      description,
      term,
      uniqueId,
      subjects,
      program: {
        id: program.id,
        name: program.name,
      },
      department: {
        id: department.id,
        name: department.name,
      },
    });
    await batch.save();
    res.json({ batch });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllBatches = async (req, res) => {
  try {
    const batches = await batchModel.find({});
    if (batches) {
      res.status(200).json({ batches });
    } else {
      res.status(500).json({ error: "Batches Not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteBatchById = async (req, res) => {
  try {
    const { id } = req.params;

    // Guard: prevent deletion if students are assigned to this batch
    const assignedCount = await studentModel.countDocuments({
      "academicDetails.batch.id": id,
      status: "active",
    });
    if (assignedCount > 0) {
      return res.status(400).json({
        error: `Cannot delete batch: ${assignedCount} active student(s) are still assigned to it. Reassign or remove them first.`,
      });
    }

    const batch = await batchModel.findByIdAndDelete(id);
    if (batch) {
      res.status(200).json({ message: "Batch deleted successfully." });
    } else {
      res.status(404).json({ error: "Batch not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateBatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const { batchName, description, term, subjects, program, department } =
      req.body;
    const batch = await batchModel.findByIdAndUpdate(
      id,
      { batchName, description, term, subjects, program, department },
      { new: true },
    );

    if (batch) {
      res.status(200).json({ batch });
    } else {
      res.status(404).json({ error: "Batch not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getBatchById = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await batchModel.findById(id);
    if (batch) {
      res.status(200).json({ batch });
    } else {
      res.status(404).json({ error: "Batch not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const promoteBatch = async (req, res) => {
  const { id } = req.params;
  try {
    const batch = await batchModel.findById(id);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found." });
    }

    batch.term += 1;
    await batch.save();

    res.status(200).json({ batch });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
export const demoteBatch = async (req, res) => {
  const { id } = req.params;
  try {
    const batch = await batchModel.findById(id);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found." });
    }
    if (batch.term > 0) {
      batch.term -= 1;
    }
    await batch.save();

    res.status(200).json({ batch });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllSubjectsOfBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await batchModel.findById(id);
    if (batch) {
      const subjects = await subjectModel
        .find({ _id: { $in: batch.subjects } })
        .lean();

      const processedSubjects = subjects.map((subject) => {
        if (typeof subject.faculty === "string") {
          return { ...subject, faculty: { facultyName: subject.faculty } };
        }
        return subject;
      });

      res.status(200).json({ subjects: processedSubjects });
    } else {
      res.status(404).json({ error: "Batch not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addSubjectsToBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { subjects } = req.body;
    const batch = await batchModel.findByIdAndUpdate(
      id,
      { $addToSet: { subjects: { $each: subjects } } },
      { new: true, runValidators: true },
    );
    if (batch) {
      res.status(200).json({ batch });
    } else {
      res.status(404).json({ error: "Batch not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addTimetableToBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { timetable } = req.body;

    console.log(req.body);

    if (!timetable || typeof timetable !== "object") {
      return res
        .status(400)
        .json({ error: "Invalid timetable data provided." });
    }

    const batch = await batchModel.findByIdAndUpdate(
      id,
      { $set: { timetable } },
      { new: true, runValidators: true },
    );

    if (batch) {
      res
        .status(200)
        .json({ message: "Timetable updated successfully.", batch });
    } else {
      res.status(404).json({ error: "Batch not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTimetableOfBatch = async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await batchModel.findById(id, "timetable");

    if (batch) {
      res.status(200).json({ timetable: batch.timetable });
    } else {
      res.status(404).json({ error: "Batch not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const toggleMarksVisibility = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { marksVisible } = req.body;

    const batch = await batchModel.findByIdAndUpdate(
      batchId,
      { marksVisible },
      { new: true },
    );

    if (!batch) {
      return res.status(404).json({ error: "Batch not found." });
    }

    res.status(200).json({
      message: `Marks visibility for ${batch.batchName} is now ${batch.marksVisible ? "ON" : "OFF"}`,
      batch,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
