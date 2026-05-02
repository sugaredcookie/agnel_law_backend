import MarkChangeRequest from "../models/markChangeRequestModel.js";
import MarkAuditLog from "../models/markAuditLogModel.js";
import ExamResult from "../models/examResultModel.js";
import Student from "../models/studentModel.js";

/**
 * Faculty: create a change request for marks they already entered.
 * Works with both ExamResult-based marks (if examSessionId provided)
 * and Student model marks (batch→subject flow, no session).
 */
export const createChangeRequest = async (req, res) => {
  try {
    const {
      examSessionId,
      examSessionType,
      studentId,
      subjectId,
      proposedMarks,
      remark,
    } = req.body;

    const facultyId = req.user?.facultyId;
    if (!facultyId) {
      return res.status(401).json({ success: false, message: "Faculty not authenticated" });
    }

    if (!remark || !remark.trim()) {
      return res.status(400).json({ success: false, message: "Remark is required" });
    }

    if (!studentId || !subjectId) {
      return res.status(400).json({ success: false, message: "studentId and subjectId are required" });
    }

    // Check for existing pending request
    const pendingQuery = { studentId, subjectId, status: "pending" };
    if (examSessionId) pendingQuery.examSessionId = examSessionId;

    const existingPending = await MarkChangeRequest.findOne(pendingQuery);
    if (existingPending) {
      return res.status(409).json({
        success: false,
        message: "A pending change request already exists for this student/subject",
      });
    }

    // Resolve current marks
    let currentMarks = [];
    let examResultId = null;

    if (examSessionId) {
      // ExamResult-based flow
      const result = await ExamResult.findOne({ examSessionId, studentId, subjectId });
      if (result) {
        currentMarks = (result.marks || []).map((m) => ({
          schemeName: m.schemeName,
          obtainedMarks: m.obtainedMarks,
          maxMarks: m.maxMarks,
        }));
        examResultId = result._id;
      }
    } else {
      // Student model flow (batch→subject, no session)
      const student = await Student.findById(studentId)
        .select("academicDetails.subjects")
        .lean();

      if (student) {
        const subjectEntry = student.academicDetails?.subjects?.find((s) => {
          const sid = s.subject?._id ? String(s.subject._id) : String(s.subject);
          return sid === String(subjectId);
        });

        if (subjectEntry?.marks) {
          currentMarks = subjectEntry.marks.map((m) => ({
            schemeName: m.schemeName,
            obtainedMarks: m.obtainedMarks,
            maxMarks: proposedMarks?.find((p) => p.schemeName === m.schemeName)?.maxMarks || 0,
          }));
        }
      }
    }

    if (currentMarks.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No existing marks found for this student/subject",
      });
    }

    const changeRequest = new MarkChangeRequest({
      examSessionId: examSessionId || null,
      examSessionType: examSessionType || null,
      studentId,
      subjectId,
      examResultId,
      requestedBy: facultyId,
      currentMarks,
      proposedMarks,
      remark: remark.trim(),
    });

    await changeRequest.save();

    // Audit log
    await MarkAuditLog.create({
      examResultId: examResultId || studentId, // use studentId as fallback ref
      examSessionId: examSessionId || null,
      studentId,
      subjectId,
      action: "change_requested",
      previousMarks: currentMarks,
      newMarks: proposedMarks,
      performedBy: facultyId,
      performedByType: "Faculty",
      remark: remark.trim(),
      changeRequestId: changeRequest._id,
    });

    res.status(201).json({
      success: true,
      message: "Change request submitted",
      changeRequest,
    });
  } catch (error) {
    console.error("Error creating change request:", error);
    res.status(500).json({ success: false, message: "Failed to create change request" });
  }
};

/**
 * Faculty: get their own change requests
 */
export const getMyChangeRequests = async (req, res) => {
  try {
    const facultyId = req.user?.facultyId;
    if (!facultyId) {
      return res.status(401).json({ success: false, message: "Faculty not authenticated" });
    }

    const { examSessionId, status } = req.query;
    const query = { requestedBy: facultyId };
    if (examSessionId) query.examSessionId = examSessionId;
    if (status) query.status = status;

    const requests = await MarkChangeRequest.find(query)
      .populate("studentId", "studentDetails.firstName studentDetails.lastName academicDetails.rollNumber")
      .populate("subjectId", "subjectName subjectCode")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, requests });
  } catch (error) {
    console.error("Error fetching change requests:", error);
    res.status(500).json({ success: false, message: "Failed to fetch change requests" });
  }
};

/**
 * Examiner/Admin: get pending change requests
 */
export const getPendingRequests = async (req, res) => {
  try {
    const { examSessionId, status } = req.query;
    const query = {};
    if (examSessionId) query.examSessionId = examSessionId;
    query.status = status || "pending";

    const requests = await MarkChangeRequest.find(query)
      .populate("studentId", "studentDetails.firstName studentDetails.lastName academicDetails.rollNumber")
      .populate("subjectId", "subjectName subjectCode")
      .populate("requestedBy", "name email")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, requests });
  } catch (error) {
    console.error("Error fetching pending requests:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending requests" });
  }
};

/**
 * Examiner/Admin: approve or reject a change request.
 * On approval: updates ExamResult if linked, otherwise updates Student model marks.
 */
export const reviewChangeRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be approved or rejected" });
    }

    const reviewerId = req.user?.id || req.user?.userId;
    const reviewerRole = req.user?._resolvedRole;

    const changeRequest = await MarkChangeRequest.findById(id);
    if (!changeRequest) {
      return res.status(404).json({ success: false, message: "Change request not found" });
    }

    if (changeRequest.status !== "pending") {
      return res.status(409).json({ success: false, message: "Request already reviewed" });
    }

    changeRequest.status = status;
    changeRequest.reviewedBy = reviewerId;
    changeRequest.reviewedByType = reviewerRole === "examiner" ? "Examiner" : "Admin";
    changeRequest.reviewedAt = new Date();
    changeRequest.reviewRemark = remark || "";

    await changeRequest.save();

    const performedByType = reviewerRole === "examiner" ? "Examiner" : "Admin";

    if (status === "approved") {
      let previousMarks = [];

      if (changeRequest.examResultId) {
        // Update ExamResult
        const result = await ExamResult.findById(changeRequest.examResultId);
        if (result) {
          previousMarks = (result.marks || []).map((m) => ({
            schemeName: m.schemeName,
            obtainedMarks: m.obtainedMarks,
            maxMarks: m.maxMarks,
          }));
          result.marks = changeRequest.proposedMarks;
          await result.save();
        }
      } else {
        // Update Student model marks (batch→subject flow)
        const student = await Student.findById(changeRequest.studentId);
        if (student) {
          const subjectIndex = student.academicDetails.subjects.findIndex(
            (s) => {
              const sid = s.subject?._id ? String(s.subject._id) : String(s.subject);
              return sid === String(changeRequest.subjectId);
            }
          );

          if (subjectIndex !== -1) {
            previousMarks = (student.academicDetails.subjects[subjectIndex].marks || []).map((m) => ({
              schemeName: m.schemeName,
              obtainedMarks: m.obtainedMarks,
              maxMarks: 0,
            }));

            // Replace with proposed marks (Student model stores schemeName + obtainedMarks only)
            student.academicDetails.subjects[subjectIndex].marks =
              changeRequest.proposedMarks.map((m) => ({
                schemeName: m.schemeName,
                obtainedMarks: m.obtainedMarks,
              }));

            await student.save();
          }
        }
      }

      await MarkAuditLog.create({
        examResultId: changeRequest.examResultId || changeRequest.studentId,
        examSessionId: changeRequest.examSessionId || null,
        studentId: changeRequest.studentId,
        subjectId: changeRequest.subjectId,
        action: "change_approved",
        previousMarks,
        newMarks: changeRequest.proposedMarks,
        performedBy: reviewerId,
        performedByType,
        remark: remark || "Change request approved",
        changeRequestId: changeRequest._id,
      });
    } else {
      await MarkAuditLog.create({
        examResultId: changeRequest.examResultId || changeRequest.studentId,
        examSessionId: changeRequest.examSessionId || null,
        studentId: changeRequest.studentId,
        subjectId: changeRequest.subjectId,
        action: "change_rejected",
        previousMarks: changeRequest.currentMarks,
        newMarks: changeRequest.proposedMarks,
        performedBy: reviewerId,
        performedByType,
        remark: remark || "Change request rejected",
        changeRequestId: changeRequest._id,
      });
    }

    res.status(200).json({
      success: true,
      message: `Change request ${status}`,
      changeRequest,
    });
  } catch (error) {
    console.error("Error reviewing change request:", error);
    res.status(500).json({ success: false, message: "Failed to review change request" });
  }
};
