import ProfileUpdateRequest from "../models/profileUpdateRequestModel.js";
import Student from "../models/studentModel.js";
import batchModel from "../models/batchesModel.js";

// ─── Admin endpoints ──────────────────────────────────────────

export const createProfileRequest = async (req, res) => {
  try {
    const {
      title,
      fieldPath,
      fieldLabel,
      fieldType,
      selectOptions,
      validationRegex,
      placeholder,
      targetType,
      targetBatches,
      targetProgram,
      targetStudents,
      deadline,
    } = req.body;

    if (!title || !fieldPath || !fieldLabel || !targetType) {
      return res
        .status(400)
        .json({ message: "title, fieldPath, fieldLabel, and targetType are required" });
    }

    const request = new ProfileUpdateRequest({
      title,
      fieldPath,
      fieldLabel,
      fieldType: fieldType || "text",
      selectOptions: selectOptions || [],
      validationRegex: validationRegex || "",
      placeholder: placeholder || "",
      targetType,
      targetBatches: targetBatches || [],
      targetProgram: targetProgram || "",
      targetStudents: targetStudents || [],
      deadline: deadline || null,
      createdBy: req.user?.id || req.user?._id,
    });

    await request.save();
    res.status(201).json({ message: "Profile update request created", request });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getAllProfileRequests = async (req, res) => {
  try {
    const requests = await ProfileUpdateRequest.find()
      .sort({ createdAt: -1 })
      .populate("targetBatches", "batchName")
      .populate("createdBy", "name email");

    // For each request, compute total targeted students and completed count
    const enriched = await Promise.all(
      requests.map(async (r) => {
        const totalTargeted = await countTargetedStudents(r);
        return {
          ...r.toObject(),
          completedCount: r.completedBy.length,
          totalTargeted,
        };
      }),
    );

    res.json({ requests: enriched });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getProfileRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await ProfileUpdateRequest.findById(id)
      .populate("targetBatches", "batchName")
      .populate("completedBy.student", "studentDetails.firstName studentDetails.lastName academicDetails.rollNumber");

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Get list of students who haven't completed
    const targetedStudents = await getTargetedStudentList(request);
    const completedIds = new Set(
      request.completedBy.map((c) => c.student?._id?.toString()),
    );
    const pending = targetedStudents.filter(
      (s) => !completedIds.has(s._id.toString()),
    );

    res.json({
      request,
      pendingStudents: pending,
      totalTargeted: targetedStudents.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateProfileRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const request = await ProfileUpdateRequest.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true },
    );

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    res.json({ message: "Request updated", request });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─── Student endpoints ────────────────────────────────────────

export const getMyProfileRequests = async (req, res) => {
  try {
    const studentId = req.user.studentId;
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const batchId = student.academicDetails?.batch?.id;
    const program = student.academicDetails?.program;

    // Find all active requests that target this student
    const requests = await ProfileUpdateRequest.find({
      isActive: true,
      $or: [
        { targetType: "all" },
        { targetType: "batch", targetBatches: batchId },
        { targetType: "program", targetProgram: program },
        { targetType: "individual", targetStudents: studentId },
      ],
    });

    // Filter out already completed ones and attach current value
    const pending = [];
    for (const r of requests) {
      const alreadyDone = r.completedBy.some(
        (c) => c.student.toString() === studentId.toString(),
      );
      if (!alreadyDone) {
        // Get current value for this field from student profile
        const currentValue = getNestedValue(student.toObject(), r.fieldPath);
        pending.push({
          _id: r._id,
          title: r.title,
          fieldPath: r.fieldPath,
          fieldLabel: r.fieldLabel,
          fieldType: r.fieldType,
          selectOptions: r.selectOptions,
          validationRegex: r.validationRegex,
          placeholder: r.placeholder,
          deadline: r.deadline,
          currentValue: currentValue || "",
        });
      }
    }

    res.json({ pendingRequests: pending, pendingCount: pending.length });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const submitProfileRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { value } = req.body;
    const studentId = req.user.studentId;

    if (!value || !value.toString().trim()) {
      return res.status(400).json({ message: "Value is required" });
    }

    const request = await ProfileUpdateRequest.findById(id);
    if (!request || !request.isActive) {
      return res.status(404).json({ message: "Request not found or inactive" });
    }

    // Check if already completed
    const alreadyDone = request.completedBy.some(
      (c) => c.student.toString() === studentId.toString(),
    );
    if (alreadyDone) {
      return res.status(400).json({ message: "Already submitted" });
    }

    // Validate against regex if provided
    if (request.validationRegex) {
      const regex = new RegExp(request.validationRegex);
      if (!regex.test(value.toString().trim())) {
        return res.status(400).json({
          message: `Invalid format for ${request.fieldLabel}`,
        });
      }
    }

    // Write value directly to student profile
    const trimmedValue = value.toString().trim();
    await Student.findByIdAndUpdate(studentId, {
      $set: { [request.fieldPath]: trimmedValue },
    });

    // Mark as completed
    request.completedBy.push({
      student: studentId,
      value: trimmedValue,
      completedAt: new Date(),
    });
    await request.save();

    res.json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─── Helpers ──────────────────────────────────────────────────

function getNestedValue(obj, path) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

async function countTargetedStudents(request) {
  const filter = buildStudentFilter(request);
  return Student.countDocuments(filter);
}

async function getTargetedStudentList(request) {
  const filter = buildStudentFilter(request);
  return Student.find(filter)
    .select(
      "studentDetails.firstName studentDetails.lastName academicDetails.rollNumber academicDetails.batch",
    )
    .sort({ "academicDetails.rollNumber": 1 })
    .lean();
}

function buildStudentFilter(request) {
  const filter = { status: "active" };

  switch (request.targetType) {
    case "batch":
      filter["academicDetails.batch.id"] = { $in: request.targetBatches };
      break;
    case "program":
      filter["academicDetails.program"] = request.targetProgram;
      break;
    case "individual":
      filter._id = { $in: request.targetStudents };
      break;
    // "all" = no extra filter
  }

  return filter;
}
