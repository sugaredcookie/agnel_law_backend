/**
 * ResultConfig CRUD Controller
 * Manages exam result configurations (create/update/archive) and Excel file uploads.
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import ResultConfig from "../models/resultConfigModel.js";
// [REMOVED] SemesterResult no longer used -- replaced by ParsedResult everywhere
import ParsedResult from "../models/parsedResultModel.js";
import ParsedResultAudit from "../models/parsedResultAuditModel.js";
import Student from "../models/studentModel.js";
import Subject from "../models/subjectModel.js";
import { readStudentsStandard, getGradeInfo, getFinalGrade, clearCache } from "../utils/resultExcelParser.js";
import { stripEmptyElectives } from "../utils/gradeCalculator.js";
import { decorateATKTExemptions } from "./multiResultController.js";
import ExamResult from "../models/examResultModel.js";
import RegularExamSession from "../models/regularExamSessionModel.js";
import ATKTExamSession from "../models/atktExamSessionModel.js";
import RegularExamEnrollment from "../models/regularExamEnrollmentModel.js";
import ATKTForm from "../models/atktFormModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXCEL_DIR = path.join(__dirname, "..", "uploads", "excel");

/**
 * GET /api/result-configs
 * List all ResultConfigs (optionally filtered by status/program).
 */
export const listConfigs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.programId) filter.programId = req.query.programId;

    const docs = await ResultConfig.find(filter)
      .sort({ programId: 1, semesterNumber: 1, year: -1 })
      .lean();

    res.status(200).json({ success: true, configs: docs });
  } catch (error) {
    console.error("Error listing configs:", error);
    res.status(500).json({ success: false, message: "Failed to list configurations." });
  }
};

/**
 * POST /api/result-configs
 * Create a new ResultConfig.
 */
export const createConfig = async (req, res) => {
  try {
    const data = req.body;

    // Clean empty strings for ObjectId and enum fields
    if (data.examSessionId === "") data.examSessionId = null;
    if (data.examSessionType === "") data.examSessionType = null;

    if (!data.slug || !data.label || !data.programme || !data.programId || !data.semesterNumber || !data.examType) {
      return res.status(400).json({ success: false, message: "Missing required fields: slug, label, programme, programId, semesterNumber, examType." });
    }

    const existing = await ResultConfig.findOne({ slug: data.slug });
    if (existing) {
      return res.status(409).json({ success: false, message: `Config with slug "${data.slug}" already exists.` });
    }

    const doc = await ResultConfig.create({
      ...data,
      dataSource: data.dataSource || "excel",
      status: data.status || "draft",
    });

    res.status(201).json({ success: true, config: doc });
  } catch (error) {
    console.error("Error creating config:", error);
    res.status(500).json({ success: false, message: "Failed to create configuration." });
  }
};

/**
 * PUT /api/result-configs/:id
 * Update an existing ResultConfig.
 */
export const updateConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Clean empty strings for ObjectId fields — Mongoose can't cast "" to ObjectId
    if (updates.examSessionId === "") updates.examSessionId = null;
    if (updates.examSessionType === "") updates.examSessionType = null;
    if (updates.programId === "") updates.programId = null;

    // Don't allow changing slug to an existing one
    if (updates.slug) {
      const conflict = await ResultConfig.findOne({ slug: updates.slug, _id: { $ne: id } });
      if (conflict) {
        return res.status(409).json({ success: false, message: `Slug "${updates.slug}" is taken.` });
      }
    }

    const doc = await ResultConfig.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });

    // Cascade subject/practical name/code/credit changes to existing ParsedResult docs
    // Match by subject code (not array index) to avoid creating stubs for elective subjects
    // that a student didn't take
    if (updates.subjects && Array.isArray(updates.subjects)) {
      const bulkOps = updates.subjects.map((s) => ({
        updateMany: {
          filter: { resultConfigId: id, "subjects.code": s.code },
          update: {
            $set: {
              "subjects.$.name": s.name,
              "subjects.$.credit": s.credit,
            },
          },
        },
      }));
      if (bulkOps.length) await ParsedResult.bulkWrite(bulkOps);
    }
    if (updates.practical) {
      await ParsedResult.updateMany(
        { resultConfigId: id, practical: { $ne: null } },
        { $set: {
          "practical.code": updates.practical.code,
          "practical.name": updates.practical.name,
          "practical.credit": updates.practical.credit,
        }}
      );
    }

    res.status(200).json({ success: true, config: doc });
  } catch (error) {
    console.error("Error updating config:", error);
    res.status(500).json({ success: false, message: "Failed to update configuration." });
  }
};

/**
 * DELETE /api/result-configs/:id
 * Soft-delete (archive) a ResultConfig.
 */
export const archiveConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ResultConfig.findByIdAndUpdate(id, { $set: { status: "archived" } }, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });
    res.status(200).json({ success: true, message: "Config archived.", config: doc });
  } catch (error) {
    console.error("Error archiving config:", error);
    res.status(500).json({ success: false, message: "Failed to archive configuration." });
  }
};

/**
 * GET /api/result-configs/:id
 * Get a single ResultConfig by ID or slug.
 */
export const getConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ResultConfig.findById(id).lean()
      || await ResultConfig.findOne({ slug: id }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });
    res.status(200).json({ success: true, config: doc });
  } catch (error) {
    console.error("Error getting config:", error);
    res.status(500).json({ success: false, message: "Failed to get configuration." });
  }
};

/**
 * Auto-apply grace marks on external: if external < minE and the gap is
 * within GRACE_MAX (5), bridge it and show as "original+grace" in eDisplay.
 * Skips subjects where the user already typed a grace notation ("25+5").
 */
const GRACE_MAX = 5;

function applyGraceMarks(students, configDoc) {
  const minE = configDoc.limits?.minE ?? 30;
  const minI = configDoc.limits?.minI ?? 10;
  const minT = configDoc.limits?.minT ?? 40;

  for (const student of students) {
    let touched = false;

    for (const subj of student.subjects) {
      if (subj.isAbsent) continue;
      if (typeof subj.eDisplay === "string" && subj.eDisplay.includes("+")) continue;

      const ext = typeof subj.external === "number" ? subj.external : 0;
      if (ext >= minE || ext <= 0) continue;

      const gap = minE - ext;
      if (gap > GRACE_MAX) continue;

      subj.eDisplay = `${ext}+${gap}`;
      subj.external = minE;
      subj.total = (typeof subj.internal === "number" ? subj.internal : 0) + subj.external;

      subj.passed = subj.internal >= minI && subj.external >= minE && subj.total >= minT;
      const gi = subj.passed ? getGradeInfo(subj.total) : { grade: "F", gp: 0 };
      subj.grade = gi.grade;
      subj.gp = gi.gp;
      subj.earned = subj.passed ? subj.credit : 0;
      subj.cg = subj.earned * gi.gp;
      touched = true;
    }

    if (touched) {
      let totalMarksObt = 0, totalCG = 0, totalCredits = 0, totalEarned = 0;
      for (const s of student.subjects) {
        totalMarksObt += s.total;
        totalCG += s.cg;
        totalCredits += s.credit;
        totalEarned += s.earned;
      }
      if (student.practical) {
        totalMarksObt += student.practical.total || 0;
        totalCG += student.practical.cg || 0;
        totalCredits += student.practical.credit || 0;
        totalEarned += student.practical.earned || 0;
      }
      student.totalMarksObt = totalMarksObt;
      student.totalCG = totalCG;
      student.totalCredits = totalCredits;
      student.totalEarned = totalEarned;
      student.sgpa = totalCredits > 0 ? parseFloat((totalCG / totalCredits).toFixed(2)) : null;
      student.finalGrade = student.sgpa !== null ? getFinalGrade(student.sgpa) : "F";
      student.cgpa = student.sgpa || 0;
      student.allPassed = student.subjects.every((s) => s.passed) &&
        (student.practical ? student.practical.passed : true);
      const hasAbsent = student.subjects.some((s) => s.isAbsent);
      student.remark = hasAbsent ? "ABSENT" : student.allPassed ? "SUCCESSFUL" : "UNSUCCESSFUL";
    }
  }
}

/**
 * For ATKT/Reval uploads: compare each student's marks against the matching
 * regular config, keep the highest value per internal/external.
 * Recalculates totals, grades, SGPA, and pass/fail after adjustments.
 */
async function applyHighestMarks(students, configDoc) {
  if (!["atkt", "reval"].includes(configDoc.examType)) return;

  const regularConfig = await ResultConfig.findOne({
    programId: configDoc.programId,
    semesterNumber: configDoc.semesterNumber,
    year: configDoc.year,
    examType: "regular",
    status: { $ne: "archived" },
  }).lean();

  if (!regularConfig) return;

  const regularResults = await ParsedResult.find({
    resultConfigId: regularConfig._id,
  }).lean();

  const regularMap = new Map();
  for (const r of regularResults) regularMap.set(r.rollNo, r);

  const limits = configDoc.limits || {};

  for (const student of students) {
    const regular = regularMap.get(student.rollNo);
    if (!regular) continue;

    for (const subj of student.subjects) {
      const regSubj = regular.subjects?.find((s) => s.code === subj.code);
      if (!regSubj) continue;

      const rawI = typeof subj.internal === "number" ? subj.internal : 0;
      const rawE = typeof subj.external === "number" ? subj.external : 0;
      const regI = typeof regSubj.internal === "number" ? regSubj.internal : 0;
      const regE = typeof regSubj.external === "number" ? regSubj.external : 0;

      const bestI = Math.max(rawI, regI);
      const bestE = Math.max(rawE, regE);

      subj.internal = bestI;
      subj.external = bestE;
      subj.iDisplay = bestI;
      subj.eDisplay = bestE;

      subj.total = bestI + bestE;
      subj.passed = !subj.isAbsent &&
        bestI >= (limits.minI ?? 10) &&
        bestE >= (limits.minE ?? 30) &&
        subj.total >= (limits.minT ?? 40);
      const gi = subj.passed ? getGradeInfo(subj.total) : { grade: "F", gp: 0 };
      subj.grade = gi.grade;
      subj.gp = gi.gp;
      subj.earned = subj.passed ? subj.credit : 0;
      subj.cg = subj.earned * gi.gp;
    }

    // Practical comparison (split type only)
    if (student.practical?.type === "split" && regular.practical) {
      const p = student.practical;
      const rp = regular.practical;
      const rawPI = typeof p.internal === "number" ? p.internal : 0;
      const rawPE = typeof p.external === "number" ? p.external : 0;
      const regPI = typeof rp.internal === "number" ? rp.internal : 0;
      const regPE = typeof rp.external === "number" ? rp.external : 0;

      const bestPI = Math.max(rawPI, regPI);
      const bestPE = Math.max(rawPE, regPE);

      p.internal = bestPI;
      p.external = bestPE;
      p.iDisplay = bestPI;
      p.eDisplay = bestPE;
      p.total = bestPI + bestPE;
      p.display = p.total;
      p.passed = bestPI >= (p.minI ?? 0) && bestPE >= (p.minE ?? 0) && p.total >= (p.min ?? 0);
      const pgi = p.passed ? getGradeInfo(p.total) : { grade: "F", gp: 0 };
      p.grade = pgi.grade;
      p.gp = pgi.gp;
      p.earned = p.passed ? p.credit : 0;
      p.cg = p.earned * pgi.gp;
    }

    // Recalculate student-level totals
    let totalMarksObt = 0, totalCG = 0, totalCredits = 0, totalEarned = 0;
    for (const s of student.subjects) {
      totalMarksObt += s.total;
      totalCG += s.cg;
      totalCredits += s.credit;
      totalEarned += s.earned;
    }
    if (student.practical) {
      totalMarksObt += student.practical.total || 0;
      totalCG += student.practical.cg || 0;
      totalCredits += student.practical.credit || 0;
      totalEarned += student.practical.earned || 0;
    }
    student.totalMarksObt = totalMarksObt;
    student.totalCG = totalCG;
    student.totalCredits = totalCredits;
    student.totalEarned = totalEarned;
    student.sgpa = totalCredits > 0 ? parseFloat((totalCG / totalCredits).toFixed(2)) : null;
    student.finalGrade = student.sgpa !== null ? getFinalGrade(student.sgpa) : "F";
    student.cgpa = student.sgpa || 0;
    student.allPassed = student.subjects.every((s) => s.passed) &&
      (student.practical ? student.practical.passed : true);

    const hasAbsent = student.subjects.some((s) => s.isAbsent);
    student.remark = hasAbsent ? "ABSENT" : student.allPassed ? "SUCCESSFUL" : "UNSUCCESSFUL";
  }
}

/**
 * POST /api/result-configs/:id/upload-excel
 * Upload a filled standard template (.xlsx) for parsing.
 * Expects multipart form with field name "file".
 */
export const uploadExcel = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ResultConfig.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== ".xlsx" && ext !== ".xls") {
      return res.status(400).json({ success: false, message: "Only .xlsx or .xls files are accepted." });
    }

    // Save file to uploads/excel/ with a safe name
    if (!fs.existsSync(EXCEL_DIR)) fs.mkdirSync(EXCEL_DIR, { recursive: true });
    const safeName = `${doc.slug}${ext}`;
    const filePath = path.join(EXCEL_DIR, safeName);
    fs.writeFileSync(filePath, req.file.buffer);

    // Auto-detect subjects from the Excel if config has none yet
    if (!doc.subjects || doc.subjects.length === 0) {
      const detected = await detectSubjectsFromExcel(filePath);
      if (!detected.subjects.length) {
        return res.status(400).json({ success: false, message: "Could not detect subjects from the uploaded Excel. Check the template format." });
      }
      doc.subjects = detected.subjects;
      if (detected.limits) doc.limits = detected.limits;
      if (detected.practical) doc.practical = detected.practical;
    }

    // Update DB reference
    doc.excelFile = filePath;
    await doc.save();

    // Clear parser cache
    clearCache(`${filePath}::standard`);

    // Parse using standard template format
    try {
      const parserCfg = toParserConfig(doc);
      const students = await readStudentsStandard(parserCfg);

      // Auto-enrich missing PRN and GR from Student DB
      await enrichFromStudentDB(students);

      await applyHighestMarks(students, doc);
      applyGraceMarks(students, doc);

      // Write-through: store parsed data in ParsedResult collection
      if (students.length) {
        const ops = students.map((s) => ({
          updateOne: {
            filter: { resultConfigId: doc._id, rollNo: String(s.rollNo) },
            update: {
              $set: {
                resultConfigId: doc._id,
                rowNumber: s.row,
                seatNo: s.seatNo,
                name: s.name,
                rollNo: String(s.rollNo),
                grNo: s.grNo,
                prn: s.prn,
                subjects: s.subjects,
                practical: s.practical,
                totalMarksObt: s.totalMarksObt,
                maxMarks: s.maxMarks,
                totalCG: s.totalCG,
                totalCredits: s.totalCredits,
                totalEarned: s.totalEarned,
                sgpa: s.sgpa,
                finalGrade: s.finalGrade,
                cgpa: s.cgpa,
                remark: s.remark,
                allPassed: s.allPassed,
              },
            },
            upsert: true,
          },
        }));
        // Remove stale records that no longer exist in the new Excel
        await ParsedResult.deleteMany({
          resultConfigId: doc._id,
          rollNo: { $nin: students.map((s) => String(s.rollNo)) },
        });
        await ParsedResult.bulkWrite(ops, { ordered: false });
      }

      res.status(200).json({
        success: true,
        message: `Excel uploaded. ${students.length} students parsed.`,
        excelFile: filePath,
        studentCount: students.length,
      });
    } catch (parseErr) {
      res.status(200).json({
        success: true,
        message: `Excel uploaded but parsing had issues: ${parseErr.message}`,
        excelFile: filePath,
        parseWarning: parseErr.message,
      });
    }
  } catch (error) {
    console.error("Error uploading Excel:", error);
    res.status(500).json({ success: false, message: "Failed to upload Excel." });
  }
};

/**
 * DELETE /api/result-configs/:id/excel-data
 * Remove all parsed data, the uploaded Excel file, and reset subject/practical/limits config.
 */
export const deleteExcelData = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ResultConfig.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });

    // 1. Delete all ParsedResult records for this config
    const { deletedCount } = await ParsedResult.deleteMany({ resultConfigId: doc._id });

    // 2. Delete all audit records for parsed results of this config
    await ParsedResultAudit.deleteMany({ resultConfigId: doc._id });

    // 3. Delete the Excel file from disk
    if (doc.excelFile) {
      clearCache(`${doc.excelFile}::standard`);
      if (fs.existsSync(doc.excelFile)) {
        fs.unlinkSync(doc.excelFile);
      }
    }

    // 4. Reset config fields
    doc.excelFile = undefined;
    doc.subjects = [];
    doc.practical = null;
    doc.limits = undefined;
    await doc.save();

    res.status(200).json({
      success: true,
      message: `Excel data deleted. ${deletedCount} student records removed.`,
      deletedCount,
    });
  } catch (error) {
    console.error("Error deleting Excel data:", error);
    res.status(500).json({ success: false, message: "Failed to delete Excel data." });
  }
};

/**
 * POST /api/result-configs/:id/sync-from-session
 * Pull published, non-blocked ExamResult data for the linked exam session,
 * transform it into ParsedResult documents, and upsert them.
 * Body may include { practicalSubjectId, practicalType } to identify practical.
 */
export const syncFromSession = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ResultConfig.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });

    if (doc.dataSource !== "exam-session" && doc.dataSource !== "db") {
      return res.status(400).json({ success: false, message: "Config dataSource must be 'exam-session' to sync." });
    }
    if (!doc.examSessionId || !doc.examSessionType) {
      return res.status(400).json({ success: false, message: "examSessionId and examSessionType are required." });
    }

    // Validate session exists
    const isRegular = doc.examSessionType === "RegularExamSession";
    const SessionModel = isRegular ? RegularExamSession : ATKTExamSession;
    const session = await SessionModel.findById(doc.examSessionId).lean();
    if (!session) {
      return res.status(404).json({ success: false, message: "Linked exam session not found." });
    }

    const { practicalSubjectId, practicalType, batch } = req.body || {};

    // ── Step 1: Get enrolled students from enrollments (source of truth for student list) ──
    let enrollments = [];
    if (isRegular) {
      const enrQuery = { examSessionId: doc.examSessionId };
      if (batch) enrQuery.batch = batch;
      enrollments = await RegularExamEnrollment.find(enrQuery)
        .populate("studentId", "studentDetails academicDetails")
        .sort({ rollNumber: 1 })
        .lean();
      enrollments = enrollments.map((e) => ({
        studentId: e.studentId?._id,
        studentName: e.studentName,
        rollNumber: e.rollNumber,
        batch: e.batch,
        subjectIds: e.subjects
          .filter((s) => s.type === "subject" || !s.type)
          .map((s) => s.subjectId?.toString())
          .filter(Boolean),
      }));
    } else {
      const formQuery = { examSessionId: doc.examSessionId, paymentStatus: "paid" };
      if (batch) formQuery.batch = batch;
      const forms = await ATKTForm.find(formQuery)
        .populate("submittedBy", "studentDetails academicDetails")
        .sort({ rollNumber: 1 })
        .lean();
      enrollments = forms.map((f) => ({
        studentId: f.submittedBy?._id || null,
        studentName: f.studentName,
        rollNumber: f.rollNumber,
        batch: f.batch,
        subjectIds: f.subjects
          .filter((s) => s.type !== "section")
          .map((s) => s.subjectId?.toString())
          .filter(Boolean),
      }));
    }

    if (!enrollments.length) {
      return res.status(200).json({
        success: true,
        message: "No enrolled students found" + (batch ? ` (batch: ${batch})` : "") + ".",
        studentCount: 0,
        subjectCount: 0,
      });
    }

    // ── Step 2: Collect all unique subjectIds from enrollments and fetch Subject docs ──
    const allSubjectIds = [...new Set(enrollments.flatMap((e) => e.subjectIds))];
    const subjectDocs = await Subject.find({ _id: { $in: allSubjectIds } })
      .select("subjectName subjectCode credits isElective markingScheme")
      .lean();
    const subjectMap = new Map(subjectDocs.map((s) => [s._id.toString(), s]));

    // Practical subject handling
    const pracSubId = practicalSubjectId || null;
    const pracType = practicalType === "split" ? "split" : "single";

    // Build config subjects array (exclude practical subject)
    const theorySubjects = subjectDocs.filter((s) => s._id.toString() !== pracSubId);
    const configSubjects = theorySubjects.map((s, idx) => ({
      code: parseInt(s.subjectCode) || (idx + 1),
      name: s.subjectName,
      credit: s.credits || 4,
      elective: s.isElective || false,
    }));

    // Build subjectId-to-code mapping
    const subjectIdToCode = new Map();
    theorySubjects.forEach((s, idx) => {
      subjectIdToCode.set(s._id.toString(), parseInt(s.subjectCode) || (idx + 1));
    });

    // Build practical config from the practical Subject doc
    let practicalConfig = null;
    if (pracSubId) {
      const pracDoc = subjectMap.get(pracSubId);
      if (pracDoc) {
        const pracCode = parseInt(pracDoc.subjectCode) || (configSubjects.length + 1);
        const pracMS = pracDoc.markingScheme || [];
        if (pracType === "split") {
          const intScheme = pracMS.find((m) => m.name?.toLowerCase() !== "external");
          const extScheme = pracMS.find((m) => m.name?.toLowerCase() === "external");
          practicalConfig = {
            code: pracCode,
            name: pracDoc.subjectName,
            type: "split",
            credit: pracDoc.credits || 4,
            maxI: intScheme?.value || 25,
            minI: Math.round((intScheme?.value || 25) * 0.4),
            maxE: extScheme?.value || 75,
            minE: Math.round((extScheme?.value || 75) * 0.4),
            max: (intScheme?.value || 25) + (extScheme?.value || 75),
            min: Math.round(((intScheme?.value || 25) + (extScheme?.value || 75)) * 0.4),
          };
        } else {
          const totalMax = pracMS.reduce((sum, m) => sum + (m.value || 0), 0) || 100;
          practicalConfig = {
            code: pracCode,
            name: pracDoc.subjectName,
            type: "single",
            credit: pracDoc.credits || 4,
            max: totalMax,
            min: Math.round(totalMax * 0.4),
          };
        }
      }
    }

    // Auto-build limits from first theory subject's markingScheme
    let limits = { maxI: 25, minI: 10, maxE: 75, minE: 30, maxT: 100, minT: 40 };
    if (theorySubjects[0]?.markingScheme?.length) {
      const ms = theorySubjects[0].markingScheme;
      const internal = ms.find((m) => m.name?.toLowerCase() !== "external");
      const external = ms.find((m) => m.name?.toLowerCase() === "external");
      if (internal?.value) limits.maxI = internal.value;
      if (external?.value) limits.maxE = external.value;
      limits.maxT = limits.maxI + limits.maxE;
      limits.minI = Math.round(limits.maxI * 0.4);
      limits.minE = Math.round(limits.maxE * 0.4);
      limits.minT = limits.minI + limits.minE;
    }

    const minI = limits.minI;
    const minE = limits.minE;
    const minT = limits.minT;

    // ── Step 3: Fetch all ExamResult docs for enrolled students in this session ──
    const enrolledStudentIds = enrollments.map((e) => e.studentId).filter(Boolean);
    const examResults = await ExamResult.find({
      examSessionId: doc.examSessionId,
      studentId: { $in: enrolledStudentIds },
    }).lean();

    // Index ExamResult by (studentId, subjectId) for fast lookup
    const erIndex = new Map();
    for (const er of examResults) {
      const key = `${er.studentId}::${er.subjectId}`;
      erIndex.set(key, er);
    }

    // ── Step 4: Transform each enrolled student into ParsedResult shape ──
    const students = [];
    for (const enr of enrollments) {
      const rollNo = enr.rollNumber || "";
      if (!rollNo) continue;

      const subjects = [];
      let practical = null;

      for (const subId of enr.subjectIds) {
        const subDoc = subjectMap.get(subId);
        if (!subDoc) continue;

        // Look up ExamResult for this student-subject pair (may be undefined)
        const er = enr.studentId ? erIndex.get(`${enr.studentId}::${subId}`) : null;

        // Read raw marks from marks[] array (or 0 if no ExamResult yet)
        let internal = 0;
        let external = 0;
        let isAbsent = false;
        if (er) {
          for (const m of er.marks || []) {
            if (m.schemeName.toLowerCase() === "external") {
              external += m.obtainedMarks || 0;
            } else {
              internal += m.obtainedMarks || 0;
            }
          }
          isAbsent = er.result === "absent";
        }
        const total = internal + external;

        // Check if this is the practical subject
        if (pracSubId && subId === pracSubId) {
          if (pracType === "split") {
            const pMax = practicalConfig?.max || 100;
            const pMin = practicalConfig?.min || 40;
            const pMinI = practicalConfig?.minI || 10;
            const pMinE = practicalConfig?.minE || 30;
            const passed = !isAbsent && internal >= pMinI && external >= pMinE && total >= pMin;
            const gi = passed ? getGradeInfo(total) : { grade: "F", gp: 0 };
            practical = {
              code: practicalConfig?.code,
              name: subDoc.subjectName,
              type: "split",
              internal,
              external,
              total,
              iDisplay: internal,
              eDisplay: external,
              grade: gi.grade,
              gp: gi.gp,
              credit: subDoc.credits || 4,
              earned: passed ? (subDoc.credits || 4) : 0,
              cg: (passed ? (subDoc.credits || 4) : 0) * gi.gp,
              passed,
              maxI: practicalConfig?.maxI,
              minI: pMinI,
              maxE: practicalConfig?.maxE,
              minE: pMinE,
              max: pMax,
              min: pMin,
            };
          } else {
            const pMax = practicalConfig?.max || 100;
            const pMin = practicalConfig?.min || 40;
            const passed = !isAbsent && total >= pMin;
            const gi = passed ? getGradeInfo(total) : { grade: "F", gp: 0 };
            practical = {
              code: practicalConfig?.code,
              name: subDoc.subjectName,
              type: "single",
              marks: total,
              display: total,
              grade: gi.grade,
              gp: gi.gp,
              credit: subDoc.credits || 4,
              earned: passed ? (subDoc.credits || 4) : 0,
              cg: (passed ? (subDoc.credits || 4) : 0) * gi.gp,
              passed,
              max: pMax,
              min: pMin,
            };
          }
          continue;
        }

        // Theory subject
        const code = subjectIdToCode.get(subId);
        if (code === undefined) continue;
        const credit = subDoc.credits || 4;
        const passed = !isAbsent && internal >= minI && external >= minE && total >= minT;
        const gi = passed ? getGradeInfo(total) : { grade: "F", gp: 0 };
        const earned = passed ? credit : 0;
        const cg = earned * gi.gp;

        subjects.push({
          code,
          name: subDoc.subjectName,
          credit,
          internal,
          external,
          total,
          iDisplay: internal,
          eDisplay: external,
          grade: gi.grade,
          gp: gi.gp,
          earned,
          cg,
          passed,
          isAbsent,
        });
      }

      // Compute student-level aggregates including practical
      let totalMarksObt = 0, totalCG = 0, totalCredits = 0, totalEarned = 0;
      for (const s of subjects) {
        totalMarksObt += s.total;
        totalCG += s.cg;
        totalCredits += s.credit;
        totalEarned += s.earned;
      }
      if (practical) {
        totalMarksObt += practical.total || practical.marks || 0;
        totalCG += practical.cg || 0;
        totalCredits += practical.credit || 0;
        totalEarned += practical.earned || 0;
      }

      const maxMarks = subjects.length * (limits.maxT || 100) +
        (practical ? (practical.max || 0) : 0);
      const sgpa = totalCredits > 0
        ? parseFloat((totalCG / totalCredits).toFixed(2))
        : null;
      const finalGrade = sgpa !== null ? getFinalGrade(sgpa) : "F";
      const allPassed = subjects.every((s) => s.passed) &&
        (practical ? practical.passed : true);
      const hasAbsent = subjects.some((s) => s.isAbsent);
      const remark = hasAbsent ? "ABSENT" : allPassed ? "SUCCESSFUL" : "UNSUCCESSFUL";

      students.push({
        rollNo,
        name: enr.studentName || "",
        subjects,
        practical,
        totalMarksObt,
        maxMarks,
        totalCG,
        totalCredits,
        totalEarned,
        sgpa,
        finalGrade,
        cgpa: sgpa || 0,
        remark,
        allPassed,
      });
    }

    // Apply grace marks and highest marks (ATKT)
    applyGraceMarks(students, { limits });
    await applyHighestMarks(students, doc);

    // Enrich PRN from Student DB
    await enrichFromStudentDB(students);

    // Upsert into ParsedResult
    if (students.length) {
      const ops = students.map((s) => ({
        updateOne: {
          filter: { resultConfigId: doc._id, rollNo: String(s.rollNo) },
          update: {
            $set: {
              resultConfigId: doc._id,
              name: s.name,
              rollNo: String(s.rollNo),
              grNo: s.grNo,
              prn: s.prn,
              subjects: s.subjects,
              practical: s.practical,
              totalMarksObt: s.totalMarksObt,
              maxMarks: s.maxMarks,
              totalCG: s.totalCG,
              totalCredits: s.totalCredits,
              totalEarned: s.totalEarned,
              sgpa: s.sgpa,
              finalGrade: s.finalGrade,
              cgpa: s.cgpa,
              remark: s.remark,
              allPassed: s.allPassed,
            },
          },
          upsert: true,
        },
      }));
      await ParsedResult.deleteMany({
        resultConfigId: doc._id,
        rollNo: { $nin: students.map((s) => String(s.rollNo)) },
      });
      await ParsedResult.bulkWrite(ops, { ordered: false });
    }

    // Update config with auto-detected subjects, limits, practical, and sync params
    doc.subjects = configSubjects;
    doc.limits = limits;
    doc.practical = practicalConfig;
    if (batch) doc.syncBatch = batch;
    if (pracSubId) doc.practicalSubjectId = pracSubId;
    if (practicalType) doc.practicalType = pracType;
    await doc.save();

    res.status(200).json({
      success: true,
      message: `Synced from session. ${students.length} students processed.`,
      studentCount: students.length,
      subjectCount: configSubjects.length,
    });
  } catch (error) {
    console.error("Error syncing from session:", error);
    res.status(500).json({ success: false, message: "Failed to sync from session." });
  }
};

/**
 * Auto-detect subjects, limits, and practical from an uploaded Excel template.
 * Reads row 3 (subject names), row 4 (I/E/T sub-headers), row 5 (max marks), row 6 (min marks).
 * Subject headers start at column 5, each spanning 3 columns.
 * After subjects: optional "Practical", then "Total Marks", then fixed right cols.
 */
async function detectSubjectsFromExcel(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) return { subjects: [], limits: null, practical: null };

  const NON_SUBJECT_HEADERS = ["practical", "total marks", "remark", "credit", "prn", "gp", "sgpa"];
  const subjects = [];
  let practical = null;

  // Scan row 3 starting at column 5 (fixedLeft=4)
  let col = 5;
  while (col <= ws.columnCount) {
    const cell = ws.getCell(3, col);
    const val = (cell.value || "").toString().trim();
    if (!val) break;

    const lower = val.toLowerCase();
    if (NON_SUBJECT_HEADERS.includes(lower)) {
      // Check for Practical
      if (lower === "practical") {
        const maxVal = ws.getCell(5, col).value;
        const minVal = ws.getCell(6, col).value;
        const lastSubjectCode = subjects.length > 0 ? subjects[subjects.length - 1].code : 0;
        practical = {
          code: (lastSubjectCode || subjects.length) + 1,
          name: val,
          max: parseInt(maxVal) || 100,
          min: parseInt(minVal) || 40,
          credit: 4,
        };
        col++;
      }
      break;
    }

    // Parse "SubjectName (SubjectCode)" format
    let name = val;
    let code = String(subjects.length + 1);
    const match = val.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (match) {
      name = match[1].trim();
      code = match[2].trim();
    }

    subjects.push({ name, code, credit: 4, elective: false });
    col += 3; // each subject spans 3 columns (I, E, T)
  }

  // Look up credits and elective flag from Subject DB by code
  const codes = subjects.map((s) => s.code).filter((c) => c && !/^\d+$/.test(c) || parseInt(c) > 0);
  if (codes.length) {
    const dbSubjects = await Subject.find({ subjectCode: { $in: codes } }).lean();
    const codeMap = new Map(dbSubjects.map((s) => [String(s.subjectCode), s]));
    for (const s of subjects) {
      const dbMatch = codeMap.get(String(s.code));
      if (dbMatch) {
        if (dbMatch.credits) s.credit = dbMatch.credits;
        if (dbMatch.isElective) s.elective = true;
      }
    }
  }

  // Read limits from row 5 (max) and row 6 (min) -- use first subject's values
  let limits = { maxI: 25, minI: 10, maxE: 75, minE: 30, maxT: 100, minT: 40 };
  if (subjects.length > 0) {
    const maxI = parseInt(ws.getCell(5, 5).value) || 25;
    const maxE = parseInt(ws.getCell(5, 6).value) || 75;
    const maxT = parseInt(ws.getCell(5, 7).value) || maxI + maxE;
    const minI = parseInt(ws.getCell(6, 5).value) || 10;
    const minE = parseInt(ws.getCell(6, 6).value) || 30;
    const minT = parseInt(ws.getCell(6, 7).value) || minI + minE;
    limits = { maxI, minI, maxE, minE, maxT, minT };
  }

  return { subjects, limits, practical };
}

/**
 * Fill missing PRN from Student DB by matching roll numbers.
 * GR is no longer enriched here — it is always fetched from Student model at render time.
 * Mutates the students array in-place.
 */
async function enrichFromStudentDB(students) {
  const needEnrich = students.filter((s) => !s.prn);
  if (!needEnrich.length) return;

  const rollNos = needEnrich.map((s) => String(s.rollNo).trim());
  const dbStudents = await Student.find({
    "academicDetails.rollNumber": { $in: rollNos },
  }).select("academicDetails.rollNumber studentDetails.prnNumber").lean();

  const rollMap = new Map();
  for (const db of dbStudents) {
    const roll = String(db.academicDetails?.rollNumber).trim();
    const prn = db.studentDetails?.prnNumber || null;
    if (roll && prn) rollMap.set(roll, prn);
  }

  for (const s of needEnrich) {
    const prn = rollMap.get(String(s.rollNo).trim());
    if (prn) s.prn = String(prn);
  }
}

// Helper: convert DB ResultConfig doc to the shape readStudentsStandard() expects.
// Must call .toObject() on Mongoose subdocs so that spread (...subj) works in the parser.
function toParserConfig(doc) {
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    file: plain.excelFile,
    subjects: plain.subjects || [],
    limits: plain.limits || {},
    practical: plain.practical || null,
    remarkMap: plain.remarkMap ? Object.fromEntries(plain.remarkMap) : null,
  };
}

/**
 * Shared helper: build a university-style Excel workbook.
 * Accepts either a full config doc OR a generic options object.
 * Layout:
 *   Row 1: Institution name (merged)
 *   Row 2: Programme + Semester info (merged)
 *   Row 3: Subject names spanning I/E/T, fixed cols merged to row 4
 *   Row 4: I / E / T sub-headers
 *   Row 5: Max marks
 *   Row 6: Min marks
 *   Row 7+: Data
 *
 * Columns: Seat | Name | Roll | GR | [I|E|T per subject] | Practical |
 *          Grand Total | Total Marks | Remark | Credit | PRN | GP | SGPA
 */
function buildResultWorkbook(opts, records = null, studentInfo = null) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Result Data");

  const subjectDefs = opts.subjects || [];
  const hasPractical = !!opts.practical;
  const limits = opts.limits || {};
  const pracMax = opts.practical?.max ?? 100;
  const pracMin = opts.practical?.min ?? 40;

  // Column groups
  const fixedLeft = 4; // Seat, Name, Roll, GR
  const subjCols = subjectDefs.length * 3;
  const pracType = opts.practical?.type || "single";
  const pracCols = hasPractical ? (pracType === "split" ? 3 : 1) : 0;
  const fixedRight = 6; // Total Marks, Remark, Credit, PRN, GP, SGPA
  const totalCols = fixedLeft + subjCols + pracCols + fixedRight;

  // Max possible marks for Total Marks column (account for elective groups)
  const maxT = limits.maxT ?? 100;
  const coreSubjectCount = subjectDefs.filter((s) => !s.elective).length;
  const hasElectives = subjectDefs.some((s) => s.elective);
  const electivePicks = hasElectives && records?.length > 0
    ? records[0].subjects.length - coreSubjectCount
    : 0;
  const effectiveSubjectCount = coreSubjectCount + (hasElectives ? electivePicks : 0);
  const totalMarksMax = effectiveSubjectCount * maxT + (hasPractical ? pracMax : 0);

  // Styles
  const boldFont = { bold: true, size: 10 };
  const boldSmFont = { bold: true, size: 9 };
  const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  const subtitleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } };
  const thinBorder = {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "thin" }, right: { style: "thin" },
  };
  const mediumLeftBorder = {
    top: { style: "thin" }, bottom: { style: "thin" },
    left: { style: "medium" }, right: { style: "thin" },
  };

  // ── Row 1: Institution name ───────────────────────────
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell("A1");
  titleCell.value = "AGNEL SCHOOL OF LAW";
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = titleFill;
  ws.getRow(1).height = 28;

  // ── Row 2: Programme + Semester + Year ─────────────────
  ws.mergeCells(2, 1, 2, totalCols);
  const subtitleCell = ws.getCell("A2");
  const parts = [opts.programme || "", opts.semester || ""];
  if (opts.year) parts.push(opts.year);
  if (opts.examMonth) parts.push(`(${opts.examMonth})`);
  if (opts.examType) parts.push(`[${opts.examType.toUpperCase()}]`);
  const subtitle = parts.filter(Boolean).join("  -  ");
  subtitleCell.value = subtitle || "Result Data Entry Template";
  subtitleCell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
  subtitleCell.fill = subtitleFill;
  ws.getRow(2).height = 24;

  // ── Row 3-6: Fixed left headers (merge rows 3-6) ─────
  const fixedLeftHeaders = ["Seat No", "Name", "Roll No", "GR No"];
  fixedLeftHeaders.forEach((h, i) => {
    const col = i + 1;
    ws.mergeCells(3, col, 6, col);
    const cell = ws.getCell(3, col);
    cell.value = h;
    cell.font = boldFont;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  });

  // ── Row 3: Subject name headers (each spans 3 cols) ───
  let colOff = fixedLeft + 1;
  subjectDefs.forEach((subj) => {
    ws.mergeCells(3, colOff, 3, colOff + 2);
    const cell = ws.getCell(3, colOff);
    cell.value = subj.name;
    cell.font = boldSmFont;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
    colOff += 3;
  });

  // Practical + Total Marks headers
  if (hasPractical) {
    const pracName = opts.practical.name || "Practical";
    if (pracType === "split") {
      // Split practical: name spans 3 cols in row 3, I/E/T sub-headers in row 4
      ws.mergeCells(3, colOff, 3, colOff + 2);
      const pracHeaderCell = ws.getCell(3, colOff);
      pracHeaderCell.value = pracName;
      pracHeaderCell.font = boldSmFont;
      pracHeaderCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      pracHeaderCell.border = thinBorder;
      colOff += 3;
    } else {
      // Single practical: merge rows 3-4
      ws.mergeCells(3, colOff, 4, colOff);
      const pracHeaderCell = ws.getCell(3, colOff);
      pracHeaderCell.value = pracName;
      pracHeaderCell.font = boldSmFont;
      pracHeaderCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      pracHeaderCell.border = thinBorder;
      colOff++;
    }
  }
  // Total Marks: merge rows 3-4
  ws.mergeCells(3, colOff, 4, colOff);
  const totalMarksHeaderCell = ws.getCell(3, colOff);
  totalMarksHeaderCell.value = "Total Marks";
  totalMarksHeaderCell.font = boldSmFont;
  totalMarksHeaderCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  totalMarksHeaderCell.border = thinBorder;
  colOff++;

  // Remark, Credit, PRN, GP, SGPA: merge rows 3-6 (tall single columns)
  const tallRightHeaders = ["Remark", "Credit", "PRN", "GP", "SGPA"];
  tallRightHeaders.forEach((h) => {
    ws.mergeCells(3, colOff, 6, colOff);
    const cell = ws.getCell(3, colOff);
    cell.value = h;
    cell.font = boldSmFont;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
    colOff++;
  });

  // ── Row 4: I / E / T sub-headers ─────────────────────
  colOff = fixedLeft + 1;
  subjectDefs.forEach(() => {
    ["I", "E", "T"].forEach((label, idx) => {
      const cell = ws.getRow(4).getCell(colOff + idx);
      cell.value = label;
      cell.font = boldSmFont;
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder;
    });
    colOff += 3;
  });
  // Split practical I/E/T sub-headers in row 4
  if (hasPractical && pracType === "split") {
    ["I", "E", "T"].forEach((label, idx) => {
      const cell = ws.getRow(4).getCell(colOff + idx);
      cell.value = label;
      cell.font = boldSmFont;
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder;
    });
  }

  // ── Row 5: Max marks ──────────────────────────────────
  colOff = fixedLeft + 1;
  subjectDefs.forEach(() => {
    [limits.maxI ?? 25, limits.maxE ?? 75, limits.maxT ?? 100].forEach((v, k) => {
      const cell = ws.getCell(5, colOff + k);
      cell.value = v;
      cell.font = boldSmFont;
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder;
    });
    colOff += 3;
  });
  if (hasPractical) {
    if (pracType === "split") {
      const pracMaxI = opts.practical?.maxI ?? 25;
      const pracMaxE = opts.practical?.maxE ?? 75;
      [pracMaxI, pracMaxE, pracMax].forEach((v, k) => {
        const cell = ws.getCell(5, colOff + k);
        cell.value = v;
        cell.font = boldSmFont;
        cell.alignment = { horizontal: "center" };
        cell.border = thinBorder;
      });
      colOff += 3;
    } else {
      const pc = ws.getCell(5, colOff);
      pc.value = pracMax;
      pc.font = boldSmFont;
      pc.alignment = { horizontal: "center" };
      pc.border = thinBorder;
      colOff++;
    }
  }
  // Total Marks max value
  const tmCell = ws.getCell(5, colOff);
  tmCell.value = totalMarksMax;
  tmCell.font = boldSmFont;
  tmCell.alignment = { horizontal: "center" };
  tmCell.border = thinBorder;

  // ── Row 6: Min marks ──────────────────────────────────
  colOff = fixedLeft + 1;
  subjectDefs.forEach(() => {
    [limits.minI ?? 10, limits.minE ?? 30, limits.minT ?? 40].forEach((v, k) => {
      const cell = ws.getCell(6, colOff + k);
      cell.value = v;
      cell.font = boldSmFont;
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder;
    });
    colOff += 3;
  });
  if (hasPractical) {
    if (pracType === "split") {
      const pracMinI = opts.practical?.minI ?? 10;
      const pracMinE = opts.practical?.minE ?? 30;
      [pracMinI, pracMinE, pracMin].forEach((v, k) => {
        const cell = ws.getCell(6, colOff + k);
        cell.value = v;
        cell.font = boldSmFont;
        cell.alignment = { horizontal: "center" };
        cell.border = thinBorder;
      });
      colOff += 3;
    } else {
      const pc = ws.getCell(6, colOff);
      pc.value = pracMin;
      pc.font = boldSmFont;
      pc.alignment = { horizontal: "center" };
      pc.border = thinBorder;
      colOff++;
    }
  }
  // Total Marks min value (account for elective groups)
  const minT = limits.minT ?? 40;
  const totalMarksMin = effectiveSubjectCount * minT + (hasPractical ? pracMin : 0);
  const tmMinCell = ws.getCell(6, colOff);
  tmMinCell.value = totalMarksMin;
  tmMinCell.font = boldSmFont;
  tmMinCell.alignment = { horizontal: "center" };
  tmMinCell.border = thinBorder;

  // ── Column widths ─────────────────────────────────────
  const colWidths = [8, 24, 10, 8]; // Seat, Name, Roll, GR
  for (let i = 0; i < subjectDefs.length; i++) colWidths.push(8, 8, 8);
  if (hasPractical) {
    if (pracType === "split") {
      colWidths.push(8, 8, 8); // I, E, T for split practical
    } else {
      colWidths.push(10); // single practical
    }
  }
  colWidths.push(12, 10, 8, 14, 8, 8); // TotalMarks, Remark, Credit, PRN, GP, SGPA
  ws.columns = colWidths.map((w) => ({ width: w }));

  // Row heights
  ws.getRow(3).height = 24;
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 16;
  ws.getRow(6).height = 16;

  // Comprehensive styling: borders on all header cells (rows 1-6)
  for (let r = 1; r <= 6; r++) {
    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(r, c);
      cell.border = thinBorder;
    }
  }

  // Subject group separators: medium left border at each group start
  for (let r = 3; r <= 6; r++) {
    for (let s = 0; s < subjectDefs.length; s++) {
      ws.getCell(r, fixedLeft + 1 + s * 3).border = mediumLeftBorder;
    }
    ws.getCell(r, fixedLeft + subjCols + 1).border = mediumLeftBorder;
  }

  // Freeze at row 7, col 5
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 6 }];

  // ── Data rows (row 7+) ────────────────────────────────
  if (records && records.length > 0) {
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const dataRow = ws.getRow(7 + i);
      let col = 1;

      const info = studentInfo?.get(rec.rollNo) || {};
      dataRow.getCell(col++).value = rec.seatNo ?? (i + 1); // Seat
      dataRow.getCell(col++).value = info.name || "";
      dataRow.getCell(col++).value = rec.rollNo;
      dataRow.getCell(col++).value = info.grNo || "";

      // Per-subject I/E/T -- use display values (grace marks, ATKT decorations, absent)
      for (let j = 0; j < subjectDefs.length; j++) {
        const subjRec = rec.subjects?.find((s) => s.code === subjectDefs[j].code);
        const iVal = subjRec?.internalAbsent ? "AB" : (subjRec?.iDisplay ?? subjRec?.internal ?? "");
        const eVal = subjRec?.externalAbsent ? "AB" : (subjRec?.eDisplay ?? subjRec?.external ?? "");
        const tVal = subjRec?.isAbsent ? "AB" : (subjRec?.total ?? "");
        dataRow.getCell(col++).value = iVal;
        dataRow.getCell(col++).value = eVal;
        dataRow.getCell(col++).value = tVal;
      }

      // Practical
      if (hasPractical) {
        const p = rec.practical;
        if (pracType === "split") {
          dataRow.getCell(col++).value = p?.iDisplay ?? p?.internal ?? "";
          dataRow.getCell(col++).value = p?.eDisplay ?? p?.external ?? "";
          dataRow.getCell(col++).value = p?.total ?? "";
        } else {
          const pracVal = p?.display ?? p?.marks ?? p?.total ?? "";
          dataRow.getCell(col++).value = pracVal;
        }
      }

      // Total Marks (grand total) -- use stored value to match PDF
      dataRow.getCell(col++).value = rec.totalMarksObt ?? "";
      // Remark
      dataRow.getCell(col++).value = rec.remark || "";
      // Credit
      dataRow.getCell(col++).value = rec.totalCredits ?? "";
      // PRN
      dataRow.getCell(col++).value = info.prn || "";
      // GP
      dataRow.getCell(col++).value = rec.totalCG ?? "";
      // SGPA
      dataRow.getCell(col++).value = rec.sgpa ?? "";

      // Borders + center alignment
      for (let c = 1; c <= totalCols; c++) {
        dataRow.getCell(c).border = thinBorder;
        dataRow.getCell(c).alignment = { horizontal: "center" };
      }
      dataRow.getCell(2).alignment = { horizontal: "left" }; // Name left

      // Subject group separators in data rows
      for (let s = 0; s < subjectDefs.length; s++) {
        dataRow.getCell(fixedLeft + 1 + s * 3).border = mediumLeftBorder;
      }
      dataRow.getCell(fixedLeft + subjCols + 1).border = mediumLeftBorder;
    }

    // ── Footer: Declaration & Signature block ──────────────────
    const lastDataRow = 6 + records.length;
    const footerStartRow = lastDataRow + 2;

    const declarationDate = opts.resultDeclaredOn || new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    ws.mergeCells(footerStartRow, 1, footerStartRow, totalCols);
    const declarationCell = ws.getCell(footerStartRow, 1);
    declarationCell.value = `RESULT DECLARED AS ON ${declarationDate}`;
    declarationCell.font = { bold: true, size: 11 };
    declarationCell.alignment = { horizontal: "left", vertical: "middle" };

    // Blank rows for handwritten signatures
    for (let gap = 1; gap <= 3; gap++) {
      ws.getRow(footerStartRow + gap).height = 30;
    }

    const signatureRow1 = footerStartRow + 4;
    const signatureRow2 = signatureRow1 + 1;
    const signatureRow3 = signatureRow2 + 1;

    const sectionWidth = Math.floor(totalCols / 5);
    const signatures = [
      { title: "Prepared By", name: "Mr. Vikram Solay", designation: "Examination Assistant" },
      { title: "Crossed Checked By", name: "Mrs. Annie Samaya", designation: "Examination Incharge" },
      { title: "Approved By", name: "Mrs. Anureshma V P", designation: "Controller of Examination" },
      { title: "Declared By", name: "Dr. Rajesh Sakhare", designation: "I/C Principal" },
      { title: "", name: "(College Seal)", designation: "" },
    ];

    signatures.forEach((sig, idx) => {
      const startCol = 1 + idx * sectionWidth;
      const endCol = Math.min(startCol + sectionWidth - 1, totalCols);

      ws.mergeCells(signatureRow1, startCol, signatureRow1, endCol);
      const titleCell = ws.getCell(signatureRow1, startCol);
      titleCell.value = sig.title;
      titleCell.font = { size: 10 };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };

      ws.mergeCells(signatureRow2, startCol, signatureRow2, endCol);
      const nameCell = ws.getCell(signatureRow2, startCol);
      nameCell.value = sig.name;
      nameCell.font = { bold: true, size: 10 };
      nameCell.alignment = { horizontal: "center", vertical: "middle" };

      ws.mergeCells(signatureRow3, startCol, signatureRow3, endCol);
      const desigCell = ws.getCell(signatureRow3, startCol);
      desigCell.value = sig.designation;
      desigCell.font = { size: 9 };
      desigCell.alignment = { horizontal: "center", vertical: "middle" };
    });
  }

  // ── Instructions sheet (only for empty templates, not exports) ──
  if (!records || records.length === 0) {
    const iws = wb.addWorksheet("Instructions");

    // Colors
    const fills = {
      title:    { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } },
      section:  { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } },
      required: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } },
      optional: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } },
      auto:     { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } },
      warning:  { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4E4" } },
      example:  { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } },
    };

    const fonts = {
      title:      { bold: true, size: 16, color: { argb: "FFFFFFFF" } },
      section:    { bold: true, size: 12, color: { argb: "FFFFFFFF" } },
      label:      { bold: true, size: 10 },
      normal:     { size: 10 },
      tag:        { bold: true, size: 9 },
      warning:    { bold: true, size: 10, color: { argb: "FFCC0000" } },
      exampleVal: { size: 10, color: { argb: "FF555555" }, italic: true },
    };

    const borderAll = {
      top: { style: "thin", color: { argb: "FFD0D0D0" } },
      bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
      left: { style: "thin", color: { argb: "FFD0D0D0" } },
      right: { style: "thin", color: { argb: "FFD0D0D0" } },
    };

    // Column widths: A = labels/descriptions, B = type tag, C = examples/notes
    iws.getColumn(1).width = 55;
    iws.getColumn(2).width = 14;
    iws.getColumn(3).width = 40;

    let row = 1;

    // Helper: write a section header spanning 3 columns
    const addSectionHeader = (text) => {
      iws.mergeCells(row, 1, row, 3);
      const c = iws.getCell(row, 1);
      c.value = text;
      c.font = fonts.section;
      c.fill = fills.section;
      c.alignment = { vertical: "middle" };
      c.border = borderAll;
      iws.getRow(row).height = 26;
      row++;
    };

    // Helper: write a data row with column, type tag, and note
    const addRow = (col1, tag, col3, tagFill) => {
      const c1 = iws.getCell(row, 1);
      c1.value = col1;
      c1.font = fonts.normal;
      c1.border = borderAll;
      c1.alignment = { vertical: "middle", wrapText: true };

      const c2 = iws.getCell(row, 2);
      c2.value = tag;
      c2.font = fonts.tag;
      c2.alignment = { horizontal: "center", vertical: "middle" };
      c2.border = borderAll;
      if (tagFill) c2.fill = tagFill;

      const c3 = iws.getCell(row, 3);
      c3.value = col3;
      c3.font = fonts.exampleVal;
      c3.border = borderAll;
      c3.alignment = { vertical: "middle", wrapText: true };

      row++;
    };

    // Helper: write a plain text row spanning 3 columns
    const addNote = (text, font, fill) => {
      iws.mergeCells(row, 1, row, 3);
      const c = iws.getCell(row, 1);
      c.value = text;
      c.font = font || fonts.normal;
      c.border = borderAll;
      c.alignment = { vertical: "middle", wrapText: true };
      if (fill) c.fill = fill;
      row++;
    };

    // ── Title ──
    iws.mergeCells(row, 1, row, 3);
    const titleCell = iws.getCell(row, 1);
    titleCell.value = "RESULT DATA ENTRY -- INSTRUCTIONS";
    titleCell.font = fonts.title;
    titleCell.fill = fills.title;
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.border = borderAll;
    iws.getRow(row).height = 36;
    row++;

    // ── Blank spacer ──
    row++;

    // ── Section 1: Sheet Layout ──
    addSectionHeader("SHEET LAYOUT");
    addNote("Rows 1-2:  Institution & programme header (do NOT edit)");
    addNote("Row 3:       Subject names (each spans 3 columns: I / E / T)");
    addNote("Row 4:       Sub-headers -- I = Internal, E = External, T = Total");
    addNote("Row 5:       Maximum marks for each column");
    addNote("Row 6:       Minimum passing marks for each column");
    addNote("Row 7+:     Enter one student per row starting here");
    row++;

    // ── Section 2: Column Reference ──
    addSectionHeader("COLUMN REFERENCE");

    // Sub-header row
    iws.getCell(row, 1).value = "Column";
    iws.getCell(row, 1).font = fonts.label;
    iws.getCell(row, 1).border = borderAll;
    iws.getCell(row, 2).value = "Type";
    iws.getCell(row, 2).font = fonts.label;
    iws.getCell(row, 2).alignment = { horizontal: "center" };
    iws.getCell(row, 2).border = borderAll;
    iws.getCell(row, 3).value = "Example / Notes";
    iws.getCell(row, 3).font = fonts.label;
    iws.getCell(row, 3).border = borderAll;
    row++;

    addRow("Seat No -- Sequential seat number",                 "REQUIRED",  "1, 2, 3...",           fills.required);
    addRow("Name -- Full name of the student",                   "REQUIRED",  "Rahul Sharma",         fills.required);
    addRow("Roll No -- Official roll number (must be unique)",   "REQUIRED",  "A101, 2024001",        fills.required);
    addRow("GR No -- General register number",                   "OPTIONAL",  "GR-1234",              fills.optional);
    addRow("Internal (I) -- Internal marks for each subject",    "REQUIRED",  "20, AB, 25+5",         fills.required);
    addRow("External (E) -- External marks for each subject",    "REQUIRED",  "60, RR, 70+3",         fills.required);
    addRow("Total (T) -- Subject total",                         "AUTO",      "Leave blank or fill; recalculated on upload", fills.auto);
    if (hasPractical) {
      addRow("Practical -- Practical marks",                       "REQUIRED",  "75, AB",               fills.required);
    }
    addRow("Total Marks -- Grand total of all subjects",         "AUTO",      "Leave blank; calculated on upload", fills.auto);
    addRow("Remark -- Result status (see valid values below)",   "OPTIONAL",  "P, Pass, Fail, Absent; auto-derived if blank", fills.optional);
    addRow("Credit -- Total credits earned",                     "AUTO",      "Leave blank; calculated on upload", fills.auto);
    addRow("PRN -- Permanent Registration Number",               "OPTIONAL",  "PRN-2024-001",         fills.optional);
    addRow("GP -- Grade points",                                 "AUTO",      "Leave blank; calculated on upload", fills.auto);
    addRow("SGPA -- Semester GPA",                               "AUTO",      "Leave blank; calculated on upload", fills.auto);
    row++;

    // ── Section 3: Valid Remark Values ──
    addSectionHeader("VALID REMARK VALUES");
    addRow("P  /  Pass  /  Successful",   "", "Stored as SUCCESSFUL",        null);
    addRow("F  /  Fail  /  Unsuccessful", "", "Stored as UNSUCCESSFUL",      null);
    addRow("Absent",                      "", "Stored as ABSENT",            null);
    addRow("RR  /  Result Restricted",    "", "Stored as RESULT RESTRICTED", null);
    row++;

    // ── Section 4: Special Status Codes ──
    addSectionHeader("SPECIAL STATUS CODES (for I / E mark cells)");
    addRow("AB  or  (AB)  or  Absent",    "", "Marks treated as Absent",     null);
    addRow("RR  or  (RR)",                "", "Result Restricted",           null);
    row++;

    // ── Section 5: Grace Marks ──
    addSectionHeader("GRACE MARKS FORMAT");
    addNote("Enter grace marks as:  original + grace    (e.g. 25+5)", fonts.normal, fills.example);
    addNote("The system stores the display value \"25+5\" and computes total as 30.", fonts.exampleVal, fills.example);
    row++;

    // ── Section 6: Rules ──
    addSectionHeader("IMPORTANT RULES");
    addNote("Do NOT modify rows 1-6 (headers). The system depends on exact column positions.", fonts.warning, fills.warning);
    addNote("Do NOT insert, delete, or rearrange columns. Column order must match exactly.", fonts.warning, fills.warning);
    addNote("Do NOT rename the \"Result Data\" sheet.", fonts.warning, fills.warning);
    addNote("Leave rows blank at the end. The parser stops after 10 consecutive empty rows.", fonts.normal);
    addNote("Each Roll No must be unique within the sheet. Duplicates will overwrite.", fonts.normal);

    // ── Color Legend ──
    row++;
    addSectionHeader("COLOR LEGEND");
    addRow("Yellow = REQUIRED -- You must fill this column",     "REQUIRED",  "", fills.required);
    addRow("Green = OPTIONAL -- Fill if available",              "OPTIONAL",  "", fills.optional);
    addRow("Blue = AUTO -- Leave blank; calculated on upload",   "AUTO",      "", fills.auto);
    addRow("Red = WARNING -- Critical rules, do not ignore",     "",          "", fills.warning);
  }

  return wb;
}

/**
 * GET /api/result-configs/:id/export-excel
 * Export SemesterResult data from DB in university-style Excel format.
 */
export const exportExcel = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ResultConfig.findById(id).lean()
      || await ResultConfig.findOne({ slug: id }).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });

    // Single source: ParsedResult has all data (marks + name/grNo/prn)
    const parsed = await ParsedResult.find({ resultConfigId: doc._id })
      .sort({ rollNo: 1 })
      .lean();

    if (parsed.length === 0) {
      return res.status(404).json({ success: false, message: "No result records found for this config." });
    }

    // Build studentInfo map for buildResultWorkbook (name, grNo, prn)
    const studentInfo = new Map();
    for (const s of parsed) {
      const key = String(s.rollNo).trim();
      if (key) {
        studentInfo.set(key, {
          name: s.name || "",
          grNo: s.grNo != null ? String(s.grNo) : "",
          prn: s.prn != null ? String(s.prn) : "",
        });
      }
    }

    // Fill remaining gaps from Student collection
    const missingRolls = parsed
      .map((r) => String(r.rollNo).trim())
      .filter((rn) => {
        const info = studentInfo.get(rn);
        return !info || !info.name || !info.grNo || !info.prn;
      });

    if (missingRolls.length > 0) {
      const digitSet = new Set();
      for (const rn of missingRolls) {
        const d = String(rn).replace(/\D/g, "");
        if (d) digitSet.add(d);
      }
      if (digitSet.size > 0) {
        const pattern = new RegExp(`^[A-Za-z]*(${[...digitSet].join("|")})$`);
        const dbStudents = await Student.find({
          "academicDetails.rollNumber": { $regex: pattern },
        })
          .select("academicDetails.rollNumber studentDetails.grNumber studentDetails.prnNumber studentDetails.firstName studentDetails.middleName studentDetails.lastName")
          .lean();

        for (const s of dbStudents) {
          const rn = s.academicDetails?.rollNumber;
          if (!rn) continue;
          const details = s.studentDetails || {};
          const fullName = [details.firstName, details.middleName, details.lastName].filter(Boolean).join(" ");
          const existing = studentInfo.get(rn) || {};
          studentInfo.set(rn, {
            name: existing.name || fullName || "",
            grNo: existing.grNo || details.grNumber || "",
            prn: existing.prn || details.prnNumber || "",
          });
        }
      }
    }

    await decorateATKTExemptions(parsed, doc);

    // Strip elective subjects that were recorded as all-zeros (never taken)
    stripEmptyElectives(parsed, doc);

    const wb = buildResultWorkbook(doc, parsed, studentInfo);

    const filename = `${doc.slug}_export.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting Excel:", error);
    res.status(500).json({ success: false, message: "Failed to export Excel." });
  }
};

/**
 * GET /api/result-configs/:id/publish-status
 * Returns publish counts and flags for a result config.
 */
export const getPublishStatus = async (req, res) => {
  try {
    const doc = await ResultConfig.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });

    const [agg] = await ParsedResult.aggregate([
      { $match: { resultConfigId: doc._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          published: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$isPublished", true] }, { $ne: ["$isRestricted", true] }] },
                1,
                0,
              ],
            },
          },
          restricted: { $sum: { $cond: [{ $eq: ["$isRestricted", true] }, 1, 0] } },
          lastPublishedAt: { $max: "$publishedAt" },
        },
      },
    ]);

    const total = agg?.total || 0;
    const published = agg?.published || 0;
    const restricted = agg?.restricted || 0;

    res.status(200).json({
      success: true,
      status: {
        total,
        published,
        unpublished: total - published - restricted,
        restricted,
        isFullyPublished: published === total && total > 0,
        hasAnyPublished: published > 0,
        hasExamSessionId: !!doc.examSessionId,
        publishedAt: agg?.lastPublishedAt || null,
      },
    });
  } catch (error) {
    console.error("Error fetching publish status:", error);
    res.status(500).json({ success: false, message: "Failed to fetch publish status." });
  }
};

/**
 * POST /api/result-configs/:id/publish
 * Publish all ParsedResults for a config. Only works for configs with examSessionId.
 * Body: { restrictedRollNos?: string[] }
 */
export const publishResults = async (req, res) => {
  try {
    const doc = await ResultConfig.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });

    if (!doc.examSessionId) {
      return res.status(400).json({
        success: false,
        message: "Publishing is only available for configs with an exam session data source.",
      });
    }

    const { blockedRollNos = [], restrictedRollNos = blockedRollNos } = req.body;

    // Mark all as published and non-restricted
    await ParsedResult.updateMany(
      { resultConfigId: doc._id },
      { $set: { isPublished: true, publishedAt: new Date(), isRestricted: false } }
    );

    // Restrict specific students and set their remark to RESULT RESTRICTED
    if (restrictedRollNos.length > 0) {
      await ParsedResult.updateMany(
        { resultConfigId: doc._id, rollNo: { $in: restrictedRollNos } },
        { $set: { isRestricted: true, remark: "RESULT RESTRICTED" } }
      );
    }

    res.status(200).json({ success: true, message: "Results published." });
  } catch (error) {
    console.error("Error publishing results:", error);
    res.status(500).json({ success: false, message: "Failed to publish results." });
  }
};

/**
 * POST /api/result-configs/:id/unpublish
 * Revert all ParsedResults for a config to unpublished.
 */
export const unpublishResults = async (req, res) => {
  try {
    const doc = await ResultConfig.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });

    await ParsedResult.updateMany(
      { resultConfigId: doc._id },
      { $set: { isPublished: false, isRestricted: false }, $unset: { publishedAt: "" } }
    );

    res.status(200).json({ success: true, message: "Results unpublished." });
  } catch (error) {
    console.error("Error unpublishing results:", error);
    res.status(500).json({ success: false, message: "Failed to unpublish results." });
  }
};

/**
 * PATCH /api/result-configs/:id/toggle-restricted
 * Toggle restricted status for one or more students.
 * Body: { rollNos: string[], restricted: boolean }
 * When restricting: sets isRestricted=true and remark="RESULT RESTRICTED"
 * When unrestricting: sets isRestricted=false and recalculates remark from allPassed/isAbsent
 */
export const toggleRestricted = async (req, res) => {
  try {
    const doc = await ResultConfig.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Config not found." });

    const { rollNos, restricted } = req.body;
    if (!Array.isArray(rollNos) || rollNos.length === 0) {
      return res.status(400).json({ success: false, message: "rollNos array is required." });
    }

    if (restricted) {
      // Restrict: set isRestricted and remark
      await ParsedResult.updateMany(
        { resultConfigId: doc._id, rollNo: { $in: rollNos } },
        { $set: { isRestricted: true, remark: "RESULT RESTRICTED" } }
      );
    } else {
      // Unrestrict: clear isRestricted and recalculate remark per student
      const students = await ParsedResult.find(
        { resultConfigId: doc._id, rollNo: { $in: rollNos } }
      );
      const ops = students.map((s) => {
        const hasAbsent = s.subjects.some((sub) => sub.isAbsent);
        const remark = hasAbsent ? "ABSENT" : s.allPassed ? "SUCCESSFUL" : "UNSUCCESSFUL";
        return {
          updateOne: {
            filter: { _id: s._id },
            update: { $set: { isRestricted: false, remark } },
          },
        };
      });
      if (ops.length) await ParsedResult.bulkWrite(ops, { ordered: false });
    }

    const modifiedCount = rollNos.length;
    res.status(200).json({
      success: true,
      message: `${modifiedCount} student(s) ${restricted ? "restricted" : "unrestricted"}.`,
      modifiedCount,
    });
  } catch (error) {
    console.error("Error toggling restricted:", error);
    res.status(500).json({ success: false, message: "Failed to toggle restricted status." });
  }
};

/**
 * POST /api/result-configs/compare-rolls
 * Compare roll numbers between two configs.
 * Body: { configIdA, configIdB }
 */
export const compareRolls = async (req, res) => {
  try {
    const { configIdA, configIdB } = req.body;
    if (!configIdA || !configIdB) {
      return res.status(400).json({ success: false, message: "Both configIdA and configIdB are required." });
    }

    const [docA, docB] = await Promise.all([
      ResultConfig.findById(configIdA).lean(),
      ResultConfig.findById(configIdB).lean(),
    ]);
    if (!docA) return res.status(404).json({ success: false, message: `Config A not found: ${configIdA}` });
    if (!docB) return res.status(404).json({ success: false, message: `Config B not found: ${configIdB}` });

    const getRolls = async (doc) => {
      const records = await ParsedResult.find({ resultConfigId: doc._id })
        .select("rollNo")
        .lean();
      return records.map((r) => String(r.rollNo).trim());
    };

    const [rollsA, rollsB] = await Promise.all([getRolls(docA), getRolls(docB)]);
    const setA = new Set(rollsA);
    const setB = new Set(rollsB);

    const onlyInA = rollsA.filter((r) => !setB.has(r));
    const onlyInB = rollsB.filter((r) => !setA.has(r));
    const inBoth = rollsA.filter((r) => setB.has(r));

    res.status(200).json({
      success: true,
      configA: { id: docA._id, label: docA.label, totalRolls: rollsA.length },
      configB: { id: docB._id, label: docB.label, totalRolls: rollsB.length },
      inBoth: inBoth.length,
      onlyInA: { count: onlyInA.length, rolls: onlyInA },
      onlyInB: { count: onlyInB.length, rolls: onlyInB },
    });
  } catch (error) {
    console.error("Error comparing rolls:", error);
    res.status(500).json({ success: false, message: "Failed to compare roll numbers." });
  }
};

/**
 * POST /api/result-configs/download-template
 * Download an Excel template with subject-aware headers.
 * Body:
 *   subjects   - array of { name, code, credit, isElective }
 *   practical  - 0 or 1 (default 1)
 *   maxI, maxE, maxT, minI, minE, minT - marks limits
 *   pracMax, pracMin - practical limits
 */
export const downloadTemplate = async (req, res) => {
  try {
    const body = req.body || {};
    const hasPractical = body.practical !== 0 && body.practical !== "0";

    // Build subjects array: use provided subjects or fallback to generic
    let subjects;
    if (Array.isArray(body.subjects) && body.subjects.length > 0) {
      subjects = body.subjects.map((s, i) => ({
        code: s.code || String(i + 1),
        name: s.code ? `${s.name} (${s.code})` : s.name,
        credit: s.credit || 4,
        isElective: !!s.isElective,
      }));
    } else {
      const count = Math.min(Math.max(parseInt(body.subjects) || 4, 1), 20);
      subjects = [];
      for (let i = 1; i <= count; i++) {
        subjects.push({ code: String(i), name: `Subject ${i}`, credit: 4 });
      }
    }

    const opts = {
      programme: "",
      semester: "",
      subjects,
      practical: hasPractical
        ? { name: "Practical", max: parseInt(body.pracMax) || 100, min: parseInt(body.pracMin) || 40, credit: 4 }
        : null,
      limits: {
        maxI: parseInt(body.maxI) || 25,
        minI: parseInt(body.minI) || 10,
        maxE: parseInt(body.maxE) || 75,
        minE: parseInt(body.minE) || 30,
        maxT: parseInt(body.maxT) || 100,
        minT: parseInt(body.minT) || 40,
      },
    };

    const wb = buildResultWorkbook(opts);

    const filename = `result_template_${subjects.length}subj.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating template:", error);
    res.status(500).json({ success: false, message: "Failed to generate template." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Parsed-Result CRUD (Table View)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recalculate all computed fields for a single student record in-place.
 * Used by PATCH (edit) and POST (add) endpoints.
 */
function recalcStudent(student, configDoc) {
  const limits = configDoc.limits || {};
  const minI = limits.minI ?? 10;
  const minE = limits.minE ?? 30;
  const minT = limits.minT ?? 40;

  for (const subj of student.subjects) {
    const intVal = typeof subj.internal === "number" ? subj.internal : 0;
    const extVal = typeof subj.external === "number" ? subj.external : 0;

    subj.iDisplay = intVal;
    subj.eDisplay = extVal;
    subj.total = intVal + extVal;
    subj.isAbsent = !!(subj.internalAbsent || subj.externalAbsent);
    subj.passed = !subj.isAbsent && intVal >= minI && extVal >= minE && subj.total >= minT;
    const gi = subj.passed ? getGradeInfo(subj.total) : { grade: "F", gp: 0 };
    subj.grade = gi.grade;
    subj.gp = gi.gp;
    subj.earned = subj.passed ? subj.credit : 0;
    subj.cg = subj.earned * gi.gp;
  }

  // Practical (split type)
  if (student.practical?.type === "split") {
    const p = student.practical;
    const pI = typeof p.internal === "number" ? p.internal : 0;
    const pE = typeof p.external === "number" ? p.external : 0;
    p.iDisplay = pI;
    p.eDisplay = pE;
    p.total = pI + pE;
    p.display = p.total;
    p.passed = pI >= (p.minI ?? 0) && pE >= (p.minE ?? 0) && p.total >= (p.min ?? 0);
    const pgi = p.passed ? getGradeInfo(p.total) : { grade: "F", gp: 0 };
    p.grade = pgi.grade;
    p.gp = pgi.gp;
    p.earned = p.passed ? p.credit : 0;
    p.cg = p.earned * pgi.gp;
  } else if (student.practical?.type === "single") {
    const p = student.practical;
    const m = typeof p.marks === "number" ? p.marks : 0;
    p.display = m;
    p.total = m;
    p.passed = m >= (p.min ?? 0);
    const pgi = p.passed ? getGradeInfo(m) : { grade: "F", gp: 0 };
    p.grade = pgi.grade;
    p.gp = pgi.gp;
    p.earned = p.passed ? p.credit : 0;
    p.cg = p.earned * pgi.gp;
  }

  // Apply grace marks
  applyGraceMarks([student], configDoc);

  // Recalculate student-level totals
  let totalMarksObt = 0, totalCG = 0, totalCredits = 0, totalEarned = 0;
  for (const s of student.subjects) {
    totalMarksObt += s.total;
    totalCG += s.cg;
    totalCredits += s.credit;
    totalEarned += s.earned;
  }
  if (student.practical) {
    totalMarksObt += student.practical.total || 0;
    totalCG += student.practical.cg || 0;
    totalCredits += student.practical.credit || 0;
    totalEarned += student.practical.earned || 0;
  }
  student.totalMarksObt = totalMarksObt;
  student.totalCG = totalCG;
  student.totalCredits = totalCredits;
  student.totalEarned = totalEarned;
  student.sgpa = totalCredits > 0 ? parseFloat((totalCG / totalCredits).toFixed(2)) : null;
  student.finalGrade = student.sgpa !== null ? getFinalGrade(student.sgpa) : "F";
  student.cgpa = student.sgpa || 0;
  student.allPassed = student.subjects.every((s) => s.passed) &&
    (student.practical ? student.practical.passed : true);
  const hasAbsent = student.subjects.some((s) => s.isAbsent);
  student.remark = hasAbsent ? "ABSENT" : student.allPassed ? "SUCCESSFUL" : "UNSUCCESSFUL";
}

/**
 * GET /api/result-configs/:id/parsed-results
 * Return all ParsedResult docs for a config + config meta (subjects, limits, practical).
 */
export const getParsedResults = async (req, res) => {
  try {
    const { id } = req.params;
    const config = await ResultConfig.findById(id).lean();
    if (!config) return res.status(404).json({ success: false, message: "Config not found." });

    const results = await ParsedResult.find({ resultConfigId: id })
      .sort({ rollNo: 1 })
      .lean();

    // Strip elective subjects that were recorded as all-zeros (never taken)
    stripEmptyElectives(results, config);

    res.status(200).json({
      success: true,
      config: {
        _id: config._id,
        subjects: config.subjects || [],
        limits: config.limits || {},
        practical: config.practical || null,
        examType: config.examType,
      },
      results,
    });
  } catch (error) {
    console.error("Error fetching parsed results:", error);
    res.status(500).json({ success: false, message: "Failed to fetch parsed results." });
  }
};

/**
 * After recalcStudent resets iDisplay/eDisplay to raw numeric values,
 * overlay the display fields from the snapshot so that grace-mark
 * notations ("26+4") and ATKT decorations (EX / +) are preserved.
 */
function restoreDisplayFields(record, snapshot) {
  for (const snapSubj of snapshot.subjects || []) {
    const subj = record.subjects.find((s) => Number(s.code) === Number(snapSubj.code));
    if (!subj) continue;
    if (snapSubj.iDisplay !== undefined) subj.iDisplay = snapSubj.iDisplay;
    if (snapSubj.eDisplay !== undefined) subj.eDisplay = snapSubj.eDisplay;
  }
  if (snapshot.practical && record.practical) {
    if (snapshot.practical.iDisplay !== undefined) record.practical.iDisplay = snapshot.practical.iDisplay;
    if (snapshot.practical.eDisplay !== undefined) record.practical.eDisplay = snapshot.practical.eDisplay;
    if (snapshot.practical.display !== undefined) record.practical.display = snapshot.practical.display;
  }
}

/**
 * Build a summary of mark changes between before/after snapshots.
 */
function buildChanges(before, after, configSubjects) {
  const changes = [];
  for (const cfgSubj of configSubjects) {
    const b = (before.subjects || []).find((s) => Number(s.code) === Number(cfgSubj.code));
    const a = (after.subjects || []).find((s) => Number(s.code) === Number(cfgSubj.code));
    if (!b || !a) continue;
    if (Number(b.internal) !== Number(a.internal)) {
      changes.push({ field: `${cfgSubj.name} (I)`, from: b.internal, to: a.internal });
    }
    if (String(b.eDisplay) !== String(a.eDisplay)) {
      changes.push({ field: `${cfgSubj.name} (E)`, from: b.eDisplay, to: a.eDisplay });
    } else if (Number(b.external) !== Number(a.external)) {
      changes.push({ field: `${cfgSubj.name} (E)`, from: b.external, to: a.external });
    }
  }
  if (before.practical && after.practical) {
    if (before.practical.type === "split") {
      if (Number(before.practical.internal) !== Number(after.practical.internal))
        changes.push({ field: "Practical (I)", from: before.practical.internal, to: after.practical.internal });
      if (Number(before.practical.external) !== Number(after.practical.external))
        changes.push({ field: "Practical (E)", from: before.practical.external, to: after.practical.external });
    } else {
      if (Number(before.practical.marks) !== Number(after.practical.marks))
        changes.push({ field: "Practical", from: before.practical.marks, to: after.practical.marks });
    }
  }
  return changes;
}

/**
 * PATCH /api/result-configs/:id/parsed-results/:resultId
 * Update a single student's marks. Recalculates all computed fields.
 * Body: { subjects: [{ code, internal, external }], practical?: { internal, external } | { marks } }
 */
export const updateParsedResult = async (req, res) => {
  try {
    const { id, resultId } = req.params;
    const config = await ResultConfig.findById(id).lean();
    if (!config) return res.status(404).json({ success: false, message: "Config not found." });

    const record = await ParsedResult.findOne({ _id: resultId, resultConfigId: id });
    if (!record) return res.status(404).json({ success: false, message: "Student result not found." });

    // Snapshot before
    const beforeSnap = record.toObject();

    const { subjects: incomingSubjects, practical: incomingPractical } = req.body;

    // Merge incoming marks into existing subjects
    if (Array.isArray(incomingSubjects)) {
      const inMap = new Map(incomingSubjects.map((s) => [Number(s.code), s]));
      for (const subj of record.subjects) {
        const incoming = inMap.get(Number(subj.code));
        if (!incoming) continue;
        if (incoming.internal !== undefined) subj.internal = Number(incoming.internal) || 0;
        if (incoming.external !== undefined) subj.external = Number(incoming.external) || 0;
        if (incoming.internalAbsent !== undefined) subj.internalAbsent = !!incoming.internalAbsent;
        if (incoming.externalAbsent !== undefined) subj.externalAbsent = !!incoming.externalAbsent;
        if (incoming.isAbsent !== undefined) subj.isAbsent = !!incoming.isAbsent;
      }
    }

    // Merge practical marks
    if (incomingPractical && record.practical) {
      if (record.practical.type === "split") {
        if (incomingPractical.internal !== undefined) record.practical.internal = Number(incomingPractical.internal) || 0;
        if (incomingPractical.external !== undefined) record.practical.external = Number(incomingPractical.external) || 0;
      } else if (record.practical.type === "single") {
        if (incomingPractical.marks !== undefined) record.practical.marks = Number(incomingPractical.marks) || 0;
      }
    }

    // Recalculate everything
    recalcStudent(record, config);
    record.markModified("subjects");
    if (record.practical) record.markModified("practical");
    await record.save();

    // Audit log
    const afterSnap = record.toObject();
    const changes = buildChanges(beforeSnap, afterSnap, config.subjects || []);
    await ParsedResultAudit.create({
      resultConfigId: id,
      parsedResultId: record._id,
      rollNo: record.rollNo,
      studentName: record.name || "",
      action: "UPDATE",
      before: beforeSnap,
      after: afterSnap,
      changes,
      performedBy: { userId: req.user?.id || req.user?.userId, email: req.user?.email },
    });

    res.status(200).json({ success: true, result: afterSnap });
  } catch (error) {
    console.error("Error updating parsed result:", error);
    res.status(500).json({ success: false, message: "Failed to update result." });
  }
};

/**
 * POST /api/result-configs/:id/parsed-results
 * Add a new student. Body: { rollNo, subjects: [{ code, internal, external }], practical? }
 * Pulls name/GR/PRN from Student model by rollNumber.
 */
export const addParsedResult = async (req, res) => {
  try {
    const { id } = req.params;
    const config = await ResultConfig.findById(id).lean();
    if (!config) return res.status(404).json({ success: false, message: "Config not found." });

    const { rollNo, subjects: incomingSubjects, practical: incomingPractical } = req.body;
    if (!rollNo) return res.status(400).json({ success: false, message: "rollNo is required." });

    const trimmedRoll = String(rollNo).trim();

    // Check for duplicate
    const existing = await ParsedResult.findOne({ resultConfigId: id, rollNo: trimmedRoll });
    if (existing) return res.status(409).json({ success: false, message: `Student ${trimmedRoll} already exists in this config.` });

    // Look up student details from Student model
    const studentDoc = await Student.findOne({
      "academicDetails.rollNumber": trimmedRoll,
    }).select("studentDetails.firstName studentDetails.middleName studentDetails.lastName studentDetails.prnNumber studentDetails.grNumber").lean();

    let name = "";
    let prn = null;
    let grNo = null;
    if (studentDoc) {
      const sd = studentDoc.studentDetails;
      name = [sd.firstName, sd.middleName, sd.lastName].filter(Boolean).join(" ");
      prn = sd.prnNumber || null;
      grNo = sd.grNumber || null;
    }

    // Build subjects array from config definition + incoming marks
    const inMap = new Map((incomingSubjects || []).map((s) => [Number(s.code), s]));
    const subjects = (config.subjects || []).map((cfgSubj) => {
      const inc = inMap.get(Number(cfgSubj.code));
      return {
        code: cfgSubj.code,
        name: cfgSubj.name,
        credit: cfgSubj.credit || 4,
        internal: inc ? (Number(inc.internal) || 0) : 0,
        external: inc ? (Number(inc.external) || 0) : 0,
        total: 0,
        iDisplay: 0,
        eDisplay: 0,
        grade: "F",
        gp: 0,
        earned: 0,
        cg: 0,
        passed: false,
        internalAbsent: !!inc?.internalAbsent,
        externalAbsent: !!inc?.externalAbsent,
        isAbsent: !!(inc?.internalAbsent || inc?.externalAbsent || inc?.isAbsent),
      };
    });

    // Build practical
    let practical = null;
    if (config.practical) {
      const cp = config.practical;
      if (cp.type === "split" || (cp.maxI !== undefined)) {
        practical = {
          code: cp.code || "",
          name: cp.name || "Practical",
          type: "split",
          internal: incomingPractical ? (Number(incomingPractical.internal) || 0) : 0,
          external: incomingPractical ? (Number(incomingPractical.external) || 0) : 0,
          total: 0,
          iDisplay: 0,
          eDisplay: 0,
          grade: "F",
          gp: 0,
          credit: cp.credit || 4,
          earned: 0,
          cg: 0,
          passed: false,
          maxI: cp.maxI,
          minI: cp.minI,
          maxE: cp.maxE,
          minE: cp.minE,
        };
      } else {
        practical = {
          code: cp.code || "",
          name: cp.name || "Practical",
          type: "single",
          marks: incomingPractical ? (Number(incomingPractical.marks) || 0) : 0,
          display: 0,
          total: 0,
          grade: "F",
          gp: 0,
          credit: cp.credit || 4,
          earned: 0,
          cg: 0,
          passed: false,
        };
      }
    }

    // Calculate max marks
    const maxT = (config.limits?.maxT ?? 100);
    const maxMarks = subjects.length * maxT + (practical ? (config.practical?.max ?? 100) : 0);

    const newRecord = new ParsedResult({
      resultConfigId: id,
      rollNo: trimmedRoll,
      name,
      grNo,
      prn,
      subjects,
      practical,
      maxMarks,
    });

    recalcStudent(newRecord, config);
    await newRecord.save();

    // Audit log
    const snap = newRecord.toObject();
    await ParsedResultAudit.create({
      resultConfigId: id,
      parsedResultId: newRecord._id,
      rollNo: trimmedRoll,
      studentName: name,
      action: "ADD",
      before: null,
      after: snap,
      changes: [],
      performedBy: { userId: req.user?.id || req.user?.userId, email: req.user?.email },
    });

    res.status(201).json({ success: true, result: snap });
  } catch (error) {
    console.error("Error adding parsed result:", error);
    res.status(500).json({ success: false, message: "Failed to add student result." });
  }
};

/**
 * DELETE /api/result-configs/:id/parsed-results/:resultId
 * Remove a student from this config.
 */
export const deleteParsedResult = async (req, res) => {
  try {
    const { id, resultId } = req.params;
    const record = await ParsedResult.findOne({ _id: resultId, resultConfigId: id });
    if (!record) return res.status(404).json({ success: false, message: "Student result not found." });

    const beforeSnap = record.toObject();
    await ParsedResult.deleteOne({ _id: resultId, resultConfigId: id });

    // Audit log
    await ParsedResultAudit.create({
      resultConfigId: id,
      parsedResultId: resultId,
      rollNo: record.rollNo,
      studentName: record.name || "",
      action: "DELETE",
      before: beforeSnap,
      after: null,
      changes: [],
      performedBy: { userId: req.user?.id || req.user?.userId, email: req.user?.email },
    });

    res.status(200).json({ success: true, message: "Student result deleted." });
  } catch (error) {
    console.error("Error deleting parsed result:", error);
    res.status(500).json({ success: false, message: "Failed to delete student result." });
  }
};

export const lookupStudent = async (req, res) => {
  try {
    const { rollNo } = req.query;
    if (!rollNo || !String(rollNo).trim()) return res.status(400).json({ success: false, message: "rollNo is required." });

    const trimmed = String(rollNo).trim();
    const doc = await Student.findOne({
      "academicDetails.rollNumber": trimmed,
    }).select("studentDetails.firstName studentDetails.middleName studentDetails.lastName studentDetails.prnNumber studentDetails.grNumber").lean();

    if (!doc) return res.status(200).json({ success: true, found: false });

    const sd = doc.studentDetails || {};
    res.status(200).json({
      success: true,
      found: true,
      student: {
        name: [sd.firstName, sd.middleName, sd.lastName].filter(Boolean).join(" "),
        prn: sd.prnNumber || null,
        grNo: sd.grNumber || null,
      },
    });
  } catch (error) {
    console.error("Error looking up student:", error);
    res.status(500).json({ success: false, message: "Failed to look up student." });
  }
};

/**
 * GET /api/result-configs/:id/audit
 * List audit entries for a config, newest first.
 */
export const getAuditLog = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Number(req.query.skip) || 0;

    const [entries, total] = await Promise.all([
      ParsedResultAudit.find({ resultConfigId: id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ParsedResultAudit.countDocuments({ resultConfigId: id }),
    ]);

    res.status(200).json({ success: true, entries, total, limit, skip });
  } catch (error) {
    console.error("Error fetching audit log:", error);
    res.status(500).json({ success: false, message: "Failed to fetch audit log." });
  }
};

/**
 * POST /api/result-configs/:id/audit/:auditId/revert
 * Revert a change by restoring the "before" snapshot.
 * For ADD actions: deletes the added record.
 * For UPDATE actions: restores the before snapshot and recalculates.
 * For DELETE actions: re-creates the record from the before snapshot.
 */
export const revertAudit = async (req, res) => {
  try {
    const { id, auditId } = req.params;
    const config = await ResultConfig.findById(id).lean();
    if (!config) return res.status(404).json({ success: false, message: "Config not found." });

    const audit = await ParsedResultAudit.findOne({ _id: auditId, resultConfigId: id }).lean();
    if (!audit) return res.status(404).json({ success: false, message: "Audit entry not found." });

    if (audit.action === "ADD") {
      // Revert an add = delete the record
      const record = await ParsedResult.findOne({ _id: audit.parsedResultId, resultConfigId: id });
      if (record) {
        const beforeSnap = record.toObject();
        await ParsedResult.deleteOne({ _id: audit.parsedResultId });
        await ParsedResultAudit.create({
          resultConfigId: id,
          parsedResultId: audit.parsedResultId,
          rollNo: audit.rollNo,
          studentName: audit.studentName,
          action: "DELETE",
          before: beforeSnap,
          after: null,
          changes: [],
          performedBy: { userId: req.user?.id || req.user?.userId, email: req.user?.email },
        });
      }
      return res.status(200).json({ success: true, message: `Reverted ADD: student ${audit.rollNo} removed.` });
    }

    if (audit.action === "DELETE") {
      // Revert a delete = re-create from the before snapshot
      if (!audit.before) return res.status(400).json({ success: false, message: "No before snapshot available." });
      const existing = await ParsedResult.findOne({ resultConfigId: id, rollNo: audit.rollNo });
      if (existing) return res.status(409).json({ success: false, message: `Student ${audit.rollNo} already exists. Cannot restore.` });

      const { _id, __v, ...rest } = audit.before;
      const restored = new ParsedResult(rest);
      recalcStudent(restored, config);
      restoreDisplayFields(restored, audit.before);
      await restored.save();
      const snap = restored.toObject();
      await ParsedResultAudit.create({
        resultConfigId: id,
        parsedResultId: restored._id,
        rollNo: audit.rollNo,
        studentName: audit.studentName,
        action: "ADD",
        before: null,
        after: snap,
        changes: [],
        performedBy: { userId: req.user?.id || req.user?.userId, email: req.user?.email },
      });
      return res.status(200).json({ success: true, message: `Reverted DELETE: student ${audit.rollNo} restored.`, result: snap });
    }

    // UPDATE: restore the before snapshot's marks
    if (!audit.before) return res.status(400).json({ success: false, message: "No before snapshot available." });
    const record = await ParsedResult.findOne({ _id: audit.parsedResultId, resultConfigId: id });
    if (!record) return res.status(404).json({ success: false, message: "Student result not found. May have been deleted." });

    const currentSnap = record.toObject();

    // Restore subject marks from before snapshot
    for (const beforeSubj of (audit.before.subjects || [])) {
      const subj = record.subjects.find((s) => Number(s.code) === Number(beforeSubj.code));
      if (!subj) continue;
      subj.internal = beforeSubj.internal;
      subj.external = beforeSubj.external;
      subj.internalAbsent = beforeSubj.internalAbsent || false;
      subj.externalAbsent = beforeSubj.externalAbsent || false;
      subj.isAbsent = beforeSubj.isAbsent || false;
    }
    // Restore practical marks
    if (audit.before.practical && record.practical) {
      if (record.practical.type === "split") {
        record.practical.internal = audit.before.practical.internal;
        record.practical.external = audit.before.practical.external;
      } else {
        record.practical.marks = audit.before.practical.marks;
      }
    }

    recalcStudent(record, config);
    restoreDisplayFields(record, audit.before);
    record.markModified("subjects");
    if (record.practical) record.markModified("practical");
    await record.save();

    const afterSnap = record.toObject();
    const changes = buildChanges(currentSnap, afterSnap, config.subjects || []);
    await ParsedResultAudit.create({
      resultConfigId: id,
      parsedResultId: record._id,
      rollNo: record.rollNo,
      studentName: record.name || "",
      action: "UPDATE",
      before: currentSnap,
      after: afterSnap,
      changes,
      performedBy: { userId: req.user?.id || req.user?.userId, email: req.user?.email },
    });

    return res.status(200).json({ success: true, message: `Reverted UPDATE for student ${audit.rollNo}.`, result: afterSnap });
  } catch (error) {
    console.error("Error reverting audit:", error);
    res.status(500).json({ success: false, message: "Failed to revert change." });
  }
};
