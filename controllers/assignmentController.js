import Assignment from "../models/assignmentModel.js";
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

export const getAllAssignments = async (req, res) => {
  try {
    const assignments = await Assignment.find();
    res.status(200).json({
      assignments,
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const getFacultyAssignments = async (req, res) => {
  const facultyId = req.params.id;

  // Verify faculty can only access their own assignments (admin can access any)
  if (req.user.role !== "admin" && req.user.facultyId !== facultyId) {
    return res.status(403).json({
      status: "fail",
      message: "You are not authorized to view these assignments",
    });
  }

  try {
    const assignments = await Assignment.find({ faculty: facultyId }).sort({
      createdAt: -1,
    });
    res.status(200).json({
      assignments,
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const getSubjectAssignments = async (req, res) => {
  const subjectId = req.params.subjectId;
  const facultyId = req.params.facultyId;
  const batchId = req.params.batchId;

  // Verify faculty can only access their own subject assignments (admin can access any)
  if (req.user.role !== "admin" && req.user.facultyId !== facultyId) {
    return res.status(403).json({
      status: "fail",
      message: "You are not authorized to view these assignments",
    });
  }

  try {
    const query = {
      "subject.id": subjectId,
      faculty: facultyId,
    };

    // Filter by batch if provided (required for proper batch-subject isolation)
    if (batchId) {
      query["batch.id"] = batchId;
    }

    const assignments = await Assignment.find(query).sort({ createdAt: -1 });
    res.status(200).json({
      assignments,
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const getBatchAssignments = async (req, res) => {
  const batchId = req.params.batchId;

  // Verify student belongs to this batch (admin can access any)
  if (req.user.role !== "admin") {
    const isAuthorized = await verifyStudentBatch(req.user.studentId, batchId);
    if (!isAuthorized) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to view assignments for this batch",
      });
    }
  }

  try {
    // Only get assignments that explicitly belong to this batch
    const assignments = await Assignment.find({
      "batch.id": batchId,
    }).sort({ createdAt: -1 });
    res.status(200).json({
      assignments,
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const getStudentAssignments = async (req, res) => {
  const { batchId, subjectIds } = req.body;

  // Verify student belongs to this batch (admin can access any)
  if (req.user.role !== "admin") {
    const isAuthorized = await verifyStudentBatch(req.user.studentId, batchId);
    if (!isAuthorized) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to view assignments for this batch",
      });
    }
  }

  try {
    // Always filter by batch to ensure proper isolation
    const query = {
      "batch.id": batchId,
    };

    // Additionally filter by subjects if provided
    if (subjectIds && subjectIds.length > 0) {
      query["subject.id"] = { $in: subjectIds };
    }

    const assignments = await Assignment.find(query)
      .populate("faculty", "facultyName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      assignments,
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const getAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        status: "fail",
        message: "No assignment found with that ID",
      });
    }
    res.status(200).json({
      status: "success",
      data: {
        assignment,
      },
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const createAssignment = async (req, res) => {
  try {
    let fileData = {};

    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file);

        fileData = {
          fileUrl: uploadResult.url,
          fileName: req.file.originalname,
          publicId: uploadResult.public_id,
          type: uploadResult.type,
        };
      } catch (uploadError) {
        console.error(
          "Cloudinary upload error for assignment file:",
          uploadError,
        );
        return res.status(400).json({
          status: "fail",
          message: `Error uploading file to Cloudinary: ${uploadError.message || "Unknown Cloudinary error"}`,
        });
      }
    }

    const assignmentData = {
      ...req.body,
      ...fileData,
    };

    const newAssignment = await Assignment.create(assignmentData);

    res.status(201).json({
      status: "success",
      data: {
        assignment: newAssignment,
      },
    });
  } catch (err) {
    console.error("Error creating assignment:", err);
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const updateAssignment = async (req, res) => {
  try {
    // First check if the assignment exists and belongs to this faculty
    const existingAssignment = await Assignment.findById(req.params.id);
    if (!existingAssignment) {
      return res.status(404).json({
        status: "fail",
        message: "No assignment found with that ID",
      });
    }

    // Verify faculty ownership (admin can update any)
    if (
      req.user.role !== "admin" &&
      existingAssignment.faculty.toString() !== req.user.facultyId
    ) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to update this assignment",
      });
    }

    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );
    res.status(200).json({
      status: "success",
      data: {
        assignment,
      },
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const deleteAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        status: "fail",
        message: "No assignment found with that ID",
      });
    }

    // Verify faculty ownership (admin can delete any)
    if (
      req.user.role !== "admin" &&
      assignment.faculty.toString() !== req.user.facultyId
    ) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to delete this assignment",
      });
    }

    if (assignment.publicId) {
      let resourceType = "raw";
      if (
        assignment.type === "image" ||
        assignment.fileUrl?.includes("/image/")
      ) {
        resourceType = "image";
      }

      try {
        await deleteFromCloudinary(assignment.publicId, resourceType);
      } catch (deleteError) {
        console.error("Cloudinary delete error:", deleteError);
      }
    }

    await Assignment.findByIdAndDelete(req.params.id);

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

export const submitAssignment = async (req, res) => {
  try {
    const { assignmentId, studentId, studentName } = req.body;

    // Verify student is submitting for themselves (not impersonating)
    if (req.user.studentId !== studentId) {
      return res.status(403).json({
        status: "fail",
        message: "You can only submit assignments for yourself",
      });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        status: "fail",
        message: "Assignment not found",
      });
    }

    // Verify student belongs to the batch this assignment is for
    if (assignment.batch?.id) {
      const isAuthorized = await verifyStudentBatch(studentId, assignment.batch.id.toString());
      if (!isAuthorized) {
        return res.status(403).json({
          status: "fail",
          message: "You are not authorized to submit to this assignment",
        });
      }
    }

    // Check if student already submitted
    const existingSubmission = assignment.submissions.find(
      (sub) => sub.student.toString() === studentId,
    );

    if (existingSubmission) {
      return res.status(400).json({
        status: "fail",
        message: "You have already submitted this assignment",
      });
    }

    let fileData = {};
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file);
        fileData = {
          submissionUrl: uploadResult.url,
          fileName: req.file.originalname,
          publicId: uploadResult.public_id,
          fileType: uploadResult.type,
        };
      } catch (uploadError) {
        console.error("Cloudinary upload error:", uploadError);
        return res.status(400).json({
          status: "fail",
          message: `Error uploading file: ${uploadError.message}`,
        });
      }
    }

    // Determine if submission is late
    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    const status = now > dueDate ? "late" : "submitted";

    const submission = {
      student: studentId,
      studentName,
      ...fileData,
      submissionDate: now,
      status,
    };

    assignment.submissions.push(submission);
    await assignment.save();

    res.status(200).json({
      status: "success",
      message: "Assignment submitted successfully",
      data: {
        submission,
      },
    });
  } catch (err) {
    console.error("Submission error:", err);
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const getAssignmentSubmissions = async (req, res) => {
  try {
    const assignment = await Assignment.findById(
      req.params.assignmentId,
    ).populate(
      "submissions.student",
      "studentDetails.firstName studentDetails.lastName academicDetails.rollNumber",
    );

    if (!assignment) {
      return res.status(404).json({
        status: "fail",
        message: "Assignment not found",
      });
    }

    // Verify faculty ownership (admin can view any)
    if (
      req.user.role !== "admin" &&
      assignment.faculty.toString() !== req.user.facultyId
    ) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to view these submissions",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        assignment: {
          title: assignment.title,
          description: assignment.description,
          subject: assignment.subject,
          dueDate: assignment.dueDate,
        },
        submissions: assignment.submissions,
      },
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const getStudentSubmissionStatus = async (req, res) => {
  try {
    const { assignmentId, studentId } = req.params;

    // Verify student is checking their own status (not snooping on others)
    if (req.user.studentId !== studentId) {
      return res.status(403).json({
        status: "fail",
        message: "You can only check your own submission status",
      });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        status: "fail",
        message: "Assignment not found",
      });
    }

    const submission = assignment.submissions.find(
      (sub) => sub.student.toString() === studentId,
    );

    res.status(200).json({
      status: "success",
      data: {
        hasSubmitted: !!submission,
        submission: submission || null,
      },
    });
  } catch (err) {
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const deleteSubmission = async (req, res) => {
  try {
    const { assignmentId, studentId } = req.params;

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        status: "fail",
        message: "Assignment not found",
      });
    }

    // Authorization check:
    // - Students can delete their own submissions
    // - Faculty can delete submissions from their assignments
    // - Admin can delete any submission
    const isAdmin = req.user.role === "admin";
    const isOwnSubmission = req.user.studentId === studentId;
    const isFacultyOwner = req.user.facultyId && assignment.faculty.toString() === req.user.facultyId;

    if (!isAdmin && !isOwnSubmission && !isFacultyOwner) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to delete this submission",
      });
    }

    const submissionIndex = assignment.submissions.findIndex(
      (sub) => sub.student.toString() === studentId,
    );

    if (submissionIndex === -1) {
      return res.status(404).json({
        status: "fail",
        message: "Submission not found",
      });
    }

    const submission = assignment.submissions[submissionIndex];

    // Delete from Cloudinary if exists
    if (submission.publicId) {
      let resourceType = "raw";
      if (
        submission.fileType === "image" ||
        submission.submissionUrl?.includes("/image/")
      ) {
        resourceType = "image";
      }

      try {
        await deleteFromCloudinary(submission.publicId, resourceType);
      } catch (deleteError) {
        console.error("Cloudinary delete error for submission:", deleteError);
      }
    }

    // Remove from array
    assignment.submissions.splice(submissionIndex, 1);
    await assignment.save();

    res.status(200).json({
      status: "success",
      message: "Submission deleted successfully",
    });
  } catch (err) {
    console.error("Delete submission error:", err);
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};
