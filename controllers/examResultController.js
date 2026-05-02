import ExamResult from "../models/examResultModel.js";
import RegularExamSession from "../models/regularExamSessionModel.js";
import ATKTExamSession from "../models/atktExamSessionModel.js";
import RegularExamEnrollment from "../models/regularExamEnrollmentModel.js";
import ATKTForm from "../models/atktFormModel.js";
import ATKTSubjectConfig from "../models/atktSubjectConfigModel.js";
import Student from "../models/studentModel.js";
import Subject from "../models/subjectModel.js";
import mongoose from "mongoose";
import {
  createWorkbook,
  sendExcelResponse,
} from "../utils/excelHelper.js";
import { resolveRole } from "../middlewares/AuthMiddleware.js";
import MarkAuditLog from "../models/markAuditLogModel.js";
import MarkChangeRequest from "../models/markChangeRequestModel.js";

/**
 * Resolve enteredByType from JWT payload.
 */
const resolveEnteredByType = (user) => {
  const role = user?._resolvedRole || resolveRole(user || {});
  if (role === "faculty") return "Faculty";
  if (role === "examiner") return "Examiner";
  return "User"; // admin or unknown
};

const getInternalComponents = (subject) => {
  const internalScheme = subject?.markingScheme?.find(
    (scheme) => scheme.name?.toLowerCase() === "internal"
  );

  if (!internalScheme) return [];

  const validBreakdown = internalScheme.breakdown?.filter(
    (item) => item.value != null && item.value > 0
  );

  if (validBreakdown && validBreakdown.length > 0) {
    return validBreakdown.map((item) => ({
      name: item.name,
      maxMarks: item.value,
    }));
  }

  if (internalScheme.value != null) {
    return [{ name: "Internal", maxMarks: internalScheme.value }];
  }

  return [];
};

const updateStudentInternalMarks = async ({
  studentId,
  subjectId,
  internalMarks,
}) => {
  if (!internalMarks || internalMarks.length === 0) return;

  const student = await Student.findById(studentId);
  if (!student) return;

  const subjectIndex = student.academicDetails.subjects.findIndex(
    (subjectItem) =>
      subjectItem.subject &&
      subjectItem.subject.toString() === subjectId.toString(),
  );

  const internalNames = new Set(internalMarks.map((mark) => mark.schemeName));
  const normalizedInternalMarks = internalMarks.map((mark) => ({
    schemeName: mark.schemeName,
    obtainedMarks: Number(mark.obtainedMarks) || 0,
  }));

  if (subjectIndex === -1) {
    student.academicDetails.subjects.push({
      subject: subjectId,
      marks: normalizedInternalMarks,
    });
  } else {
    const existingMarks =
      student.academicDetails.subjects[subjectIndex].marks || [];
    const preservedMarks = existingMarks.filter(
      (mark) => !internalNames.has(mark.schemeName),
    );
    student.academicDetails.subjects[subjectIndex].marks = [
      ...preservedMarks,
      ...normalizedInternalMarks,
    ];
  }

  await student.save();
};

/**
 * Get all exam sessions (both Regular and ATKT) for marks entry
 */
export const getExamSessionsForMarks = async (req, res) => {
  try {
    const { type, status } = req.query;

    let regularSessions = [];
    let atktSessions = [];

    const sessionFilter = {};
    if (status) sessionFilter.status = status;

    if (!type || type === "regular") {
      regularSessions = await RegularExamSession.find(sessionFilter)
        .select("title academicYear term examType status isActive examStartDate examEndDate")
        .sort({ createdAt: -1 })
        .lean();

      regularSessions = regularSessions.map((s) => ({
        ...s,
        sessionType: "regular",
        examSessionType: "RegularExamSession",
      }));
    }

    if (!type || type === "atkt") {
      atktSessions = await ATKTExamSession.find(sessionFilter)
        .select("title academicYear term status isActive examStartDate examEndDate")
        .sort({ createdAt: -1 })
        .lean();

      atktSessions = atktSessions.map((s) => ({
        ...s,
        sessionType: "atkt",
        examSessionType: "ATKTExamSession",
      }));
    }

    const allSessions = [...regularSessions, ...atktSessions].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.status(200).json({ success: true, sessions: allSessions });
  } catch (error) {
    console.error("Error fetching exam sessions:", error);
    res.status(500).json({ success: false, message: "Failed to fetch exam sessions" });
  }
};

/**
 * Get students enrolled in an exam session with their subjects
 */
export const getSessionStudentsForMarks = async (req, res) => {
  try {
    const { sessionId, sessionType } = req.params;
    const { batch, course, subjectId } = req.query;

    let enrollments = [];
    let session = null;

    if (sessionType === "regular") {
      session = await RegularExamSession.findById(sessionId).lean();
      if (!session) {
        return res.status(404).json({ success: false, message: "Session not found" });
      }

      const enrollmentQuery = { examSessionId: sessionId };
      if (batch) enrollmentQuery.batch = batch;
      if (course) enrollmentQuery.course = course;

      enrollments = await RegularExamEnrollment.find(enrollmentQuery)
        .populate("studentId", "studentDetails academicDetails")
        .sort({ rollNumber: 1 })
        .lean();

      enrollments = enrollments.map((e) => ({
        _id: e._id,
        studentId: e.studentId?._id,
        studentName: e.studentName,
        rollNumber: e.rollNumber,
        course: e.course,
        batch: e.batch,
        batchLabel: e.batchLabel,
        pattern: e.pattern,
        subjects: e.subjects.filter((s) => s.type === "subject"),
        studentDetails: e.studentId?.studentDetails,
      }));
    } else if (sessionType === "atkt") {
      session = await ATKTExamSession.findById(sessionId).lean();
      if (!session) {
        return res.status(404).json({ success: false, message: "Session not found" });
      }

      const formQuery = { examSessionId: sessionId, paymentStatus: "paid" };
      if (batch) formQuery.batch = batch;
      if (course) formQuery.course = course;

      const forms = await ATKTForm.find(formQuery)
        .populate("submittedBy", "studentDetails academicDetails")
        .sort({ rollNumber: 1 })
        .lean();

      enrollments = forms.map((f) => ({
        _id: f._id,
        studentId: f.submittedBy?._id || null,
        studentName: f.studentName,
        rollNumber: f.rollNumber,
        course: f.course,
        batch: f.batch,
        batchLabel: f.batch,
        pattern: f.pattern,
        subjects: f.subjects.filter((s) => s.type !== "section"),
        isAtkt: true,
      }));
    } else {
      return res.status(400).json({ success: false, message: "Invalid session type" });
    }

    // If subjectId filter provided, filter enrollments that have that subject
    if (subjectId) {
      enrollments = enrollments.filter((e) =>
        e.subjects.some((s) => s.id === subjectId || s._id?.toString() === subjectId)
      );
    }

    // Get existing results for these students in this session
    const studentIds = enrollments.map((e) => e.studentId).filter(Boolean);
    const existingResults = await ExamResult.find({
      examSessionId: sessionId,
      studentId: { $in: studentIds },
    }).lean();

    const resultsMap = {};
    existingResults.forEach((r) => {
      const key = `${r.studentId}-${r.subjectId}`;
      resultsMap[key] = r;
    });

    // Attach existing results to enrollments
    enrollments = enrollments.map((e) => ({
      ...e,
      subjectsWithResults: e.subjects.map((s) => {
        const resultKey = `${e.studentId}-${s.id || s._id}`;
        return {
          ...s,
          result: resultsMap[resultKey] || null,
        };
      }),
    }));

    res.status(200).json({
      success: true,
      session: {
        ...session,
        sessionType,
        examSessionType: sessionType === "regular" ? "RegularExamSession" : "ATKTExamSession",
      },
      enrollments,
      totalCount: enrollments.length,
    });
  } catch (error) {
    console.error("Error fetching session students:", error);
    res.status(500).json({ success: false, message: "Failed to fetch students" });
  }
};

/**
 * Get unique batches/courses for a session
 */
export const getSessionFilters = async (req, res) => {
  try {
    const { sessionId, sessionType } = req.params;

    let filters = { batches: [], courses: [], patterns: [] };

    if (sessionType === "regular") {
      const enrollments = await RegularExamEnrollment.find({ examSessionId: sessionId })
        .select("batch batchLabel course pattern")
        .lean();

      filters.batches = [...new Set(enrollments.map((e) => e.batch))];
      filters.batchLabels = [...new Set(enrollments.map((e) => e.batchLabel))];
      filters.courses = [...new Set(enrollments.map((e) => e.course))];
      filters.patterns = [...new Set(enrollments.map((e) => e.pattern))];
    } else if (sessionType === "atkt") {
      const forms = await ATKTForm.find({ examSessionId: sessionId, paymentStatus: "paid" })
        .select("batch course pattern")
        .lean();

      filters.batches = [...new Set(forms.map((f) => f.batch))];
      filters.courses = [...new Set(forms.map((f) => f.course))];
      filters.patterns = [...new Set(forms.map((f) => f.pattern))];
    }

    res.status(200).json({ success: true, filters });
  } catch (error) {
    console.error("Error fetching session filters:", error);
    res.status(500).json({ success: false, message: "Failed to fetch filters" });
  }
};

/**
 * Get subjects for a session (based on enrollments)
 * Includes marking scheme for proper display in examiner marks entry
 */
export const getSessionSubjects = async (req, res) => {
  try {
    const { sessionId, sessionType } = req.params;
    const { batch, course } = req.query;

    let subjectsMap = new Map();

    if (sessionType === "regular") {
      const query = { examSessionId: sessionId };
      if (batch) query.batch = batch;
      if (course) query.course = course;

      const enrollments = await RegularExamEnrollment.find(query)
        .select("subjects")
        .lean();

      // Collect unique subjectIds first
      const subjectIds = new Set();
      enrollments.forEach((e) => {
        e.subjects.forEach((s) => {
          if (s.subjectId) {
            subjectIds.add(s.subjectId.toString());
          }
        });
      });

      // Fetch full subject details including marking scheme
      const subjectDocs = await Subject.find({ _id: { $in: Array.from(subjectIds) } })
        .select("subjectName subjectCode markingScheme")
        .lean();

      const subjectDetailsMap = new Map();
      subjectDocs.forEach((doc) => {
        subjectDetailsMap.set(doc._id.toString(), doc);
      });

      // Build subjects map with marking scheme
      enrollments.forEach((e) => {
        e.subjects.forEach((s) => {
          const subjectIdStr = s.subjectId?.toString();
          if (subjectIdStr && !subjectsMap.has(subjectIdStr)) {
            const subjectDoc = subjectDetailsMap.get(subjectIdStr);
            subjectsMap.set(subjectIdStr, { 
              id: subjectIdStr,
              label: subjectDoc?.subjectName || s.label,
              subjectCode: subjectDoc?.subjectCode,
              markingScheme: subjectDoc?.markingScheme || null,
            });
          }
        });
      });
    } else if (sessionType === "atkt") {
      // For ATKT, get subjects from ATKTSubjectConfig (master config) 
      // which contains the linked subjects for each batch/pattern
      const configQuery = { examSessionId: sessionId, isActive: true };
      if (batch) configQuery.batch = batch;
      if (course) configQuery.course = course;

      const configs = await ATKTSubjectConfig.find(configQuery)
        .populate("subjects.subjectId", "subjectName subjectCode markingScheme")
        .lean();

      configs.forEach((config) => {
        config.subjects.forEach((s) => {
          // Only include linked subjects (with valid subjectId), exclude sections
          if (s.type !== "section" && s.subjectId && !subjectsMap.has(s.subjectId._id.toString())) {
            subjectsMap.set(s.subjectId._id.toString(), { 
              id: s.subjectId._id.toString(),
              label: s.subjectId.subjectName || s.label,
              subjectCode: s.subjectId.subjectCode,
              markingScheme: s.subjectId.markingScheme || null,
            });
          }
        });
      });
    }

    const subjects = Array.from(subjectsMap.values());

    // Warn if there are unlinked subjects
    const hasUnlinkedSubjects = subjects.length === 0;
    
    res.status(200).json({ 
      success: true, 
      subjects,
      warning: hasUnlinkedSubjects ? "No linked subjects found. Please link subjects via Subject Linking." : undefined,
    });
  } catch (error) {
    console.error("Error fetching session subjects:", error);
    res.status(500).json({ success: false, message: "Failed to fetch subjects" });
  }
};

/**
 * Get students for marks entry for a specific subject in a session
 * subjectId must be a valid MongoDB ObjectId (from Subject Linking)
 */
export const getStudentsForSubjectMarks = async (req, res) => {
  try {
    const { sessionId, sessionType, subjectId } = req.params;
    const { batch, course } = req.query;

    // Handle "__all__" to return all students in the session
    const isAllSubjects = subjectId === "__all__";

    // Validate subjectId is a valid MongoDB ObjectId
    if (!isAllSubjects) {
      const isValidObjectId = mongoose.Types.ObjectId.isValid(subjectId) && 
        String(new mongoose.Types.ObjectId(subjectId)) === subjectId;
      
      if (!isValidObjectId) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid subjectId. Subject linking is required." 
        });
      }
    }

    // Get subject details for marking scheme
    let subject = null;
    if (!isAllSubjects) {
      subject = await Subject.findById(subjectId).lean();
      if (!subject) {
        return res.status(404).json({ 
          success: false, 
          message: "Subject not found. Please ensure Subject Linking is configured." 
        });
      }
    }

    let session = null;
    let students = [];

    if (sessionType === "regular") {
      session = await RegularExamSession.findById(sessionId).lean();
      if (!session) {
        return res.status(404).json({ success: false, message: "Session not found" });
      }

      const query = { examSessionId: sessionId };
      if (batch) query.batch = batch;
      if (course) query.course = course;

      const enrollments = await RegularExamEnrollment.find(query)
        .populate("studentId", "studentDetails academicDetails")
        .sort({ rollNumber: 1 })
        .lean();

      // Filter to students who have this subject linked (by subjectId ObjectId)
      students = enrollments
        .filter((e) => isAllSubjects || e.subjects.some((s) => s.subjectId?.toString() === subjectId))
        .map((e) => ({
          enrollmentId: e._id,
          studentId: e.studentId?._id,
          studentName: e.studentName,
          rollNumber: e.rollNumber,
          course: e.course,
          batch: e.batch,
          batchLabel: e.batchLabel,
          pattern: e.pattern,
          subjects: isAllSubjects ? e.subjects.filter((s) => s.subjectId) : undefined,
        }));
    } else if (sessionType === "atkt") {
      session = await ATKTExamSession.findById(sessionId).lean();
      if (!session) {
        return res.status(404).json({ success: false, message: "Session not found" });
      }

      const query = { examSessionId: sessionId, paymentStatus: "paid" };
      if (batch) query.batch = batch;
      if (course) query.course = course;

      const forms = await ATKTForm.find(query).sort({ rollNumber: 1 }).lean();

      // Filter to students who have this subject linked (by subjectId ObjectId)
      students = forms
        .filter((f) => isAllSubjects || f.subjects.some((s) => s.subjectId?.toString() === subjectId))
        .map((f) => ({
          formId: f._id,
          studentId: f.submittedBy,
          studentName: f.studentName,
          rollNumber: f.rollNumber,
          course: f.course,
          batch: f.batch,
          batchLabel: f.batch,
          pattern: f.pattern,
          subjects: isAllSubjects ? f.subjects.filter((s) => s.type !== "section" && s.subjectId) : undefined,
        }));

      // Calculate attempt number for ATKT (skip if loading all subjects)
      if (!isAllSubjects) {
        for (let student of students) {
          const previousAttempts = await ExamResult.countDocuments({
            studentId: student.studentId,
            subjectId,
            examType: "atkt",
            examSessionId: { $ne: sessionId },
          });
          student.attemptNumber = previousAttempts + 1;
        }
      }
    }

    // Get existing results
    const studentIds = students.map((s) => s.studentId).filter(Boolean);
    const resultQuery = { examSessionId: sessionId, studentId: { $in: studentIds } };
    if (!isAllSubjects) {
      resultQuery.subjectId = subjectId;
    }
    const existingResults = await ExamResult.find(resultQuery).lean();

    const resultsMap = {};
    existingResults.forEach((r) => {
      const key = isAllSubjects ? `${r.studentId}-${r.subjectId}` : r.studentId.toString();
      resultsMap[key] = r;
    });

    // Fetch faculty-entered internal marks from Student model
    // Only for Regular exams with linked subjects
    let facultyMarksMap = {};
    if (!isAllSubjects && sessionType === "regular") {
      const studentsWithMarks = await Student.find({
        _id: { $in: studentIds },
      })
        .select("academicDetails.subjects")
        .lean();

      // Normalize subjectId for comparison (ensure string)
      const targetSubjectId = String(subjectId);

      studentsWithMarks.forEach((student) => {
        // Match by Subject ObjectId - ensure both sides are strings for comparison
        const subjectData = student.academicDetails?.subjects?.find((s) => {
          if (!s.subject) return false;
          // Handle both ObjectId and string formats
          const studentSubjectId = s.subject._id 
            ? String(s.subject._id) 
            : String(s.subject);
          return studentSubjectId === targetSubjectId;
        });
        if (subjectData?.marks?.length > 0) {
          facultyMarksMap[student._id.toString()] = subjectData.marks;
        }
      });
    }

    // Query pending change requests for this session+subject
    let pendingRequestsMap = {};
    if (!isAllSubjects) {
      const pendingRequests = await MarkChangeRequest.find({
        examSessionId: sessionId,
        subjectId,
        status: "pending",
      }).lean();
      pendingRequests.forEach((pr) => {
        pendingRequestsMap[pr.studentId.toString()] = pr;
      });
    }

    students = students.map((s) => {
      const resultKey = isAllSubjects ? null : s.studentId?.toString();
      const existingResult = !isAllSubjects && s.studentId ? resultsMap[resultKey] || null : null;
      const facultyMarks = !isAllSubjects && s.studentId ? facultyMarksMap[s.studentId.toString()] || [] : [];

      // For "all subjects" view, attach all results for this student
      if (isAllSubjects && s.subjects) {
        const subjectsWithResults = s.subjects.map((subj) => {
          const key = `${s.studentId}-${subj.subjectId}`;
          return {
            ...subj,
            result: resultsMap[key] || null,
          };
        });
        return { ...s, subjectsWithResults };
      }

      const hasExistingMarks = !!existingResult;
      const pendingChangeRequest = s.studentId ? pendingRequestsMap[s.studentId.toString()] || null : null;

      return {
        ...s,
        existingResult,
        facultyMarks,
        hasExistingMarks,
        isLockedForFaculty: hasExistingMarks,
        pendingChangeRequest: pendingChangeRequest ? {
          _id: pendingChangeRequest._id,
          status: pendingChangeRequest.status,
          proposedMarks: pendingChangeRequest.proposedMarks,
          remark: pendingChangeRequest.remark,
          createdAt: pendingChangeRequest.createdAt,
        } : null,
      };
    });

    res.status(200).json({
      success: true,
      session: {
        _id: session._id,
        title: session.title,
        academicYear: session.academicYear,
        term: session.term,
        sessionType,
        examSessionType: sessionType === "regular" ? "RegularExamSession" : "ATKTExamSession",
      },
      subject: isAllSubjects ? { _id: "__all__", subjectName: "All Subjects" } : (subject || { _id: subjectId, subjectName: subjectId }),
      students,
      totalCount: students.length,
      isAllSubjects,
      // For ATKT exams, include pattern-based marking scheme
      atktPatterns: sessionType === "atkt" ? [...new Set(students.map((s) => s.pattern))] : undefined,
    });
  } catch (error) {
    console.error("Error fetching students for subject marks:", error);
    res.status(500).json({ success: false, message: "Failed to fetch students" });
  }
};

/**
 * Save or update marks for a student
 */
export const saveStudentMarks = async (req, res) => {
  try {
    const {
      sessionId,
      sessionType,
      studentId,
      subjectId,
      marks,
      remarks,
    } = req.body;

    const userId = req.user?.id || req.user?.examinerId || req.user?.facultyId;

    // Validate marks array is not empty
    if (!marks || !Array.isArray(marks) || marks.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "At least one mark entry is required" 
      });
    }

    // Validate session
    let session;
    if (sessionType === "regular") {
      session = await RegularExamSession.findById(sessionId);
    } else if (sessionType === "atkt") {
      session = await ATKTExamSession.findById(sessionId);
    }

    if (!session) {
      return res.status(404).json({ success: false, message: "Exam session not found" });
    }

    // Validate subjectId is a valid MongoDB ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(subjectId) && 
      String(new mongoose.Types.ObjectId(subjectId)) === subjectId;

    if (!isValidObjectId) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid subjectId. Subject linking is required." 
      });
    }

    // Get subject for validation (but for ATKT, marking scheme comes from pattern)
    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ 
        success: false, 
        message: "Subject not found. Please ensure Subject Linking is configured." 
      });
    }

    // For ATKT, get the pattern from the student's ATKT form
    let atktPattern = null;
    if (sessionType === "atkt") {
      const atktForm = await ATKTForm.findOne({
        examSessionId: sessionId,
        submittedBy: studentId,
        paymentStatus: "paid",
      }).lean();
      atktPattern = atktForm?.pattern;
    }

    // Calculate attempt number for ATKT
    let attemptNumber = 1;
    if (sessionType === "atkt") {
      const previousAttempts = await ExamResult.countDocuments({
        studentId,
        subjectId,
        examType: "atkt",
      });
      attemptNumber = previousAttempts + 1;

      // Check if this is an update to existing result
      const existingInSession = await ExamResult.findOne({
        examSessionId: sessionId,
        studentId,
        subjectId,
      });
      if (existingInSession) {
        attemptNumber = existingInSession.attemptNumber;
      }
    }

    // Get student snapshot
    const student = await Student.findById(studentId).lean();
    const studentSnapshot = student
      ? {
          rollNumber: student.academicDetails?.rollNumber,
          name: `${student.studentDetails?.firstName || ""} ${student.studentDetails?.lastName || ""}`.trim(),
          batch: student.academicDetails?.batch?.name,
          course: student.academicDetails?.program,
        }
      : {};

    // Sync internal marks to student model for regular exams
    if (sessionType === "regular") {
      const internalComponents = getInternalComponents(subject);
      const internalNames = new Set(internalComponents.map((c) => c.name));
      const internalMarks = marks.filter((mark) =>
        internalNames.has(mark.schemeName),
      );
      await updateStudentInternalMarks({
        studentId,
        subjectId,
        internalMarks,
      });
    }

    // Prepare marks with max values
    // For ATKT: use pattern-based max marks (e.g., "75:25" = External:Internal)
    // For Regular: use subject marking scheme
    const marksWithMax = marks.map((m) => {
      let maxMarks = m.maxMarks;
      if (!maxMarks) {
        if (sessionType === "atkt" && atktPattern) {
          // Parse pattern "75:25" or "60:40" (External:Internal format)
          const [externalMax, internalMax] = atktPattern.split(":").map(Number);
          if (m.schemeName.toLowerCase() === "external" || m.schemeName.toLowerCase() === "theory") {
            maxMarks = externalMax || 0;
          } else if (m.schemeName.toLowerCase() === "internal" || m.schemeName.toLowerCase() === "practical") {
            maxMarks = internalMax || 0;
          }
        } else if (subject) {
          // Regular exam - use subject marking scheme
          if (m.schemeName.toLowerCase() === "external") {
            const ext = subject.markingScheme?.find((s) => s.name.toLowerCase() === "external");
            maxMarks = ext?.value || 0;
          } else {
            const int = subject.markingScheme?.find((s) => s.name.toLowerCase() === "internal");
            const breakdown = int?.breakdown?.find((b) => b.name === m.schemeName);
            maxMarks = breakdown?.value || int?.value || 0;
          }
        }
      }
      return {
        schemeName: m.schemeName,
        obtainedMarks: Number(m.obtainedMarks) || 0,
        maxMarks: maxMarks || 0,
      };
    });

    // Find or create result
    let result = await ExamResult.findOne({
      examSessionId: sessionId,
      studentId,
      subjectId,
    });

    const callerRole = req.user?._resolvedRole;
    let previousMarks = null;
    let isNewResult = false;

    if (result) {
      // Guard: reject if published
      if (result.isPublished) {
        return res.status(403).json({
          success: false,
          message: "Cannot edit marks: result is published. Unpublish first.",
        });
      }
      // Faculty lock: if caller is faculty and result already exists, reject
      if (callerRole === "faculty") {
        return res.status(403).json({
          success: false,
          message: "Marks already entered. Use change request to modify.",
        });
      }
      // Snapshot previous marks for audit
      previousMarks = (result.marks || []).map((m) => ({
        schemeName: m.schemeName,
        obtainedMarks: m.obtainedMarks,
        maxMarks: m.maxMarks,
      }));
      // Update existing
      result.marks = marksWithMax;
      result.remarks = remarks;
      result.enteredBy = userId;
      result.enteredByType = resolveEnteredByType(req.user);
      result.status = "draft";
    } else {
      isNewResult = true;
      // Create new
      result = new ExamResult({
        studentId,
        subjectId,
        examSessionId: sessionId,
        examSessionType: sessionType === "regular" ? "RegularExamSession" : "ATKTExamSession",
        examType: sessionType,
        attemptNumber,
        academicYear: session.academicYear,
        term: session.term,
        studentSnapshot,
        marks: marksWithMax,
        remarks,
        enteredBy: userId,
        enteredByType: resolveEnteredByType(req.user),
        status: "draft",
      });
    }

    await result.save();

    // Audit log
    await MarkAuditLog.create({
      examResultId: result._id,
      examSessionId: sessionId,
      studentId,
      subjectId,
      action: isNewResult ? "marks_entered" : "marks_updated",
      previousMarks: previousMarks || [],
      newMarks: marksWithMax,
      performedBy: userId,
      performedByType: resolveEnteredByType(req.user),
      remark: isNewResult ? "Initial marks entry" : "Marks updated",
    });

    res.status(200).json({
      success: true,
      message: "Marks saved successfully",
      result,
    });
  } catch (error) {
    console.error("Error saving marks:", error);
    res.status(500).json({ success: false, message: "Failed to save marks", error: error.message });
  }
};

/**
 * Bulk save marks for multiple students
 */
export const bulkSaveMarks = async (req, res) => {
  try {
    const { sessionId, sessionType, subjectId, studentsMarks } = req.body;
    const userId = req.user?.id || req.user?.examinerId || req.user?.facultyId;

    // Validate session
    let session;
    if (sessionType === "regular") {
      session = await RegularExamSession.findById(sessionId);
    } else if (sessionType === "atkt") {
      session = await ATKTExamSession.findById(sessionId);
    }

    if (!session) {
      return res.status(404).json({ success: false, message: "Exam session not found" });
    }

    // Validate subjectId is a valid MongoDB ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(subjectId) && 
      String(new mongoose.Types.ObjectId(subjectId)) === subjectId;

    if (!isValidObjectId) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid subjectId. Subject linking is required." 
      });
    }

    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ 
        success: false, 
        message: "Subject not found. Please ensure Subject Linking is configured." 
      });
    }

    // For ATKT, preload all ATKT forms for pattern lookup
    let atktFormsMap = {};
    if (sessionType === "atkt") {
      const studentIds = studentsMarks.map((s) => s.studentId);
      const atktForms = await ATKTForm.find({
        examSessionId: sessionId,
        submittedBy: { $in: studentIds },
        paymentStatus: "paid",
      }).lean();
      atktForms.forEach((f) => {
        atktFormsMap[f.submittedBy?.toString()] = f.pattern;
      });
    }

    const callerRole = req.user?._resolvedRole;
    const results = [];
    const errors = [];

    for (const studentData of studentsMarks) {
      try {
        const { studentId, marks, remarks } = studentData;

        if (sessionType === "regular") {
          const internalComponents = getInternalComponents(subject);
          const internalNames = new Set(internalComponents.map((c) => c.name));
          const internalMarks = marks.filter((mark) =>
            internalNames.has(mark.schemeName),
          );
          await updateStudentInternalMarks({
            studentId,
            subjectId,
            internalMarks,
          });
        }

        // Get pattern for ATKT exams
        const atktPattern = sessionType === "atkt" ? atktFormsMap[studentId] : null;

        // Prepare marks with max values
        // For ATKT: use pattern-based max marks (e.g., "75:25" = External:Internal)
        // For Regular: use subject marking scheme
        const marksWithMax = marks.map((m) => {
          let maxMarks = m.maxMarks;
          if (!maxMarks) {
            if (sessionType === "atkt" && atktPattern) {
              // Parse pattern "75:25" or "60:40" (External:Internal format)
              const [externalMax, internalMax] = atktPattern.split(":").map(Number);
              if (m.schemeName.toLowerCase() === "external" || m.schemeName.toLowerCase() === "theory") {
                maxMarks = externalMax || 0;
              } else if (m.schemeName.toLowerCase() === "internal" || m.schemeName.toLowerCase() === "practical") {
                maxMarks = internalMax || 0;
              }
            } else if (subject) {
              // Regular exam - use subject marking scheme
              if (m.schemeName.toLowerCase() === "external") {
                const ext = subject.markingScheme?.find((s) => s.name.toLowerCase() === "external");
                maxMarks = ext?.value || 0;
              } else {
                const int = subject.markingScheme?.find((s) => s.name.toLowerCase() === "internal");
                const breakdown = int?.breakdown?.find((b) => b.name === m.schemeName);
                maxMarks = breakdown?.value || int?.value || 0;
              }
            }
          }
          return {
            schemeName: m.schemeName,
            obtainedMarks: Number(m.obtainedMarks) || 0,
            maxMarks: maxMarks || 0,
          };
        });

        let result = await ExamResult.findOne({
          examSessionId: sessionId,
          studentId,
          subjectId,
        });

        let previousMarks = null;
        let isNewResult = false;

        if (result) {
          // Guard: skip published results
          if (result.isPublished) {
            errors.push({ studentId, error: "Cannot edit: result is published" });
            continue;
          }
          // Faculty lock: if caller is faculty and result already exists, skip
          if (callerRole === "faculty") {
            errors.push({ studentId, error: "Marks already entered. Use change request to modify." });
            continue;
          }
          previousMarks = (result.marks || []).map((m) => ({
            schemeName: m.schemeName,
            obtainedMarks: m.obtainedMarks,
            maxMarks: m.maxMarks,
          }));
          result.marks = marksWithMax;
          result.remarks = remarks;
          result.enteredBy = userId;
          result.enteredByType = resolveEnteredByType(req.user);
        } else {
          isNewResult = true;
          let attemptNumber = 1;
          if (sessionType === "atkt") {
            const previousAttempts = await ExamResult.countDocuments({
              studentId,
              subjectId,
              examType: "atkt",
            });
            attemptNumber = previousAttempts + 1;
          }

          const student = await Student.findById(studentId).lean();
          const studentSnapshot = student
            ? {
                rollNumber: student.academicDetails?.rollNumber,
                name: `${student.studentDetails?.firstName || ""} ${student.studentDetails?.lastName || ""}`.trim(),
                batch: student.academicDetails?.batch?.name,
                course: student.academicDetails?.program,
              }
            : {};

          result = new ExamResult({
            studentId,
            subjectId,
            examSessionId: sessionId,
            examSessionType: sessionType === "regular" ? "RegularExamSession" : "ATKTExamSession",
            examType: sessionType,
            attemptNumber,
            academicYear: session.academicYear,
            term: session.term,
            studentSnapshot,
            marks: marksWithMax,
            remarks,
            enteredBy: userId,
            enteredByType: resolveEnteredByType(req.user),
            status: "draft",
          });
        }

        await result.save();

        // Audit log
        await MarkAuditLog.create({
          examResultId: result._id,
          examSessionId: sessionId,
          studentId,
          subjectId,
          action: isNewResult ? "marks_entered" : "marks_updated",
          previousMarks: previousMarks || [],
          newMarks: marksWithMax,
          performedBy: userId,
          performedByType: resolveEnteredByType(req.user),
          remark: isNewResult ? "Initial marks entry (bulk)" : "Marks updated (bulk)",
        });

        results.push(result);
      } catch (err) {
        errors.push({ studentId: studentData.studentId, error: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Saved marks for ${results.length} students`,
      savedCount: results.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error bulk saving marks:", error);
    res.status(500).json({ success: false, message: "Failed to save marks", error: error.message });
  }
};

/**
 * Get all results for a session
 */
export const getSessionResults = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { subjectId, batch, status, page = 1, limit = 50 } = req.query;

    const query = { examSessionId: sessionId };
    if (subjectId) query.subjectId = subjectId;
    if (batch) query["studentSnapshot.batch"] = batch;
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const results = await ExamResult.find(query)
      .populate("subjectId", "subjectName subjectCode")
      .sort({ "studentSnapshot.rollNumber": 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await ExamResult.countDocuments(query);

    res.status(200).json({
      success: true,
      results,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching session results:", error);
    res.status(500).json({ success: false, message: "Failed to fetch results" });
  }
};

/**
 * Get student's result history
 */
export const getStudentResultHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { examType, academicYear, subjectId } = req.query;

    const query = { studentId };
    if (examType) query.examType = examType;
    if (academicYear) query.academicYear = academicYear;
    if (subjectId) query.subjectId = subjectId;

    const results = await ExamResult.find(query)
      .populate("subjectId", "subjectName subjectCode")
      .populate("examSessionId", "title academicYear term")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, results });
  } catch (error) {
    console.error("Error fetching student results:", error);
    res.status(500).json({ success: false, message: "Failed to fetch results" });
  }
};

/**
 * Get exam sessions where student is enrolled (for student panel)
 */
export const getMyExamSessions = async (req, res) => {
  try {
    const studentId = req.user?.studentId;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Student not authenticated" });
    }

    // Get regular exam enrollments for this student
    const regularEnrollments = await RegularExamEnrollment.find({ studentId })
      .select("examSessionId")
      .lean();

    // Get ATKT forms for this student (paid only)
    const atktForms = await ATKTForm.find({ submittedBy: studentId, paymentStatus: "paid" })
      .select("examSessionId")
      .lean();

    const regularSessionIds = regularEnrollments.map((e) => e.examSessionId);
    const atktSessionIds = atktForms.map((f) => f.examSessionId);

    // Fetch session details
    const regularSessions = await RegularExamSession.find({ _id: { $in: regularSessionIds } })
      .select("title academicYear term examType status")
      .sort({ createdAt: -1 })
      .lean();

    const atktSessions = await ATKTExamSession.find({ _id: { $in: atktSessionIds } })
      .select("title academicYear term status")
      .sort({ createdAt: -1 })
      .lean();

    // Check which sessions have published results for this student
    const allSessionIds = [...regularSessionIds, ...atktSessionIds];
    const publishedCounts = await ExamResult.aggregate([
      { $match: { studentId: new mongoose.Types.ObjectId(studentId), examSessionId: { $in: allSessionIds }, isPublished: true } },
      { $group: { _id: "$examSessionId", count: { $sum: 1 } } },
    ]);

    const publishedMap = {};
    publishedCounts.forEach((p) => {
      publishedMap[p._id.toString()] = p.count;
    });

    const sessions = [
      ...regularSessions.map((s) => ({
        ...s,
        sessionType: "regular",
        publishedResultsCount: publishedMap[s._id.toString()] || 0,
        hasPublishedResults: (publishedMap[s._id.toString()] || 0) > 0,
      })),
      ...atktSessions.map((s) => ({
        ...s,
        sessionType: "atkt",
        publishedResultsCount: publishedMap[s._id.toString()] || 0,
        hasPublishedResults: (publishedMap[s._id.toString()] || 0) > 0,
      })),
    ].sort((a, b) => (b.hasPublishedResults ? 1 : 0) - (a.hasPublishedResults ? 1 : 0));

    res.status(200).json({ success: true, sessions });
  } catch (error) {
    console.error("Error fetching student exam sessions:", error);
    res.status(500).json({ success: false, message: "Failed to fetch exam sessions" });
  }
};

/**
 * Get student's published results for a session
 */
export const getMyPublishedResults = async (req, res) => {
  try {
    const studentId = req.user?.studentId;
    if (!studentId) {
      return res.status(401).json({ success: false, message: "Student not authenticated" });
    }

    const { sessionId } = req.params;
    const { sessionType } = req.query;

    // Verify the student is enrolled in this session
    let isEnrolled = false;
    let enrollment = null;

    if (sessionType === "regular") {
      enrollment = await RegularExamEnrollment.findOne({ 
        examSessionId: sessionId, 
        studentId 
      }).lean();
      isEnrolled = !!enrollment;
    } else if (sessionType === "atkt") {
      enrollment = await ATKTForm.findOne({ 
        examSessionId: sessionId, 
        submittedBy: studentId,
        paymentStatus: "paid",
      }).lean();
      isEnrolled = !!enrollment;
    }

    if (!isEnrolled) {
      return res.status(403).json({ 
        success: false, 
        message: "You are not enrolled in this exam session" 
      });
    }

    // Get session details
    let session;
    if (sessionType === "regular") {
      session = await RegularExamSession.findById(sessionId)
        .select("title academicYear term examType")
        .lean();
    } else {
      session = await ATKTExamSession.findById(sessionId)
        .select("title academicYear term")
        .lean();
    }

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    // Get PUBLISHED results only (exclude blocked)
    const results = await ExamResult.find({
      examSessionId: sessionId,
      studentId,
      isPublished: true,
      isRestricted: { $ne: true },
    })
      .populate("subjectId", "subjectName subjectCode")
      .sort({ "subjectId.subjectCode": 1 })
      .lean();

    // Calculate totals
    let grandTotalObtained = 0;
    let grandTotalMaximum = 0;
    
    const formattedResults = results.map((r) => {
      grandTotalObtained += r.totalObtained || 0;
      grandTotalMaximum += r.totalMaximum || 0;
      
      return {
        subjectId: r.subjectId?._id,
        subjectName: r.subjectId?.subjectName || "Unknown Subject",
        subjectCode: r.subjectId?.subjectCode || "",
        marks: r.marks,
        internalObtained: r.internalObtained,
        internalMaximum: r.internalMaximum,
        externalObtained: r.externalObtained,
        externalMaximum: r.externalMaximum,
        totalObtained: r.totalObtained,
        totalMaximum: r.totalMaximum,
        percentage: r.percentage,
        grade: r.grade,
        result: r.result,
        remarks: r.remarks,
      };
    });

    res.status(200).json({
      success: true,
      session: {
        ...session,
        sessionType,
      },
      studentInfo: {
        rollNumber: enrollment?.rollNumber || enrollment?.studentSnapshot?.rollNumber,
        name: enrollment?.studentName || enrollment?.studentSnapshot?.name,
        batch: enrollment?.batch || enrollment?.studentSnapshot?.batch,
        course: enrollment?.course || enrollment?.studentSnapshot?.course,
      },
      results: formattedResults,
      summary: {
        totalSubjects: formattedResults.length,
        grandTotalObtained,
        grandTotalMaximum,
        overallPercentage: grandTotalMaximum > 0 
          ? Math.round((grandTotalObtained / grandTotalMaximum) * 10000) / 100 
          : 0,
      },
      hasResults: formattedResults.length > 0,
    });
  } catch (error) {
    console.error("Error fetching student results:", error);
    res.status(500).json({ success: false, message: "Failed to fetch results" });
  }
};

/**
 * Download marks template Excel for a specific subject
 * Examiners can fill this and upload it back
 */
export const downloadSubjectMarksTemplate = async (req, res) => {
  try {
    const { sessionId, sessionType, subjectId } = req.params;
    const { batch, course } = req.query;

    // Validate session
    let session;
    if (sessionType === "regular") {
      session = await RegularExamSession.findById(sessionId).lean();
    } else if (sessionType === "atkt") {
      session = await ATKTExamSession.findById(sessionId).lean();
    }

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    // Get subject
    const subject = await Subject.findById(subjectId).lean();
    if (!subject) {
      return res.status(404).json({ success: false, message: "Subject not found" });
    }

    // Get students for this subject
    let students = [];
    if (sessionType === "regular") {
      const query = { examSessionId: sessionId };
      if (batch) query.batch = batch;
      if (course) query.course = course;

      const enrollments = await RegularExamEnrollment.find(query)
        .populate("studentId", "studentDetails academicDetails")
        .sort({ rollNumber: 1 })
        .lean();

      students = enrollments
        .filter((e) => e.subjects.some((s) => s.subjectId?.toString() === subjectId))
        .map((e) => ({
          studentId: e.studentId?._id?.toString(),
          studentName: e.studentName,
          rollNumber: e.rollNumber,
          batch: e.batch,
          pattern: e.pattern,
        }));
    } else if (sessionType === "atkt") {
      const query = { examSessionId: sessionId, paymentStatus: "paid" };
      if (batch) query.batch = batch;
      if (course) query.course = course;

      const forms = await ATKTForm.find(query).sort({ rollNumber: 1 }).lean();

      students = forms
        .filter((f) => f.subjects.some((s) => s.subjectId?.toString() === subjectId))
        .map((f) => ({
          studentId: f.submittedBy?.toString(),
          studentName: f.studentName,
          rollNumber: f.rollNumber,
          batch: f.batch,
          pattern: f.pattern,
        }));
    }

    // Get existing marks
    const studentIds = students.map((s) => s.studentId).filter(Boolean);
    const existingResults = await ExamResult.find({
      examSessionId: sessionId,
      studentId: { $in: studentIds },
      subjectId,
    }).lean();

    const resultsMap = {};
    existingResults.forEach((r) => {
      resultsMap[r.studentId.toString()] = r;
    });

    // Build marking scheme columns
    const markingColumns = [];
    if (sessionType === "atkt") {
      markingColumns.push({ name: "Internal", maxMarks: 25 });
      markingColumns.push({ name: "External", maxMarks: 75 });
    } else {
      // Regular - use subject marking scheme
      const internalScheme = subject.markingScheme?.find((s) => s.name.toLowerCase() === "internal");
      const externalScheme = subject.markingScheme?.find((s) => s.name.toLowerCase() === "external");
      
      if (internalScheme?.breakdown?.length > 0) {
        internalScheme.breakdown.forEach((b) => {
          markingColumns.push({ name: b.name, maxMarks: b.value || 0 });
        });
      } else if (internalScheme) {
        markingColumns.push({ name: "Internal", maxMarks: internalScheme.value || 25 });
      }
      
      if (externalScheme) {
        markingColumns.push({ name: "External", maxMarks: externalScheme.value || 75 });
      }
    }

    // Create workbook
    const workbook = createWorkbook();
    const worksheet = workbook.addWorksheet("Marks Entry");

    // Header row 1 - Session info
    worksheet.mergeCells("A1:H1");
    worksheet.getCell("A1").value = `${session.title} - ${session.academicYear} - ${subject.subjectName}`;
    worksheet.getCell("A1").font = { bold: true, size: 14 };
    worksheet.getCell("A1").alignment = { horizontal: "center" };

    // Header row 2 - Column headers
    const headers = ["Sr No", "Student ID", "Roll Number", "Student Name", "Batch"];
    markingColumns.forEach((col) => {
      headers.push(`${col.name} (Max: ${col.maxMarks})`);
    });
    headers.push("Remarks");

    worksheet.getRow(3).values = headers;
    worksheet.getRow(3).font = { bold: true };
    worksheet.getRow(3).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E5F99" },
    };
    worksheet.getRow(3).font = { bold: true, color: { argb: "FFFFFFFF" } };

    // Set column widths
    worksheet.getColumn(1).width = 8;  // Sr No
    worksheet.getColumn(2).width = 26; // Student ID
    worksheet.getColumn(3).width = 15; // Roll Number
    worksheet.getColumn(4).width = 25; // Student Name
    worksheet.getColumn(5).width = 20; // Batch
    markingColumns.forEach((_, idx) => {
      worksheet.getColumn(6 + idx).width = 18;
    });
    worksheet.getColumn(6 + markingColumns.length).width = 20; // Remarks

    // Data rows
    students.forEach((student, idx) => {
      const rowData = [
        idx + 1,
        student.studentId,
        student.rollNumber,
        student.studentName,
        student.batch,
      ];

      const existingResult = resultsMap[student.studentId];
      markingColumns.forEach((col) => {
        const mark = existingResult?.marks?.find((m) => m.schemeName === col.name);
        rowData.push(mark?.obtainedMarks ?? "");
      });

      rowData.push(existingResult?.remarks || "");

      worksheet.addRow(rowData);
    });

    // Style data rows
    for (let i = 4; i <= students.length + 3; i++) {
      const row = worksheet.getRow(i);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    }

    // Add instructions sheet
    const instructionsSheet = workbook.addWorksheet("Instructions");
    instructionsSheet.getColumn(1).width = 80;
    instructionsSheet.addRow(["INSTRUCTIONS FOR MARKS ENTRY"]);
    instructionsSheet.getRow(1).font = { bold: true, size: 14 };
    instructionsSheet.addRow([""]);
    instructionsSheet.addRow(["1. Do NOT modify the Student ID column - it is used to identify students"]);
    instructionsSheet.addRow(["2. Enter marks in the respective columns"]);
    instructionsSheet.addRow(["3. Leave cells empty if no marks to enter"]);
    instructionsSheet.addRow(["4. Marks must not exceed the maximum shown in column headers"]);
    instructionsSheet.addRow(["5. After filling, upload the file using the Upload Marks button"]);
    instructionsSheet.addRow([""]);
    instructionsSheet.addRow([`Session: ${session.title}`]);
    instructionsSheet.addRow([`Subject: ${subject.subjectName}`]);
    instructionsSheet.addRow([`Generated: ${new Date().toLocaleString()}`]);

    const sanitizedSubject = subject.subjectName
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);

    await sendExcelResponse(res, workbook, `marks-template-${sanitizedSubject}.xlsx`);
  } catch (error) {
    console.error("Error downloading marks template:", error);
    res.status(500).json({ success: false, message: "Failed to download marks template" });
  }
};

/**
 * Parse uploaded marks Excel and return preview data
 * Does NOT save - just returns what changes would be made
 */
export const parseUploadedMarks = async (req, res) => {
  try {
    const { sessionId, sessionType, subjectId } = req.params;
    const { data } = req.body; // Array of objects from parsed Excel

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ success: false, message: "No data provided" });
    }

    // Validate session
    let session;
    if (sessionType === "regular") {
      session = await RegularExamSession.findById(sessionId).lean();
    } else if (sessionType === "atkt") {
      session = await ATKTExamSession.findById(sessionId).lean();
    }

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    // Get subject
    const subject = await Subject.findById(subjectId).lean();
    if (!subject) {
      return res.status(404).json({ success: false, message: "Subject not found" });
    }

    // Get existing results
    const studentIds = data.map((row) => row.studentId).filter(Boolean);
    const existingResults = await ExamResult.find({
      examSessionId: sessionId,
      studentId: { $in: studentIds },
      subjectId,
    }).lean();

    const resultsMap = {};
    existingResults.forEach((r) => {
      resultsMap[r.studentId.toString()] = r;
    });

    // Build preview data
    const preview = [];
    const errors = [];

    for (const row of data) {
      if (!row.studentId) {
        errors.push({ row: row.srNo || "?", error: "Missing Student ID" });
        continue;
      }

      const existingResult = resultsMap[row.studentId];
      const changes = [];
      const newMarks = [];

      // Extract mark columns (anything that looks like a mark field)
      Object.keys(row).forEach((key) => {
        if (key.includes("(Max:") || ["Internal", "External", "Assignment", "Class Test", "Attendance"].some(m => key.includes(m))) {
          const schemeName = key.split(" (Max:")[0].trim();
          const value = row[key];
          
          if (value !== "" && value !== null && value !== undefined) {
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              newMarks.push({ schemeName, obtainedMarks: numValue });
              
              const existingMark = existingResult?.marks?.find((m) => m.schemeName === schemeName);
              if (!existingMark || existingMark.obtainedMarks !== numValue) {
                changes.push({
                  field: schemeName,
                  oldValue: existingMark?.obtainedMarks ?? null,
                  newValue: numValue,
                });
              }
            }
          }
        }
      });

      // Check remarks
      if (row.Remarks !== undefined && row.Remarks !== (existingResult?.remarks || "")) {
        changes.push({
          field: "Remarks",
          oldValue: existingResult?.remarks || null,
          newValue: row.Remarks || null,
        });
      }

      preview.push({
        studentId: row.studentId,
        rollNumber: row["Roll Number"] || row.rollNumber,
        studentName: row["Student Name"] || row.studentName,
        marks: newMarks,
        remarks: row.Remarks || "",
        changes,
        hasChanges: changes.length > 0,
        isNew: !existingResult,
      });
    }

    const changedCount = preview.filter((p) => p.hasChanges).length;
    const newCount = preview.filter((p) => p.isNew).length;

    res.status(200).json({
      success: true,
      preview,
      summary: {
        total: preview.length,
        changed: changedCount,
        new: newCount,
        unchanged: preview.length - changedCount,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
      subject: {
        id: subject._id,
        name: subject.subjectName,
      },
      session: {
        id: session._id,
        title: session.title,
      },
    });
  } catch (error) {
    console.error("Error parsing uploaded marks:", error);
    res.status(500).json({ success: false, message: "Failed to parse uploaded marks" });
  }
};
