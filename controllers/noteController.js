import Note from "../models/noteModel.js";
import Student from "../models/studentModel.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";

// Helper function to verify student belongs to a batch
const verifyStudentBatch = async (studentId, batchId) => {
  const student = await Student.findById(studentId).select("academicDetails.batch");
  if (!student) return false;
  const studentBatchId = student.academicDetails?.batch?.id?.toString() || student.academicDetails?.batch?._id?.toString();
  return studentBatchId === batchId;
};

export const uploadNote = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const uploadResult = await uploadToCloudinary(req.file);

    // Support multi-batch upload: if batches[] is provided, create one note per batch
    const batchesRaw = req.body.batches;
    let batches = [];
    if (batchesRaw) {
      // batches comes as JSON string from FormData
      batches = typeof batchesRaw === "string" ? JSON.parse(batchesRaw) : batchesRaw;
    }

    if (batches.length > 0) {
      // Multi-batch: create one note doc per batch, single Cloudinary upload
      const notes = await Note.insertMany(
        batches.map((b) => ({
          title: req.body.title,
          description: req.body.description,
          batch: { id: b.id, name: b.name },
          subject: { id: req.body.subject?.id || req.body["subject[id]"], name: req.body.subject?.name || req.body["subject[name]"] },
          faculty: req.user.facultyId,
          fileUrl: uploadResult.url,
          fileName: req.file.originalname,
          publicId: uploadResult.public_id,
          resourceType: uploadResult.resource_type,
          type: uploadResult.type,
        })),
      );

      return res.status(201).json({
        status: "success",
        data: { notes },
      });
    }

    // Single-batch (legacy FormData with batch[id] / batch[name])
    const noteData = {
      ...req.body,
      fileUrl: uploadResult.url,
      fileName: req.file.originalname,
      publicId: uploadResult.public_id,
      resourceType: uploadResult.resource_type,
      type: uploadResult.type,
      faculty: req.user.facultyId,
    };

    const newNote = await Note.create(noteData);

    res.status(201).json({
      status: "success",
      data: {
        note: newNote,
      },
    });
  } catch (err) {
    console.error("Error uploading note:", err);
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const getNotes = async (req, res) => {
  try {
    const { batchId, subjectId } = req.params;

    // For students, verify they belong to this batch via database lookup
    // For faculty/admin, allow access (they need to view notes for teaching)
    if (req.user.studentId) {
      const isAuthorized = await verifyStudentBatch(req.user.studentId, batchId);
      if (!isAuthorized) {
        return res.status(403).json({
          status: "fail",
          message: "You are not authorized to view notes for this batch",
        });
      }
    }

    const notes = await Note.find({
      "batch.id": batchId,
      "subject.id": subjectId,
    }).populate("faculty", "facultyName");
    res.status(200).json({
      notes,
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const getFacultyNotes = async (req, res) => {
  try {
    const facultyId = req.user.facultyId;
    const notes = await Note.find({ faculty: facultyId })
      .populate("batch.id", "batchName")
      .populate("subject.id", "subjectName");
    res.status(200).json({
      notes,
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const deleteNote = async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({
        status: "fail",
        message: "No note found with that ID",
      });
    }

    if (note.faculty.toString() !== req.user.facultyId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this note" });
    }

    // Determine resource type for deletion
    let resourceType = note.resourceType || "raw";
    if (note.type === "image") {
      resourceType = "image";
    }

    try {
      await deleteFromCloudinary(note.publicId, resourceType);
    } catch (deleteError) {
      console.error("Cloudinary delete error:", deleteError);
      // Continue with database deletion even if Cloudinary deletion fails
    }

    await Note.findByIdAndDelete(req.params.id);

    res.status(204).json({
      status: "success",
      data: null,
    });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};
