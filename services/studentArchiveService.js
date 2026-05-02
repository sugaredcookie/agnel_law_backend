import Student from "../models/studentModel.js";
import ArchivedStudent from "../models/archivedStudentModel.js";
import Application from "../models/applicationModel.js";

// Archive a single student - moves them from Student collection to ArchivedStudent
const archiveStudent = async (studentId, reason, options = {}) => {
  const { note = "", archivedBy = null, updateApplication = true } = options;

  const student = await Student.findById(studentId);
  if (!student) {
    throw new Error("Student not found");
  }

  // Create archived student record
  const archivedStudentData = {
    originalStudentId: student._id,
    archiveReason: reason,
    archiveNote: note,
    archivedAt: new Date(),
    archivedBy: archivedBy,

    // Copy all student data
    studentDetails: student.studentDetails,
    familyBackground: student.familyBackground,
    originalStatus: student.status,
    academicDetails: student.academicDetails,
    certificates: student.certificates,
    studentId: student.studentId,
    loginStudentId: student.loginStudentId,
    password: student.password,
    originalCreatedAt: student.createdAt,
    originalUpdatedAt: student.updatedAt,
  };

  const archivedStudent = new ArchivedStudent(archivedStudentData);
  await archivedStudent.save();

  // Update application status if requested
  if (updateApplication && student.loginStudentId) {
    await Application.findOneAndUpdate(
      { loginStudentId: student.loginStudentId },
      { formStatusFromAdmin: "Cancelled" },
    );
  }

  // Delete from active students collection
  await Student.findByIdAndDelete(studentId);

  return archivedStudent;
};

// Archive multiple students
const archiveStudents = async (studentIds, reason, options = {}) => {
  const results = {
    success: [],
    failed: [],
  };

  for (const studentId of studentIds) {
    try {
      const archived = await archiveStudent(studentId, reason, options);
      results.success.push({
        originalId: studentId,
        archivedId: archived._id,
      });
    } catch (error) {
      results.failed.push({
        studentId,
        error: error.message,
      });
    }
  }

  return results;
};

// Restore a student from archive back to active
const restoreStudent = async (archivedStudentId, options = {}) => {
  const { restoredBy = null, restoreStatus = "active" } = options;

  const archivedStudent = await ArchivedStudent.findById(archivedStudentId);
  if (!archivedStudent) {
    throw new Error("Archived student not found");
  }

  // Check if student already exists (by roll number or email)
  const existingStudent = await Student.findOne({
    $or: [
      { "academicDetails.rollNumber": archivedStudent.academicDetails.rollNumber },
      { "studentDetails.emailAddress": archivedStudent.studentDetails.emailAddress },
    ],
    status: "active",
  });

  if (existingStudent) {
    throw new Error("Student with same roll number or email already exists as active");
  }

  // Restore student to active collection
  const restoredStudentData = {
    studentDetails: archivedStudent.studentDetails,
    familyBackground: archivedStudent.familyBackground,
    status: restoreStatus,
    academicDetails: archivedStudent.academicDetails,
    certificates: archivedStudent.certificates,
    studentId: archivedStudent.studentId,
    loginStudentId: archivedStudent.loginStudentId,
    password: archivedStudent.password,
  };

  const restoredStudent = new Student(restoredStudentData);
  await restoredStudent.save();

  // Update application if exists
  if (archivedStudent.loginStudentId) {
    await Application.findOneAndUpdate(
      { loginStudentId: archivedStudent.loginStudentId },
      { formStatusFromAdmin: "Student Admitted" },
    );
  }

  // Delete from archived collection
  await ArchivedStudent.findByIdAndDelete(archivedStudentId);

  return restoredStudent;
};

// Get archived students with pagination and filters
const getArchivedStudents = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    reason = null,
    program = null,
    batch = null,
    searchText = null,
  } = options;

  const skip = (page - 1) * limit;
  const filters = {};

  if (reason) {
    filters.archiveReason = reason;
  }
  if (program) {
    filters["academicDetails.program"] = program;
  }
  if (batch) {
    filters["academicDetails.batch.name"] = batch;
  }
  if (searchText) {
    const searchRegex = new RegExp(searchText, "i");
    filters.$or = [
      { "studentDetails.firstName": searchRegex },
      { "studentDetails.lastName": searchRegex },
      { "academicDetails.rollNumber": searchRegex },
    ];
  }

  const [students, total] = await Promise.all([
    ArchivedStudent.find(filters)
      .skip(skip)
      .limit(limit)
      .sort({ archivedAt: -1 })
      .lean(),
    ArchivedStudent.countDocuments(filters),
  ]);

  return {
    students,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};

// Get archive statistics
const getArchiveStats = async () => {
  const stats = await ArchivedStudent.aggregate([
    {
      $group: {
        _id: "$archiveReason",
        count: { $sum: 1 },
      },
    },
  ]);

  const total = await ArchivedStudent.countDocuments();

  return {
    total,
    byReason: stats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
  };
};

export default {
  archiveStudent,
  archiveStudents,
  restoreStudent,
  getArchivedStudents,
  getArchiveStats,
};
