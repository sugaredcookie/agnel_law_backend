import batchGroupModel from "../models/batchGroupModel.js";
import batchModel from "../models/batchesModel.js";
import studentModel from "../models/studentModel.js";

// Create a new batch group
export const createBatchGroup = async (req, res) => {
  try {
    const { groupName, description, batches, program, department } = req.body;

    const existingGroup = await batchGroupModel.findOne({ groupName });
    if (existingGroup) {
      return res.status(400).json({ error: "Batch group name already exists." });
    }

    const batchGroup = new batchGroupModel({
      groupName,
      description,
      batches: batches || [],
      program: program
        ? {
            id: program.id,
            name: program.name,
          }
        : undefined,
      department: department
        ? {
            id: department.id,
            name: department.name,
          }
        : undefined,
    });

    await batchGroup.save();
    res.status(201).json({ batchGroup });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all batch groups
export const getAllBatchGroups = async (req, res) => {
  try {
    const batchGroups = await batchGroupModel
      .find({})
      .populate("batches", "batchName term program department");
    res.status(200).json({ batchGroups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a single batch group by ID
export const getBatchGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    const batchGroup = await batchGroupModel
      .findById(id)
      .populate("batches", "batchName term program department");

    if (!batchGroup) {
      return res.status(404).json({ error: "Batch group not found." });
    }

    res.status(200).json({ batchGroup });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a batch group
export const updateBatchGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName, description, batches, program, department } = req.body;

    const updateData = {
      groupName,
      description,
      batches,
    };

    if (program) {
      updateData.program = {
        id: program.id,
        name: program.name,
      };
    }

    if (department) {
      updateData.department = {
        id: department.id,
        name: department.name,
      };
    }

    const batchGroup = await batchGroupModel.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!batchGroup) {
      return res.status(404).json({ error: "Batch group not found." });
    }

    res.status(200).json({ batchGroup });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete a batch group
export const deleteBatchGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const batchGroup = await batchGroupModel.findByIdAndDelete(id);

    if (!batchGroup) {
      return res.status(404).json({ error: "Batch group not found." });
    }

    res.status(200).json({ message: "Batch group deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add batches to a group
export const addBatchesToGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { batchIds } = req.body;

    const batchGroup = await batchGroupModel.findByIdAndUpdate(
      id,
      { $addToSet: { batches: { $each: batchIds } } },
      { new: true }
    );

    if (!batchGroup) {
      return res.status(404).json({ error: "Batch group not found." });
    }

    res.status(200).json({ batchGroup });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Remove batches from a group
export const removeBatchesFromGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { batchIds } = req.body;

    const batchGroup = await batchGroupModel.findByIdAndUpdate(
      id,
      { $pull: { batches: { $in: batchIds } } },
      { new: true }
    );

    if (!batchGroup) {
      return res.status(404).json({ error: "Batch group not found." });
    }

    res.status(200).json({ batchGroup });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all batches in a group with full details
export const getBatchesInGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const batchGroup = await batchGroupModel.findById(id);

    if (!batchGroup) {
      return res.status(404).json({ error: "Batch group not found." });
    }

    const batches = await batchModel.find({ _id: { $in: batchGroup.batches } });
    res.status(200).json({ batches, groupName: batchGroup.groupName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Rearrange students across batches in a group
// Sorts all students by roll number and distributes them evenly (max per batch configurable)
export const rearrangeStudentsInGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { maxPerBatch = 90, dryRun = false } = req.body;

    const batchGroup = await batchGroupModel
      .findById(id)
      .populate("batches", "batchName");

    if (!batchGroup) {
      return res.status(404).json({ error: "Batch group not found." });
    }

    if (!batchGroup.batches || batchGroup.batches.length === 0) {
      return res.status(400).json({ error: "No batches in this group." });
    }

    // Sort batches alphabetically by name for consistent ordering
    const sortedBatches = batchGroup.batches.sort((a, b) =>
      a.batchName.localeCompare(b.batchName)
    );

    // Get all students from all batches in the group
    const batchIds = sortedBatches.map((b) => b._id);
    const students = await studentModel
      .find({
        "academicDetails.batch.id": { $in: batchIds },
        status: "active",
      })
      .select("_id studentDetails.firstName studentDetails.lastName academicDetails.rollNumber academicDetails.batch")
      .lean();

    if (students.length === 0) {
      return res.status(400).json({ error: "No students found in this group's batches." });
    }

    // Sort students by roll number
    students.sort((a, b) => {
      const rollA = a.academicDetails?.rollNumber || "";
      const rollB = b.academicDetails?.rollNumber || "";
      return rollA.localeCompare(rollB, undefined, { numeric: true });
    });

    // Calculate distribution
    const distribution = [];
    let studentIndex = 0;

    for (const batch of sortedBatches) {
      const batchStudents = [];
      const startIndex = studentIndex;

      while (studentIndex < students.length && batchStudents.length < maxPerBatch) {
        batchStudents.push(students[studentIndex]);
        studentIndex++;
      }

      distribution.push({
        batchId: batch._id,
        batchName: batch.batchName,
        studentCount: batchStudents.length,
        students: batchStudents.map((s) => ({
          _id: s._id,
          name: `${s.studentDetails?.firstName || ""} ${s.studentDetails?.lastName || ""}`.trim(),
          rollNumber: s.academicDetails?.rollNumber || "N/A",
          currentBatch: s.academicDetails?.batch?.name || "N/A",
        })),
      });
    }

    // Check if all students fit
    if (studentIndex < students.length) {
      return res.status(400).json({
        error: `Not enough batches to hold all students. ${students.length - studentIndex} students would be left unassigned.`,
        totalStudents: students.length,
        maxCapacity: sortedBatches.length * maxPerBatch,
      });
    }

    // If dry run, return preview only
    if (dryRun) {
      return res.status(200).json({
        message: "Dry run - no changes made",
        totalStudents: students.length,
        distribution,
      });
    }

    // Apply changes
    let updatedCount = 0;
    for (const batchDist of distribution) {
      const batch = sortedBatches.find((b) => b._id.toString() === batchDist.batchId.toString());
      
      for (const student of batchDist.students) {
        await studentModel.updateOne(
          { _id: student._id },
          {
            $set: {
              "academicDetails.batch": {
                id: batch._id,
                name: batch.batchName,
              },
            },
          }
        );
        updatedCount++;
      }
    }

    res.status(200).json({
      message: "Students rearranged successfully",
      totalStudents: students.length,
      updatedCount,
      distribution: distribution.map((d) => ({
        batchName: d.batchName,
        studentCount: d.studentCount,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
