import ATKTForm from "../models/atktFormModel.js";
import Razorpay from "razorpay";
import dotenv from "dotenv";
import paymentModel from "../models/paymentModel.js";
import studentModel from "../models/studentModel.js";
import Application from "../models/applicationModel.js";
import mongoose from "mongoose";
import ATKTExamSession from "../models/atktExamSessionModel.js";
import ATKTSubjectConfig from "../models/atktSubjectConfigModel.js";
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import archiver from "archiver";
import {
  createWorkbook,
  createStandardWorksheet,
  sendExcelResponse,
  formatExcelDate,
} from "../utils/excelHelper.js";
import { createJob, updateJob, getJob } from "../utils/jobManager.js";
import { v4 as uuidv4 } from "uuid";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rpInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY || "rzp_test_1DP5mmOlF5G5ag",
  key_secret: process.env.RAZORPAY_SECRET,
});

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

let atktFormEnabled = true;

const getBatchBase = (batchName) => {
  if (!batchName) return "";
  const parts = batchName.split("-");
  if (
    parts.length > 1 &&
    parts[parts.length - 1].length === 1 &&
    /^[A-Z0-9]$/i.test(parts[parts.length - 1])
  ) {
    return parts.slice(0, -1).join("-");
  }
  return batchName;
};

const buildDynamicCatalog = async (examSessionId) => {
  const configs = await ATKTSubjectConfig.find({
    examSessionId,
    isActive: true,
  }).lean();

  if (!configs.length) {
    return {
      courses: [],
      patterns: [],
      batches: {},
    };
  }

  const coursesSet = new Set();
  const patternsSet = new Set();
  const batchesMap = new Map();

  configs.forEach((config) => {
    coursesSet.add(config.course);
    patternsSet.add(config.pattern);

    const batchKey = config.batch;
    if (!batchesMap.has(batchKey)) {
      batchesMap.set(batchKey, {
        label: config.batchLabel,
        course: config.course,
        patterns: {},
      });
    }

    const batchData = batchesMap.get(batchKey);
    if (!batchData.patterns[config.pattern]) {
      batchData.patterns[config.pattern] = {
        subjects: config.subjects,
        hasSelectableSubjects: config.subjects.some(
          (subject) => subject.type !== "section",
        ),
      };
    }
  });

  const courses = Array.from(coursesSet).map((courseName) => {
    const courseBatches = Array.from(batchesMap.entries())
      .filter(([_, batchData]) => batchData.course === courseName)
      .map(([batchKey]) => batchKey);

    return {
      id: courseName.toLowerCase().replace(/\s+/g, "-"),
      label: courseName,
      value: courseName,
      batches: courseBatches,
    };
  });

  const patterns = Array.from(patternsSet).map((pattern) => ({
    id: pattern.replace(":", "-"),
    label: pattern,
    value: pattern,
  }));

  const batches = Object.fromEntries(batchesMap);

  return { courses, patterns, batches };
};

// Merge multiple per-session catalogs into a single catalog (used when no
// specific examSessionId is selected and multiple sessions are active).
const mergeCatalogs = (catalogs) => {
  const merged = { courses: [], patterns: [], batches: {} };
  const courseMap = new Map();
  const patternMap = new Map();

  catalogs.forEach((catalog) => {
    (catalog.courses || []).forEach((course) => {
      const existing = courseMap.get(course.value);
      if (existing) {
        const set = new Set([...(existing.batches || []), ...(course.batches || [])]);
        existing.batches = Array.from(set);
      } else {
        courseMap.set(course.value, { ...course, batches: [...(course.batches || [])] });
      }
    });

    (catalog.patterns || []).forEach((pattern) => {
      if (!patternMap.has(pattern.value)) {
        patternMap.set(pattern.value, { ...pattern });
      }
    });

    Object.entries(catalog.batches || {}).forEach(([batchName, batchDetails]) => {
      if (!merged.batches[batchName]) {
        merged.batches[batchName] = {
          label: batchDetails.label,
          course: batchDetails.course,
          patterns: { ...(batchDetails.patterns || {}) },
        };
      } else {
        merged.batches[batchName].patterns = {
          ...merged.batches[batchName].patterns,
          ...(batchDetails.patterns || {}),
        };
      }
    });
  });

  merged.courses = Array.from(courseMap.values());
  merged.patterns = Array.from(patternMap.values());
  return merged;
};

const isRegistrationOpen = (session, now = new Date()) =>
  session &&
  now >= session.registrationStartDate &&
  now <= session.registrationEndDate;

const summarizeSession = (session) => ({
  id: session._id,
  title: session.title,
  academicYear: session.academicYear,
  term: session.term,
  registrationStartDate: session.registrationStartDate,
  registrationEndDate: session.registrationEndDate,
  examStartDate: session.examStartDate,
  examEndDate: session.examEndDate,
  description: session.description,
  registrationOpen: isRegistrationOpen(session),
});

const sanitizeCatalog = (catalog) => {
  const batches = Object.entries(catalog.batches).reduce(
    (accumulator, [batchName, batchDetails]) => {
      const patterns = Object.entries(batchDetails.patterns).reduce(
        (patternAcc, [patternName, patternDetails]) => {
          const subjects = patternDetails.subjects || [];
          const hasSelectableSubjects = subjects.some(
            (subject) => subject.type !== "section",
          );
          patternAcc[patternName] = {
            subjects,
            hasSelectableSubjects,
          };
          return patternAcc;
        },
        {},
      );

      accumulator[batchName] = {
        label: batchDetails.label,
        course: batchDetails.course,
        patterns,
      };
      return accumulator;
    },
    {},
  );

  return {
    courses: catalog.courses,
    patterns: catalog.patterns,
    batches,
  };
};

const toPlainForm = (form) => {
  if (!form) return {};
  if (typeof form.toObject === "function") {
    return form.toObject();
  }
  return { ...form };
};

const sanitizeNotes = (notes) => {
  if (!notes || typeof notes !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(notes));
  } catch (error) {
    const sanitized = {};
    for (const [key, value] of Object.entries(notes)) {
      if (value === undefined || value === null) {
        sanitized[key] = value;
      } else if (
        typeof value === "object" &&
        typeof value.toString === "function"
      ) {
        sanitized[key] = value.toString();
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
};

const formatPaymentDetails = (paymentDoc, form) => {
  if (!paymentDoc) return null;

  const payload = paymentDoc.payload || {};
  const amountFromPayload =
    typeof payload.amount === "number" ? payload.amount / 100 : null;
  const amount =
    typeof paymentDoc.amount === "number"
      ? paymentDoc.amount
      : (amountFromPayload ?? form.amount ?? null);

  const notes = sanitizeNotes(payload.notes);
  const rawStatus = (payload.status ?? form.paymentStatus) || null;
  let normalizedStatus = rawStatus;

  if (typeof normalizedStatus === "string") {
    const lowerStatus = normalizedStatus.toLowerCase();
    if (lowerStatus === "captured" || lowerStatus === "paid") {
      normalizedStatus = "paid";
    } else if (lowerStatus === "authorized") {
      normalizedStatus = "authorized";
    } else if (lowerStatus === "failed") {
      normalizedStatus = "failed";
    } else if (lowerStatus === "pending") {
      normalizedStatus = "pending";
    }
  }

  return {
    id: paymentDoc._id ? paymentDoc._id.toString() : null,
    paymentId: paymentDoc.paymentId || null,
    orderId: paymentDoc.orderId || null,
    amount,
    currency: payload.currency || (amount ? "INR" : null),
    method: payload.method || null,
    status: normalizedStatus || null,
    gatewayStatus:
      typeof payload.status === "string" ? payload.status : rawStatus,
    captured:
      typeof payload.captured === "boolean" ? payload.captured : undefined,
    email: payload.email || payload.email_id || null,
    contact: payload.contact || payload.phone || null,
    notes,
    createdAt: paymentDoc.createdAt || null,
    paidAt: form.paidAt || paymentDoc.createdAt || null,
  };
};

const attachBatchAndPaymentInfo = async (forms) => {
  const plainForms = forms.map((form) => toPlainForm(form));

  const missingPaymentFormIds = plainForms
    .filter(
      (form) =>
        form &&
        form.paymentStatus === "paid" &&
        (!form.paymentRef || !form.paymentRef.paymentId),
    )
    .map((form) => form._id?.toString())
    .filter(Boolean);

  const fallbackPaymentMap = new Map();
  if (missingPaymentFormIds.length) {
    const fallbackPayments = await paymentModel
      .find({ atktFormId: { $in: missingPaymentFormIds } })
      .sort({ createdAt: -1 })
      .lean();

    fallbackPayments.forEach((payment) => {
      const key = payment.atktFormId?.toString();
      if (key && !fallbackPaymentMap.has(key)) {
        fallbackPaymentMap.set(key, payment);
      }
    });
  }

  const studentCache = new Map();

  return Promise.all(
    plainForms.map(async (form) => {
      const formCopy = { ...form };
      const formId = formCopy._id?.toString();

      let paymentDoc = null;
      if (formCopy.paymentRef && formCopy.paymentRef.paymentId) {
        paymentDoc = formCopy.paymentRef;
      } else if (formId && fallbackPaymentMap.has(formId)) {
        paymentDoc = fallbackPaymentMap.get(formId);
      }

      formCopy.paymentDetails = formatPaymentDetails(paymentDoc, formCopy);
      formCopy.paymentRefId =
        paymentDoc && paymentDoc._id ? paymentDoc._id.toString() : null;

      if (!formCopy.paidAt && formCopy.paymentDetails?.paidAt) {
        formCopy.paidAt = formCopy.paymentDetails.paidAt;
      }

      if (
        !formCopy.amount &&
        formCopy.paymentDetails &&
        typeof formCopy.paymentDetails.amount === "number"
      ) {
        formCopy.amount = formCopy.paymentDetails.amount;
      }

      if (
        formCopy.paymentDetails?.status &&
        formCopy.paymentStatus !== formCopy.paymentDetails.status
      ) {
        formCopy.paymentStatus = formCopy.paymentDetails.status;
      }

      delete formCopy.paymentRef;

      if (formCopy.submittedByRole === "student" && formCopy.submittedBy) {
        const studentId = formCopy.submittedBy.toString();

        if (!studentCache.has(studentId)) {
          const student = await studentModel
            .findById(studentId)
            .select("academicDetails.batch.name")
            .lean();
          studentCache.set(studentId, student || null);
        }

        const cachedStudent = studentCache.get(studentId);
        if (cachedStudent?.academicDetails?.batch?.name) {
          const assignedBatch = cachedStudent.academicDetails.batch.name;
          formCopy.assignedBatch = assignedBatch;
          const assignedBatchBase = getBatchBase(assignedBatch);
          const selectedBatchBase = getBatchBase(formCopy.batch);
          formCopy.batchMismatch = assignedBatchBase !== selectedBatchBase;
        } else {
          formCopy.batchMismatch = false;
        }
      } else {
        formCopy.batchMismatch = false;
      }

      return formCopy;
    }),
  );
};

export const fetchAtktCatalog = async (req, res) => {
  try {
    const { examSessionId } = req.query || {};

    const activeSessions = await ATKTExamSession.find({
      isActive: true,
      status: "active",
    }).sort({ createdAt: -1 });

    if (!activeSessions.length) {
      return res.status(404).json({
        message: "No active ATKT exam session available",
        catalog: { courses: [], patterns: [], batches: {} },
        sessions: [],
        session: null,
        hasActiveSession: false,
      });
    }

    const sessionsSummary = activeSessions.map(summarizeSession);

    // Specific session requested
    if (examSessionId) {
      const selected = activeSessions.find(
        (s) => s._id.toString() === String(examSessionId),
      );

      if (!selected) {
        return res.status(400).json({
          message: "Invalid or inactive exam session",
          catalog: { courses: [], patterns: [], batches: {} },
          sessions: sessionsSummary,
          session: null,
          hasActiveSession: true,
          registrationOpen: false,
        });
      }

      const registrationOpen = isRegistrationOpen(selected);
      if (!registrationOpen) {
        return res.status(400).json({
          message: "ATKT registration is not open at this time",
          session: summarizeSession(selected),
          sessions: sessionsSummary,
          catalog: { courses: [], patterns: [], batches: {} },
          hasActiveSession: true,
          registrationOpen: false,
        });
      }

      const rawCatalog = await buildDynamicCatalog(selected._id);
      const catalog = sanitizeCatalog(rawCatalog);

      return res.status(200).json({
        catalog,
        session: summarizeSession(selected),
        sessions: sessionsSummary,
        hasActiveSession: true,
        registrationOpen: true,
      });
    }

    // No specific session: return a merged catalog across all active sessions
    // (used by examiner dashboards) along with the list of sessions so the
    // student UI can prompt the user to pick one.
    const rawCatalogs = await Promise.all(
      activeSessions.map((s) => buildDynamicCatalog(s._id)),
    );
    const catalog = sanitizeCatalog(mergeCatalogs(rawCatalogs));
    const anyOpen = sessionsSummary.some((s) => s.registrationOpen);
    const singleSession = activeSessions.length === 1 ? activeSessions[0] : null;

    return res.status(200).json({
      catalog,
      // For backward compatibility with single-session callers:
      session: singleSession ? summarizeSession(singleSession) : null,
      sessions: sessionsSummary,
      hasActiveSession: true,
      registrationOpen: anyOpen,
    });
  } catch (error) {
    console.error("Failed to load ATKT catalog:", error);
    res.status(500).json({ message: "Failed to load ATKT catalog" });
  }
};

export const fetchAtktForms = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      course,
      batch,
      pattern,
      submittedByRole,
      startDate,
      endDate,
      search,
      batchMismatch,
      batchName,
      paymentStatus,
      examSessionId,
    } = req.query;

    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    const pageNum =
      Number.isNaN(parsedPage) || parsedPage <= 0 ? 1 : parsedPage;
    const limitNum =
      Number.isNaN(parsedLimit) || parsedLimit <= 0 ? 10 : parsedLimit;
    const skip = (pageNum - 1) * limitNum;

    const filters = {};
    if (paymentStatus) {
      filters.paymentStatus = paymentStatus;
    } else {
      filters.paymentStatus = "paid";
    }

    if (examSessionId) filters.examSessionId = examSessionId;
    if (course) filters.course = course;
    if (batch) filters.batch = batch;
    if (pattern) filters.pattern = pattern;
    if (submittedByRole) filters.submittedByRole = submittedByRole;

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filters.$or = [
        { studentName: searchRegex },
        { rollNumber: searchRegex },
        { contactNumber: searchRegex },
      ];
    }

    const needsAdvancedFiltering =
      (batchMismatch !== undefined && batchMismatch !== "") ||
      (batchName && batchName.trim());

    const baseQuery = ATKTForm.find(filters)
      .sort({ createdAt: -1 })
      .populate({
        path: "paymentRef",
        select:
          "paymentId orderId paymentType payload createdAt amount atktFormId",
      })
      .populate({
        path: "examSessionId",
        select: "title academicYear term status",
      });

    if (needsAdvancedFiltering) {
      const allFormsRaw = await baseQuery.lean();
      const formsWithDetails = await attachBatchAndPaymentInfo(allFormsRaw);

      let filteredForms = formsWithDetails;

      if (batchMismatch !== undefined && batchMismatch !== "") {
        const isMismatch = batchMismatch === "true";
        filteredForms = filteredForms.filter(
          (form) => (form.batchMismatch || false) === isMismatch,
        );
      }

      if (batchName && batchName.trim()) {
        const trimmedBatchName = batchName.trim();
        filteredForms = filteredForms.filter(
          (form) =>
            form.submittedByRole === "student" &&
            (form.assignedBatch || "") === trimmedBatchName,
        );
      }

      const total = filteredForms.length;
      const paginatedForms =
        limitNum > 0
          ? filteredForms.slice(skip, skip + limitNum)
          : filteredForms;

      return res.status(200).json({
        forms: paginatedForms,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: limitNum > 0 ? Math.ceil(total / limitNum) : 0,
        },
      });
    }

    const formsRaw = await baseQuery.skip(skip).limit(limitNum).lean();
    const formsWithDetails = await attachBatchAndPaymentInfo(formsRaw);
    const total = await ATKTForm.countDocuments(filters);

    return res.status(200).json({
      forms: formsWithDetails,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: limitNum > 0 ? Math.ceil(total / limitNum) : 0,
      },
    });
  } catch (error) {
    console.error("Failed to fetch ATKT forms:", error);
    res.status(500).json({ message: "Failed to fetch ATKT forms" });
  }
};

export const getUniqueBatchNames = async (req, res) => {
  try {
    // Get unique batch names from student submissions
    const studentForms = await ATKTForm.find({
      submittedByRole: "student",
    }).distinct("submittedBy");

    const batchNames = new Set();

    for (const studentId of studentForms) {
      const student = await studentModel.findById(studentId);
      if (student?.academicDetails?.batch?.name) {
        batchNames.add(student.academicDetails.batch.name);
      }
    }

    res.status(200).json({ batchNames: Array.from(batchNames).sort() });
  } catch (error) {
    console.error("Failed to fetch batch names:", error);
    res.status(500).json({ message: "Failed to fetch batch names" });
  }
};

export const getAtktStatus = (req, res) => {
  res.json({ enabled: atktFormEnabled });
};

export const toggleAtktStatus = (req, res) => {
  atktFormEnabled = !atktFormEnabled;
  res.json({ enabled: atktFormEnabled });
};

export const downloadAtktFormsExcel = async (req, res) => {
  try {
    const { examSessionId, course, batch, pattern, paymentStatus } = req.query;

    const filters = {};
    if (examSessionId) filters.examSessionId = examSessionId;
    if (course) filters.course = course;
    if (batch) filters.batch = batch;
    if (pattern) filters.pattern = pattern;

    const forms = await ATKTForm.find(filters)
      .populate("examSessionId", "title academicYear term")
      .lean();

    const formsWithDetails = await attachBatchAndPaymentInfo(forms);

    const headers = [
      { label: "Form ID", key: "formId", width: 25 },
      { label: "Student Name", key: "studentName", width: 25 },
      { label: "Email", key: "email", width: 30 },
      { label: "Phone", key: "phone", width: 15 },
      { label: "Course", key: "course", width: 15 },
      { label: "Batch", key: "batch", width: 15 },
      { label: "Pattern", key: "pattern", width: 15 },
      { label: "Subjects", key: "subjects", width: 40 },
      { label: "Payment Status", key: "paymentStatus", width: 15 },
      { label: "Payment ID", key: "paymentId", width: 25 },
      { label: "Amount", key: "amount", width: 12 },
      { label: "Submitted At", key: "submittedAt", width: 20 },
      { label: "Exam Session", key: "examSession", width: 25 },
    ];

    const data = formsWithDetails.map((form) => ({
      formId: form._id?.toString() || "",
      studentName: form.studentName || "",
      email: form.paymentDetails?.email || "",
      phone: form.contactNumber || "",
      course: form.course || "",
      batch: form.batch || "",
      pattern: form.pattern || "",
      subjects: Array.isArray(form.subjects)
        ? form.subjects.map((s) => s.label || s).join(", ")
        : "",
      paymentStatus: form.paymentStatus || "N/A",
      paymentId: form.paymentDetails?.paymentId || "N/A",
      amount: form.amount ? form.amount.toString() : "0",
      submittedAt: formatExcelDate(form.createdAt),
      examSession: form.examSessionId?.title || "",
    }));

    const workbook = createWorkbook();
    createStandardWorksheet(workbook, "ATKT Submissions", headers, data);

    await sendExcelResponse(
      res,
      workbook,
      `atkt_submissions_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  } catch (error) {
    console.error("Error downloading ATKT forms Excel:", error);
    res
      .status(500)
      .json({ message: "Failed to download Excel", error: error.message });
  }
};

export const getMyAtktForm = async (req, res) => {
  try {
    const submittedBy = req.user?.studentId || req.user?.id;
    const submittedByRole = req.user?.studentId ? "student" : "examiner";
    const { examSessionId } = req.query || {};

    const activeSessions = await ATKTExamSession.find({
      isActive: true,
      status: "active",
    }).sort({ createdAt: -1 });

    if (!activeSessions.length) {
      return res.status(404).json({
        message: "No active exam session available",
        sessions: [],
      });
    }

    let sessionsToQuery = activeSessions;
    if (examSessionId) {
      sessionsToQuery = activeSessions.filter(
        (s) => s._id.toString() === String(examSessionId),
      );
      if (!sessionsToQuery.length) {
        return res.status(400).json({
          message: "Invalid or inactive exam session",
        });
      }
    }

    const sessionIds = sessionsToQuery.map((s) => s._id);

    const forms = await ATKTForm.find({
      submittedBy,
      submittedByRole,
      examSessionId: { $in: sessionIds },
    })
      .populate("examSessionId", "title academicYear term status")
      .sort({ createdAt: -1 });

    const paidForms = forms.filter((f) => f.paymentStatus === "paid");
    const pendingForms = forms.filter((f) => f.paymentStatus === "pending");

    // Look up unified receipt IDs for paid forms
    const paidFormIds = paidForms.map((f) => f._id);
    let receiptMap = {};
    if (paidFormIds.length > 0) {
      try {
        const UnifiedReceipt = mongoose.model("UnifiedReceipt");
        const receipts = await UnifiedReceipt.find({
          atktFormId: { $in: paidFormIds },
        }).select("_id atktFormId");
        for (const r of receipts) {
          receiptMap[r.atktFormId.toString()] = r._id.toString();
        }
      } catch (e) {
        // Model may not be registered yet, skip
      }
    }

    // Attach receiptId to each paid form
    const paidFormsWithReceipt = paidForms.map((f) => {
      const obj = f.toObject();
      obj.receiptId = receiptMap[f._id.toString()] || null;
      return obj;
    });

    // Per-session paid subject IDs (used for client-side dedupe)
    const paidSubjectIdsBySession = {};
    for (const f of paidForms) {
      const sid = (f.examSessionId?._id || f.examSessionId)?.toString();
      if (!sid) continue;
      if (!paidSubjectIdsBySession[sid]) paidSubjectIdsBySession[sid] = new Set();
      for (const s of f.subjects) paidSubjectIdsBySession[sid].add(s.id);
    }
    const paidSubjectIdsBySessionArr = Object.fromEntries(
      Object.entries(paidSubjectIdsBySession).map(([k, v]) => [k, [...v]]),
    );

    // Backward-compatible "flat" view (used when scoped to a single session)
    const flatPaidSubjectIds = [
      ...new Set(paidForms.flatMap((f) => f.subjects.map((s) => s.id))),
    ];

    // Backward compatible "form" / "pendingForm" (latest paid or pending across queried sessions).
    const pendingForm = pendingForms[0] || null;
    const form = paidFormsWithReceipt[0] || pendingForm;

    res.json({
      form,
      forms: paidFormsWithReceipt,
      pendingForm,
      pendingForms,
      paidSubjectIds: flatPaidSubjectIds,
      paidSubjectIdsBySession: paidSubjectIdsBySessionArr,
      sessions: activeSessions.map(summarizeSession),
      scopedSessionId: examSessionId || null,
    });
  } catch (error) {
    console.error("Fetch my ATKT form error:", error);
    res.status(500).json({ message: "Failed to fetch form" });
  }
};

export const updateAtktForm = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const form = await ATKTForm.findByIdAndUpdate(id, updates, { new: true });
    if (!form) return res.status(404).json({ message: "Form not found" });
    res.json({ form });
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to update form" });
  }
};

export const deleteAtktForm = async (req, res) => {
  try {
    const { id } = req.params;
    await ATKTForm.findByIdAndDelete(id);
    res.json({ message: "Form deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete form" });
  }
};

/**
 * POST /atkt/forms/manual
 * Examiner-initiated manual ATKT form creation.
 * Creates a form with paymentStatus="paid" so hall ticket can be generated immediately.
 */
export const createManualAtktForm = async (req, res) => {
  try {
    const {
      studentName, rollNumber, contactNumber,
      course, pattern, batch, subjects, examSessionId,
    } = req.body;

    if (!studentName?.trim() || !rollNumber?.trim() || !course?.trim() ||
        !pattern?.trim() || !batch?.trim() || !examSessionId) {
      return res.status(400).json({ message: "studentName, rollNumber, course, pattern, batch, and examSessionId are required." });
    }
    if (!Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ message: "At least one subject is required." });
    }

    const form = await ATKTForm.create({
      studentName: studentName.trim(),
      rollNumber: rollNumber.trim(),
      contactNumber: (contactNumber || "").trim() || "0000000000",
      course, pattern, batch,
      subjects: subjects.map((s) => ({
        id: s.id,
        label: s.label,
        subjectId: s.subjectId || null,
        group: s.group || null,
      })),
      examSessionId,
      submittedBy: req.user?.id || null,
      submittedByRole: "examiner",
      paymentStatus: "paid",
      paidAt: new Date(),
      amount: 0,
    });

    res.status(201).json({ success: true, form });
  } catch (error) {
    console.error("Error creating manual ATKT form:", error);
    res.status(500).json({ message: error.message || "Failed to create manual form." });
  }
};

export const submitAtktForm = async (req, res) => {
  const {
    studentName,
    rollNumber,
    contactNumber,
    course,
    pattern,
    batch,
    subjects,
    examSessionId,
  } = req.body || {};

  if (
    !studentName?.trim() ||
    !rollNumber?.trim() ||
    !contactNumber?.trim() ||
    !course?.trim() ||
    !pattern?.trim() ||
    !batch?.trim()
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const activeSessions = await ATKTExamSession.find({
      isActive: true,
      status: "active",
    }).sort({ createdAt: -1 });

    if (!activeSessions.length) {
      return res.status(400).json({
        message: "No active ATKT exam session available",
      });
    }

    let activeSession;
    if (examSessionId) {
      activeSession = activeSessions.find(
        (s) => s._id.toString() === String(examSessionId),
      );
      if (!activeSession) {
        return res.status(400).json({
          message: "Selected exam session is not active",
        });
      }
    } else if (activeSessions.length === 1) {
      activeSession = activeSessions[0];
    } else {
      return res.status(400).json({
        message:
          "Multiple ATKT exam sessions are active. Please select an exam session and resubmit.",
        sessions: activeSessions.map(summarizeSession),
      });
    }

    const now = new Date();
    if (
      now < activeSession.registrationStartDate ||
      now > activeSession.registrationEndDate
    ) {
      return res.status(400).json({
        message: "ATKT registration is not open at this time",
      });
    }

    const subjectConfig = await ATKTSubjectConfig.findOne({
      examSessionId: activeSession._id,
      course,
      batch,
      pattern,
      isActive: true,
    });

    if (!subjectConfig) {
      return res.status(400).json({
        message: "Invalid batch and pattern combination for this exam session",
      });
    }

    const selectableSubjects = subjectConfig.subjects.filter(
      (subject) => subject.type !== "section",
    );

    if (!selectableSubjects.length) {
      return res.status(400).json({
        message: "No subjects available for the chosen batch and pattern",
      });
    }

    if (!Array.isArray(subjects) || !subjects.length) {
      return res.status(400).json({ message: "Select at least one subject" });
    }

    const subjectMap = new Map(
      selectableSubjects.map((subject) => [subject.id, subject]),
    );

    const uniqueSubjectIds = [...new Set(subjects)];
    const invalidSubjectIds = uniqueSubjectIds.filter(
      (subjectId) => !subjectMap.has(subjectId),
    );

    if (invalidSubjectIds.length) {
      return res.status(400).json({
        message: "One or more selected subjects are invalid",
        invalidSubjectIds,
      });
    }

    const selectedSubjects = uniqueSubjectIds.map((subjectId) => {
      const subject = subjectMap.get(subjectId);
      return {
        id: subject.id,
        label: subject.label,
        group: subject.group || null,
      };
    });

    const submittedByRole = req.user?.studentId
      ? "student"
      : req.user?.id
        ? "examiner"
        : "unknown";
    const submittedBy = req.user?.studentId || req.user?.id || null;

    const subjectCount = selectedSubjects.length;
    const computeAmount = (count) => {
      if (count <= 0) return 0;
      if (count === 1) return 320;
      if (count === 2) return 585;
      return 1255;
    };
    const amount = computeAmount(subjectCount);

    // Find all existing forms for this student in this session
    const existingForms = await ATKTForm.find({
      submittedBy,
      submittedByRole,
      examSessionId: activeSession._id,
    });

    // Collect all subject IDs already paid for
    const paidSubjectIds = new Set();
    for (const f of existingForms) {
      if (f.paymentStatus === "paid") {
        for (const s of f.subjects) {
          paidSubjectIds.add(s.id);
        }
      }
    }

    // Check if any of the selected subjects have already been paid for
    const alreadyPaidSubjects = selectedSubjects.filter((s) =>
      paidSubjectIds.has(s.id),
    );
    if (alreadyPaidSubjects.length > 0) {
      return res.status(400).json({
        message: `The following subjects have already been paid for: ${alreadyPaidSubjects.map((s) => s.label).join(", ")}`,
        alreadyPaidSubjects: alreadyPaidSubjects.map((s) => s.id),
      });
    }

    // Find any existing pending form to update, or create a new one
    let form = existingForms.find((f) => f.paymentStatus === "pending") || null;

    const basePayload = {
      studentName: studentName.trim(),
      rollNumber: rollNumber.trim(),
      contactNumber: contactNumber.trim(),
      course,
      pattern,
      batch,
      subjects: selectedSubjects,
      submittedBy,
      submittedByRole,
      examSessionId: activeSession._id,
      paymentStatus: "pending",
      amount,
    };

    if (form) {
      form = await ATKTForm.findByIdAndUpdate(form._id, basePayload, {
        new: true,
      });
    } else {
      form = await ATKTForm.create(basePayload);
    }

    const timestamp = Date.now().toString().slice(-6);
    let receiptId = `ATKT_${(rollNumber || "").replace(/[^A-Za-z0-9]/g, "").slice(-10)}_${timestamp}`;
    if (receiptId.length > 40) receiptId = receiptId.slice(0, 40);

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: receiptId,
      notes: {
        paymentType: "atkt",
        atktFormId: form._id.toString(),
        examSessionId: activeSession._id.toString(),
        subjectCount: subjectCount.toString(),
        studentName: studentName.trim(),
        rollNumber: rollNumber.trim(),
      },
    };

    const order = await rpInstance.orders.create(options);

    return res.status(201).json({
      message: "A.T.K.T form initiated. Redirecting to payment...",
      data: { formId: form._id, amount },
      order,
      key: process.env.RAZORPAY_KEY,
      callback_url: `${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`}/api/payments/verify-hosted-payment`,
      user: {
        name: studentName.trim(),
        email: req.user?.email || "",
        mobile: contactNumber.trim(),
      },
    });
  } catch (error) {
    console.error("Submit ATKT form error:", error);
    res.status(500).json({
      message: error.message || "Could not submit the form",
    });
  }
};

// Helper function to load images as base64
const loadImageAsBase64 = async (imagePath) => {
  try {
    const imageBuffer = await fs.promises.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    console.error(`Error loading image ${imagePath}:`, error);
    return "";
  }
};

// Helper function to convert URL to base64
const urlToBase64 = async (url, fallback = "") => {
  if (!url) return fallback;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "image/png";
    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    console.error(`Error converting URL to base64 for ${url}:`, error);
    return fallback;
  }
};

// Helper function to get student image URL
const getStudentImageUrl = async (student, type) => {
  if (!student) return "";
  let url =
    student.certificates?.find((c) => c.type === type)?.fileUrl ||
    student.studentDetails?.[
      type === "candidatePhoto" ? "studentImage" : "studentSign"
    ];

  if (!url) {
    const query = mongoose.Types.ObjectId.isValid(student.loginStudentId)
      ? { loginStudentId: student.loginStudentId }
      : student.studentDetails?.emailAddress
        ? {
            "studentDetails.emailAddress": student.studentDetails.emailAddress,
          }
        : null;
    if (!query) return "";
    const application = await Application.findOne(query).lean();
    if (application && application.certificates) {
      url =
        application.certificates.find((c) => c.type === type)?.fileUrl || "";
    }
  }
  return url;
};

// Helper function to get exam date for a subject based on pattern from dynamic config
const getExamDetailsForSubject = async (
  subjectLabel,
  examSessionId,
  course,
  batch,
  pattern,
) => {
  try {
    const config = await ATKTSubjectConfig.findOne({
      examSessionId,
      course,
      batch,
      pattern,
      isActive: true,
    }).lean();

    if (!config) {
      return {
        examDate: "NOT_FOUND",
        examTime: "10:30 AM to 01:00 PM",
        examType: "Semester End Examination",
      };
    }

    const subject = config.subjects.find(
      (s) => s.label === subjectLabel && s.type === "subject",
    );

    return {
      examDate: subject?.examDate || "NOT_FOUND",
      examTime: subject?.examTime || "10:30 AM to 01:00 PM",
      examType: subject?.examType || "Semester End Examination",
    };
  } catch (error) {
    console.error("Error fetching exam details:", error);
    return {
      examDate: "NOT_FOUND",
      examTime: "10:30 AM to 01:00 PM",
      examType: "Semester End Examination",
    };
  }
};

// Generate Hall Ticket HTML Template
const generateHallTicketHTML = (data) => {
  const {
    studentName,
    motherName,
    batch,
    rollNumber,
    subjects,
    agnelLogoBase64,
    headOfExamSignBase64,
    principalSignBase64,
    studentPhotoBase64,
  } = data;

  const subjectRows = subjects
    .map(
      (subject) => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${subject.label}</td>
      <td style="border: 1px solid #000; padding: 8px;">${subject.examType || "Semester End Examination"}</td>
      <td style="border: 1px solid #000; padding: 8px;">${subject.examDate || ""}</td>
      <td style="border: 1px solid #000; padding: 8px;">${subject.examTime || "10:30 AM to 01:00 PM"}</td>
      <td style="border: 1px solid #000; padding: 8px; width: 100px;"></td>
      <td style="border: 1px solid #000; padding: 8px; width: 100px;"></td>
    </tr>
  `,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Hall Ticket - ${studentName}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        @page {
          size: A4;
          margin: 15mm;
        }
        
        body {
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          color: #000;
        }
        
        .container {
          width: 100%;
          max-width: 210mm;
          margin: 0 auto;
          padding: 10px;
        }
        
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 15px;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
        }
        
        .header-left {
          width: 80px;
        }
        
        .header-left img {
          width: 80px;
          height: auto;
        }
        
        .header-center {
          flex: 1;
          text-align: center;
          padding: 0 20px;
        }
        
        .header-center h1 {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 3px;
        }
        
        .header-center h2 {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 3px;
        }
        
        .header-center p {
          font-size: 11px;
          margin-bottom: 2px;
        }
        
        .header-right {
          width: 120px;
          height: 140px;
          border: 2px solid #000;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .header-right img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        
        .info-table td {
          border: 1px solid #000;
          padding: 8px;
          font-size: 12px;
        }
        
        .info-table td:first-child {
          font-weight: bold;
          width: 15%;
        }
        
        .info-table td:nth-child(2) {
          width: 35%;
        }
        
        .info-table td:nth-child(3) {
          font-weight: bold;
          width: 15%;
        }
        
        .info-table td:nth-child(4) {
          width: 35%;
        }
        
        .exam-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        
        .exam-table th {
          border: 1px solid #000;
          padding: 8px;
          background-color: #f0f0f0;
          font-weight: bold;
          text-align: center;
          font-size: 11px;
        }
        
        .exam-table td {
          border: 1px solid #000;
          padding: 8px;
          font-size: 11px;
        }
        
        .notes {
          margin-bottom: 20px;
        }
        
        .notes h3 {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        
        .notes ol {
          margin-left: 20px;
        }
        
        .notes li {
          margin-bottom: 4px;
          font-size: 11px;
        }
        
        .signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
        }
        
        .signature-block {
          text-align: center;
          width: 200px;
        }
        
        .signature-block img {
          width: 120px;
          height: 50px;
          margin-bottom: 5px;
        }
        
        .signature-block p {
          font-weight: bold;
          font-size: 12px;
          border-top: 1px solid #000;
          padding-top: 5px;
          margin-top: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            ${agnelLogoBase64 ? `<img src="${agnelLogoBase64}" alt="College Logo">` : ""}
          </div>
          <div class="header-center">
            <h3>Agnel Charities</h3>
            <h1>Agnel School of Law</h1>
            <p>Agnel Technical Education Complex, Sector 9A, Vashi, Navi Mumbai 400 703</p>
          </div>
          <div class="header-right">
            ${studentPhotoBase64 ? `<img src="${studentPhotoBase64}" alt="Student Photo">` : "<!-- Empty box for student photo -->"}
          </div>
        </div>
        
        <!-- Student Information -->
        <table class="info-table">
          <tr>
            <td><strong>Student Name</strong></td>
            <td>${studentName}</td>
            <td><strong>Mother Name</strong></td>
            <td>${motherName || ""}</td>
          </tr>
          <tr>
            <td><strong>Class</strong></td>
            <td>${batch}</td>
            <td><strong>Exam Seat No</strong></td>
            <td>${rollNumber}</td>
          </tr>
          <tr>
            <td colspan="4"><strong>Exam: </strong> TERM 1 (AY 2024-2025)</td>
          </tr>
        </table>
        
        <!-- Exam Schedule -->
        <table class="exam-table">
          <thead>
            <tr>
              <th>Subject Name</th>
              <th>Exam Type</th>
              <th>Date</th>
              <th>Timing</th>
              <th>Sign of<br>Student</th>
              <th>Sign of<br>Supervisor</th>
            </tr>
          </thead>
          <tbody>
            ${subjectRows}
          </tbody>
        </table>
        
        <!-- Notes -->
        <div class="notes">
          <h3>Note :</h3>
          <ol>
            <li>Students are requested to remain present in the examination hall 20 minutes prior to the exam start and shall not be allowed inside the examination hall after 30 minutes.</li>
            <li>Students are not allowed to carry any personal belongings and electronic devices inside the examination hall.</li>
            <li>Student are not allowed to carry any written material / or any written matter related to the exam on their body.</li>
            <li>Students should be in dress code and carry their college ID card and Hall ticket.</li>
            <li>Students should not write anything on the Hall ticket.</li>
            <li>Students will not be allowed to write on the question paper.</li>
            <li>Use of whitener for correction in the answer sheet is not allowed.</li>
            <li>Students shall not be allowed to leave the examination hall during the last 30 minutes of the examination.</li>
            <li>The college will not be held responsible for any loss or theft during examinations. Students are advised to take care of their personal belongings.</li>
          </ol>
        </div>
        
        <!-- Signatures -->
        <div class="signatures">
          <div class="signature-block">
            ${headOfExamSignBase64 ? `<img src="${headOfExamSignBase64}" alt="Head of Examination Signature">` : '<div style="height: 50px;"></div>'}
            <p>HEAD OF EXAMINATION</p>
          </div>
          <div class="signature-block">
            ${principalSignBase64 ? `<img src="${principalSignBase64}" alt="Principal Signature">` : '<div style="height: 50px;"></div>'}
            <p>PRINCIPAL</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Download Hall Ticket Controller
export const downloadHallTicket = async (req, res) => {
  let browser = null;
  try {
    const { id } = req.params;

    // Fetch the ATKT form
    const form = await ATKTForm.findById(id).lean();
    if (!form) {
      return res.status(404).json({ message: "ATKT form not found" });
    }

    // Check if payment is completed
    if (form.paymentStatus !== "paid") {
      return res
        .status(400)
        .json({ message: "Hall ticket is only available for paid forms" });
    }

    // Fetch student details to get mother's name and photo
    let motherName = "";
    let studentPhotoBase64 = "";

    if (form.submittedByRole === "student" && form.submittedBy) {
      const student = await studentModel
        .findById(form.submittedBy)
        .select(
          "familyBackground.motherName studentDetails certificates loginStudentId academicDetails.rollNumber",
        )
        .lean();
      motherName = student?.familyBackground?.motherName || "";

      // Get student photo URL
      const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, "");

      const studentPhotoUrl =
        (await getStudentImageUrl(student, "candidatePhoto")) ||
        `${backendBaseUrl}/api/students/student-photo/${student?.academicDetails?.rollNumber || form.rollNumber}`;

      // Load fallback image
      const uploadsPath = path.join(__dirname, "..", "uploads", "images");
      const fallbackImageBase64 = await loadImageAsBase64(
        path.join(uploadsPath, "fallback-image.png"),
      );

      // Convert student photo URL to base64
      studentPhotoBase64 = await urlToBase64(
        studentPhotoUrl,
        fallbackImageBase64,
      );
    } else {
      // Examiner-submitted: look up student by roll number for photo & mother's name
      const student = await studentModel
        .findOne({ "academicDetails.rollNumber": String(form.rollNumber).trim() })
        .select(
          "familyBackground.motherName studentDetails certificates loginStudentId academicDetails.rollNumber",
        )
        .lean();

      if (student) {
        motherName = student?.familyBackground?.motherName || "";

        const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, "");

        const studentPhotoUrl =
          (await getStudentImageUrl(student, "candidatePhoto")) ||
          `${backendBaseUrl}/api/students/student-photo/${form.rollNumber}`;

        const uploadsPath = path.join(__dirname, "..", "uploads", "images");
        const fallbackImageBase64 = await loadImageAsBase64(
          path.join(uploadsPath, "fallback-image.png"),
        );

        studentPhotoBase64 = await urlToBase64(
          studentPhotoUrl,
          fallbackImageBase64,
        );
      }
    }

    // Load images as base64
    const uploadsPath = path.join(__dirname, "..", "uploads", "images");
    const agnelLogoBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "agnel-logo.png"),
    );
    const headOfExamSignBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "headofexam.png"),
    );
    const principalSignBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "principal_sign.png"),
    );

    // Add exam details (date, time, type) to subjects
    const subjectsWithDates = await Promise.all(
      form.subjects.map(async (subject) => {
        const examDetails = await getExamDetailsForSubject(
          subject.label,
          form.examSessionId,
          form.course,
          form.batch,
          form.pattern,
        );
        return {
          ...subject,
          ...examDetails,
        };
      }),
    );

    // Prepare data for template
    const hallTicketData = {
      studentName: form.studentName,
      motherName: motherName,
      batch: form.batch,
      rollNumber: form.rollNumber,
      subjects: subjectsWithDates,
      agnelLogoBase64,
      headOfExamSignBase64,
      principalSignBase64,
      studentPhotoBase64,
    };

    // Generate HTML
    const htmlContent = generateHallTicketHTML(hallTicketData);

    // Launch puppeteer and generate PDF
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "15mm",
        right: "15mm",
        bottom: "15mm",
        left: "15mm",
      },
    });

    await browser.close();
    browser = null;

    // Send PDF as response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="HallTicket_${form.rollNumber}_${form.studentName.replace(/\s+/g, "_")}.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating hall ticket:", error);
    if (browser) {
      await browser.close();
    }
    res.status(500).json({
      message: "Failed to generate hall ticket",
      error: error.message,
    });
  }
};

export const bulkDownloadHallTickets = async (req, res) => {
  let browser = null;
  try {
    const {
      course,
      batch,
      pattern,
      submittedByRole,
      startDate,
      endDate,
      search,
      batchMismatch,
      batchName,
      paymentStatus,
      examSessionId,
    } = req.query;

    const filters = {};
    if (paymentStatus) {
      filters.paymentStatus = paymentStatus;
    } else {
      filters.paymentStatus = "paid";
    }

    if (examSessionId) filters.examSessionId = examSessionId;
    if (course) filters.course = course;
    if (batch) filters.batch = batch;
    if (pattern) filters.pattern = pattern;
    if (submittedByRole) filters.submittedByRole = submittedByRole;

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filters.$or = [
        { studentName: searchRegex },
        { rollNumber: searchRegex },
        { contactNumber: searchRegex },
      ];
    }

    const forms = await ATKTForm.find(filters)
      .populate("examSessionId")
      .lean();

    if (!forms.length) {
      return res.status(404).json({
        message: "No paid ATKT forms found for the selected criteria.",
      });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=ATKT_Hall_Tickets.zip",
    );

    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.pipe(res);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const uploadsPath = path.join(__dirname, "..", "uploads", "images");
    const agnelLogoBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "agnel-logo.png"),
    );
    const headOfExamSignBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "headofexam.png"),
    );
    const principalSignBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "principal_sign.png"),
    );
    const fallbackImageBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "fallback-image.png"),
    );

    for (const form of forms) {
      let motherName = "";
      let studentPhotoBase64 = "";

      if (form.submittedByRole === "student" && form.submittedBy) {
        const student = await studentModel
          .findById(form.submittedBy)
          .select(
            "familyBackground.motherName studentDetails certificates loginStudentId academicDetails.rollNumber",
          )
          .lean();
        motherName = student?.familyBackground?.motherName || "";

        const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, "");
        const studentPhotoUrl =
          (await getStudentImageUrl(student, "candidatePhoto")) ||
          `${backendBaseUrl}/api/students/student-photo/${student?.academicDetails?.rollNumber || form.rollNumber}`;

        studentPhotoBase64 = await urlToBase64(
          studentPhotoUrl,
          fallbackImageBase64,
        );
      }

      const subjectsWithDates = await Promise.all(
        form.subjects.map(async (subject) => {
          const examDetails = await getExamDetailsForSubject(
            subject.label,
            form.examSessionId?._id || form.examSessionId,
            form.course,
            form.batch,
            form.pattern,
          );
          return {
            ...subject,
            ...examDetails,
          };
        }),
      );

      const hallTicketData = {
        studentName: form.studentName,
        motherName,
        batch: form.batch,
        rollNumber: form.rollNumber,
        subjects: subjectsWithDates,
        agnelLogoBase64,
        headOfExamSignBase64,
        principalSignBase64,
        studentPhotoBase64,
      };

      const htmlContent = generateHallTicketHTML(hallTicketData);

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "15mm",
          right: "15mm",
          bottom: "15mm",
          left: "15mm",
        },
      });
      await page.close();

      archive.append(pdfBuffer, {
        name: `HallTicket_${form.rollNumber}_${form.studentName.replace(/\s+/g, "_")}.pdf`,
      });
    }

    await browser.close();
    browser = null;
    await archive.finalize();
  } catch (error) {
    console.error("Error generating bulk hall tickets:", error);
    if (browser) {
      await browser.close();
    }
    if (!res.headersSent) {
      res.status(500).json({
        message: "Failed to generate bulk hall tickets",
        error: error.message,
      });
    }
  }
};

// ==================== BULK HALL TICKET JOB ====================

const processAtktBulkHallTicketGeneration = async (jobId, filters, userId) => {
  let browser = null;
  try {
    updateJob(jobId, { status: "in_progress", progress: 0, metadata: { message: "Fetching ATKT forms..." } });

    const forms = await ATKTForm.find(filters)
      .populate("examSessionId")
      .lean();

    if (forms.length === 0) {
      updateJob(jobId, { 
        status: "failed", 
        error: "No ATKT forms found for the selected criteria",
        metadata: { failureReason: "no_data" }
      });
      return;
    }

    updateJob(jobId, { 
      metadata: { 
        totalStudents: forms.length, 
        processedStudents: 0,
        message: `Generating hall tickets for ${forms.length} students...` 
      } 
    });

    // Prepare assets once
    const uploadsPath = path.join(__dirname, "..", "uploads", "images");
    const agnelLogoBase64 = await loadImageAsBase64(path.join(uploadsPath, "agnel-logo.png"));
    const headOfExamSignBase64 = await loadImageAsBase64(path.join(uploadsPath, "headofexam.png"));
    const principalSignBase64 = await loadImageAsBase64(path.join(uploadsPath, "principal_sign.png"));
    const fallbackImageBase64 = await loadImageAsBase64(path.join(uploadsPath, "fallback-image.png"));

    // Initialize archive
    const zipFileName = `ATKT_Hall_Tickets_${Date.now()}.zip`;
    const zipFilePath = path.join(__dirname, "..", "temp", zipFileName);
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, "..", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    let processedCount = 0;

    for (const form of forms) {
      try {
        let motherName = "";
        let studentPhotoBase64 = "";

        if (form.submittedByRole === "student" && form.submittedBy) {
          const student = await studentModel
            .findById(form.submittedBy)
            .select("familyBackground.motherName studentDetails certificates loginStudentId academicDetails.rollNumber")
            .lean();
          motherName = student?.familyBackground?.motherName || "";

          const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, "");
          const studentPhotoUrl = (await getStudentImageUrl(student, "candidatePhoto")) ||
            `${backendBaseUrl}/api/students/student-photo/${student?.academicDetails?.rollNumber || form.rollNumber}`;

          studentPhotoBase64 = await urlToBase64(studentPhotoUrl, fallbackImageBase64);
        }

        const subjectsWithDates = await Promise.all(
          form.subjects.map(async (subject) => {
            const examDetails = await getExamDetailsForSubject(
              subject.label,
              form.examSessionId?._id || form.examSessionId,
              form.course,
              form.batch,
              form.pattern,
            );
            return {
              ...subject,
              ...examDetails,
            };
          }),
        );

        const hallTicketData = {
          studentName: form.studentName,
          motherName,
          batch: form.batch,
          rollNumber: form.rollNumber,
          subjects: subjectsWithDates,
          agnelLogoBase64,
          headOfExamSignBase64,
          principalSignBase64,
          studentPhotoBase64,
        };

        const htmlContent = generateHallTicketHTML(hallTicketData);

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "networkidle0" });
        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
        });
        await page.close();

        archive.append(pdfBuffer, {
          name: `HallTicket_${form.rollNumber}_${form.studentName.replace(/\s+/g, "_")}.pdf`,
        });

        processedCount++;
        const progress = Math.round((processedCount / forms.length) * 100);
        
        updateJob(jobId, { 
          progress, 
          metadata: { 
            processedStudents: processedCount,
            totalStudents: forms.length,
            message: `Generated ${processedCount} of ${forms.length} hall tickets`
          } 
        });

      } catch (err) {
        console.error(`Error processing ATKT form ${form._id}:`, err);
        // Continue with next form
      }
    }

    await browser.close();
    browser = null;

    await archive.finalize();

    output.on("close", () => {
      updateJob(jobId, { 
        status: "completed", 
        progress: 100, 
        result: zipFilePath,
        metadata: { 
          message: "ATKT hall tickets generation completed successfully!",
          downloadUrl: `/api/atkt/bulk-download-result/${jobId}`
        } 
      });
    });

  } catch (error) {
    console.error("Error in ATKT bulk hall ticket job:", error);
    if (browser) await browser.close();
    updateJob(jobId, { status: "failed", error: error.message });
  }
};

export const startAtktBulkHallTicketGeneration = async (req, res) => {
  try {
    const { 
      examSessionId, 
      batch, 
      course, 
      pattern, 
      paymentStatus,
      submittedByRole,
      startDate,
      endDate,
      search,
      formIds 
    } = req.query;
    const userId = req.user?.id || req.user?.examinerId;

    const filters = {};
    
    if (paymentStatus) {
      filters.paymentStatus = paymentStatus;
    } else {
      filters.paymentStatus = "paid";
    }
    
    if (examSessionId) filters.examSessionId = examSessionId;
    if (batch) filters.batch = batch;
    if (course) filters.course = course;
    if (pattern) filters.pattern = pattern;
    if (submittedByRole) filters.submittedByRole = submittedByRole;

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filters.$or = [
        { studentName: searchRegex },
        { rollNumber: searchRegex },
        { contactNumber: searchRegex },
      ];
    }

    if (formIds) {
      const ids = formIds.split(",").filter((id) => id.trim() !== "");
      if (ids.length > 0) {
        filters._id = { $in: ids };
      }
    }

    const jobId = uuidv4();
    createJob(jobId, { type: "atkt_bulk_hall_ticket", filters, userId });

    // Start background process
    processAtktBulkHallTicketGeneration(jobId, filters, userId);

    res.status(202).json({
      message: "ATKT bulk hall ticket generation started",
      jobId,
    });
  } catch (error) {
    console.error("Error starting ATKT bulk hall ticket job:", error);
    res
      .status(500)
      .json({ message: "Failed to start job", error: error.message });
  }
};

export const getAtktBulkHallTicketStatus = async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ message: "Job not found" });
  }

  res.status(200).json(job);
};

export const downloadAtktBulkHallTicketResult = async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job || job.status !== "completed" || !job.result) {
    return res.status(404).json({ message: "Result not available" });
  }

  res.download(job.result, "ATKT_HallTickets.zip", (err) => {
    if (err) {
      console.error("Error sending file:", err);
    }
  });
};
