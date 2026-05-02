/**
 * Multi-Result Controller
 *
 * Serves result card PDFs for ANY exam configuration defined in
 * config/resultExamConfigs.js. Completely independent of the original
 * resultCardController.js (which remains untouched for production).
 *
 * Route prefix: /api/results
 * Token format encodes both configId + rollNo so links are unique per exam.
 */

import crypto from "crypto";
import ExcelJS from "exceljs";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";
import dotenv from "dotenv";

import Student from "../models/studentModel.js";
import Application from "../models/applicationModel.js";
import ResultConfig from "../models/resultConfigModel.js";
// [REMOVED] SemesterResult no longer used -- CGPA now computed from ParsedResult
import ParsedResult from "../models/parsedResultModel.js";
import { sendExcelResponse } from "../utils/excelHelper.js";
import { createJob, updateJob, getJob } from "../utils/jobManager.js";
import { stripEmptyElectives } from "../utils/gradeCalculator.js";
// [LEGACY EXCEL] import { readStudents, findStudentByRoll } from "../utils/resultExcelParser.js";
import { findStudentByRoll } from "../utils/resultExcelParser.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Shared asset loaders ──────────────────────────────────────────────────

const TAILWIND_JS_PATH = path.join(__dirname, "..", "fonts", "tailwind.min.js");
const ARIMO_REGULAR_PATH = path.join(__dirname, "..", "fonts", "Arimo", "Arimo-Regular.ttf");
const ARIMO_BOLD_PATH = path.join(__dirname, "..", "fonts", "Arimo", "Arimo-Bold.ttf");

let _tailwindJS = null;
let _arimoRegularB64 = null;
let _arimoBoldB64 = null;

function getTailwindJS() {
  if (!_tailwindJS) _tailwindJS = fs.readFileSync(TAILWIND_JS_PATH, "utf-8");
  return _tailwindJS;
}

function getArimoBase64(weight) {
  if (weight === 700) {
    if (!_arimoBoldB64) _arimoBoldB64 = fs.readFileSync(ARIMO_BOLD_PATH).toString("base64");
    return _arimoBoldB64;
  }
  if (!_arimoRegularB64) _arimoRegularB64 = fs.readFileSync(ARIMO_REGULAR_PATH).toString("base64");
  return _arimoRegularB64;
}

// ─── Image helpers ─────────────────────────────────────────────────────────

const loadImageAsBase64 = async (imagePath) => {
  try {
    const imageBuffer = await fs.promises.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  } catch {
    return "";
  }
};

const urlToBase64 = async (url, fallback = "") => {
  if (!url) return fallback;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "image/png";
    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  } catch {
    return fallback;
  }
};

const getStudentImageUrl = async (student) => {
  if (!student) return "";
  let url =
    student.certificates?.find((c) => c.type === "candidatePhoto")?.fileUrl ||
    student.studentDetails?.studentImage;
  if (!url) {
    const query = mongoose.Types.ObjectId.isValid(student.loginStudentId)
      ? { loginStudentId: student.loginStudentId }
      : student.studentDetails?.emailAddress
        ? { "studentDetails.emailAddress": student.studentDetails.emailAddress }
        : null;
    if (!query) return "";
    const application = await Application.findOne(query).lean();
    if (application?.certificates) {
      url = application.certificates.find((c) => c.type === "candidatePhoto")?.fileUrl || "";
    }
  }
  return url;
};

const getStudentGender = async (rollNumber) => {
  const roll = String(rollNumber);
  // Try exact roll first, then common letter prefixes
  const prefixes = ["", "A", "B", "C", "D"];
  for (const prefix of prefixes) {
    const student = await Student.findOne({
      "academicDetails.rollNumber": `${prefix}${roll}`,
    }).lean();
    if (student?.studentDetails?.gender) return student.studentDetails.gender;
  }
  return null;
};

const getStudentPhotoBase64 = async (rollNumber) => {
  const uploadsDir = path.join(__dirname, "..", "uploads");
  const collectedDir = path.join(uploadsDir, "collected_photos");
  const fallbackPath = path.join(uploadsDir, "images", "fallback-image.png");
  const fallbackBase64 = await loadImageAsBase64(fallbackPath);

  // Try exact roll number, then common letter prefixes (A, B)
  if (fs.existsSync(collectedDir)) {
    const extensions = [".jpg", ".jpeg", ".png", ".webp", ".JPG"];
    const prefixes = ["", "A", "B"];
    for (const prefix of prefixes) {
      for (const ext of extensions) {
        const filePath = path.join(collectedDir, `${prefix}${rollNumber}${ext}`);
        if (fs.existsSync(filePath)) return await loadImageAsBase64(filePath);
      }
    }
  }

  const student = await Student.findOne({
    "academicDetails.rollNumber": String(rollNumber),
  }).lean();

  if (student) {
    const photoUrl = await getStudentImageUrl(student);
    if (photoUrl) return await urlToBase64(photoUrl, fallbackBase64);
  }

  return fallbackBase64;
};



// ─── Roman numeral helper ──────────────────────────────────────────────────

function toRoman(num) {
  const map = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let result = "";
  for (const [value, symbol] of map) {
    while (num >= value) { result += symbol; num -= value; }
  }
  return result;
}

// ─── DB Config Helpers ──────────────────────────────────────────────────────

/**
 * Resolve a configId to a ResultConfig document.
 * Tries ObjectId first, then falls back to slug lookup.
 */
async function resolveConfig(configId) {
  if (mongoose.Types.ObjectId.isValid(configId)) {
    const byId = await ResultConfig.findOne({ _id: configId, status: "active" }).lean();
    if (byId) return byId;
  }
  return await ResultConfig.findOne({ slug: configId, status: "active" }).lean();
}

/**
 * Convert a DB ResultConfig doc into the shape generateHTML() expects.
 * Only Excel-reading fields (file, sheet, dataStartRow, columns) are excluded.
 */
function toParserConfig(doc) {
  return {
    // [LEGACY EXCEL] Excel-reading fields -- no longer needed
    // file: doc.excelFile,
    // sheet: doc.sheetIndex,
    // dataStartRow: doc.dataStartRow,
    // columns: doc.columns,
    // Still needed by generateHTML for PDF rendering
    subjects: doc.subjects,
    limits: doc.limits,
    practical: doc.practical || null,
    remarkMap: doc.remarkMap instanceof Map ? Object.fromEntries(doc.remarkMap) : (doc.remarkMap || null),
    label: doc.label,
    programme: doc.programme,
    programId: doc.programId,
    semester: doc.semester,
    semesterNumber: doc.semesterNumber,
    totalSemesters: doc.totalSemesters,
    year: doc.year,
    examMonth: doc.examMonth,
    examType: doc.examType,
    resultDeclaredOn: doc.resultDeclaredOn,
    resultAmendedOn: doc.resultAmendedOn,
    place: doc.place,
  };
}

// ─── DB Read Path ───────────────────────────────────────────────────────────

async function loadStudentsFromDB(configId) {
  return ParsedResult.find({ resultConfigId: configId }).lean();
}

/**
 * Overwrite grNo on each student with the authoritative value from the Student model.
 * Always uses Student DB as the single source of truth for GR numbers.
 */
async function enrichGRFromStudentDB(students) {
  if (!students.length) return;
  const rollNos = students.map((s) => String(s.rollNo).trim());
  const dbStudents = await Student.find(
    { "academicDetails.rollNumber": { $in: rollNos } }
  ).select("academicDetails.rollNumber studentDetails.grNumber").lean();

  const grMap = new Map();
  for (const db of dbStudents) {
    const roll = String(db.academicDetails?.rollNumber).trim();
    const gr = db.studentDetails?.grNumber;
    if (roll && gr) grMap.set(roll, String(gr));
  }

  for (const s of students) {
    const gr = grMap.get(String(s.rollNo).trim());
    if (gr) s.grNo = gr;
  }
}

async function getStudentsForConfig(configDoc) {
  const students = await loadStudentsFromDB(configDoc._id);
  await enrichGRFromStudentDB(students);
  stripEmptyElectives(students, configDoc);
  return students;
}

/**
 * For ATKT configs: compare each student's subjects against Regular + Reval results.
 * Adds "EX" suffix to eDisplay/total when external matches the source (exemption carried).
 * Adds "+" suffix to iDisplay when internal matches the source (internal carried).
 * Mutates students in-place (in-memory only, never saved to DB).
 */
export async function decorateATKTExemptions(students, configDoc) {
  if (configDoc.examType !== "atkt") return;

  const sourceConfigs = await ResultConfig.find({
    programId: configDoc.programId,
    semesterNumber: configDoc.semesterNumber,
    year: configDoc.year,
    examType: { $in: ["regular", "reval"] },
    status: { $ne: "archived" },
  }).lean();

  if (!sourceConfigs.length) return;

  const sourceResults = await ParsedResult.find({
    resultConfigId: { $in: sourceConfigs.map((c) => c._id) },
  }).lean();

  if (!sourceResults.length) return;

  const sourceMap = new Map();
  for (const r of sourceResults) {
    const key = String(r.rollNo).trim();
    const existing = sourceMap.get(key);
    if (!existing) { sourceMap.set(key, [r]); } else { existing.push(r); }
  }

  for (const student of students) {
    const sources = sourceMap.get(String(student.rollNo).trim());
    if (!sources) continue;

    for (const subj of student.subjects) {
      const atkI = typeof subj.internal === "number" ? subj.internal : null;
      const atkE = typeof subj.external === "number" ? subj.external : null;
      if (atkI === null && atkE === null) continue;

      let iMatched = false;
      let eMatched = false;

      for (const src of sources) {
        const srcSubj = src.subjects?.find((s) => s.code === subj.code);
        if (!srcSubj) continue;
        const srcI = typeof srcSubj.internal === "number" ? srcSubj.internal : null;
        const srcE = typeof srcSubj.external === "number" ? srcSubj.external : null;
        if (!iMatched && srcI !== null && atkI === srcI) iMatched = true;
        if (!eMatched && srcE !== null && atkE === srcE) eMatched = true;
      }

      if (iMatched) {
        const base = subj.iDisplay != null ? subj.iDisplay : atkI;
        if (!String(base).includes("+")) subj.iDisplay = `${base}+`;
      }
      if (eMatched) {
        const base = subj.eDisplay != null ? subj.eDisplay : atkE;
        if (!String(base).endsWith("EX")) subj.eDisplay = `${base} EX`;
        if (!String(subj.total).endsWith("EX")) subj.total = `${subj.total} EX`;
      }
    }
  }
}

// [LEGACY EXCEL] Semester Result Upsert -- no longer needed, SemesterResult pre-populated during migration
// async function upsertSemesterResults(students, config, configDoc) {
//   if (!students.length) return;
//   const ops = students.map((s) => ({
//     updateOne: {
//       filter: { rollNo: String(s.rollNo), programId: config.programId, semesterNumber: config.semesterNumber },
//       update: { $set: { totalCredits: s.totalCredits, earnedCredits: s.totalEarned, ... } },
//       upsert: true,
//     },
//   }));
//   await SemesterResult.bulkWrite(ops, { ordered: false });
// }

// ─── Cross-Semester CGPA ────────────────────────────────────────────────────

async function getCrossSemesterData(rollNo, programId, totalSemesters, currentSemesterNumber) {
  // Find all active configs for this program
  const configs = await ResultConfig.find({ programId, status: "active" })
    .select("_id semesterNumber createdAt")
    .sort({ semesterNumber: 1, createdAt: -1 })
    .lean();

  if (configs.length === 0) return { semMap: new Map(), cgpa: 0 };

  const configIds = configs.map((c) => c._id);

  // Get this student's ParsedResult across all configs for the program
  const records = await ParsedResult.find({
    resultConfigId: { $in: configIds },
    rollNo: String(rollNo),
  }).lean();

  // Build configId -> semesterNumber lookup
  const configSemMap = new Map();
  const configDateMap = new Map();
  for (const c of configs) {
    configSemMap.set(String(c._id), c.semesterNumber);
    configDateMap.set(String(c._id), c.createdAt);
  }

  // Deduplicate: if student appears in multiple configs for the same semester
  // (e.g. regular + ATKT), pick the one from the most recently created config
  const bestBySem = new Map();
  for (const rec of records) {
    const cid = String(rec.resultConfigId);
    const semNum = configSemMap.get(cid);
    if (!semNum) continue;
    // Only include semesters up to the one currently being viewed
    if (currentSemesterNumber && semNum > currentSemesterNumber) continue;
    const existing = bestBySem.get(semNum);
    if (!existing || configDateMap.get(cid) > configDateMap.get(String(existing.resultConfigId))) {
      bestBySem.set(semNum, rec);
    }
  }

  const semMap = new Map();
  let sumCG = 0;
  let sumCredits = 0;
  for (const [semNum, rec] of bestBySem) {
    // Strip zero-mark subjects (empty electives never taken) from the credit totals
    // to prevent inflated denominators in CGPA when optional subjects have 0 marks.
    let effectiveCG = rec.totalCG;
    let effectiveCredits = rec.totalCredits;
    if (Array.isArray(rec.subjects)) {
      for (const s of rec.subjects) {
        if (!s.passed && s.cg === 0 && typeof s.total === "number" && s.total === 0 && !s.isAbsent) {
          effectiveCredits -= (s.credit || 0);
        }
      }
    }

    semMap.set(semNum, {
      earnedCredits: rec.totalEarned,
      sgpa: effectiveCredits > 0 ? parseFloat((effectiveCG / effectiveCredits).toFixed(2)) : rec.sgpa,
      totalCG: effectiveCG,
      totalCredits: effectiveCredits,
    });
    sumCG += effectiveCG;
    sumCredits += effectiveCredits;
  }

  const cgpa = sumCredits > 0 ? parseFloat((sumCG / sumCredits).toFixed(2)) : 0;
  return { semMap, cgpa };
}

// ─── HMAC Token System (encodes configId + rollNo) ─────────────────────────

const RC_SECRET = process.env.RESULT_CARD_SECRET || process.env.JWT_SECRET || "fallback-rc-secret-key";

export function generateToken(configId, rollNo) {
  const payload = `${configId}|${rollNo}`;
  const sig = crypto.createHmac("sha256", RC_SECRET).update(payload).digest("hex").slice(0, 16);
  return Buffer.from(JSON.stringify({ c: configId, r: String(rollNo), s: sig })).toString("base64url");
}

const LEGACY_CONFIG_ID = "fy-llb-sem1-oct2024-regular";

function verifyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (!decoded.r || !decoded.s) return null;

    if (decoded.c) {
      const expected = crypto.createHmac("sha256", RC_SECRET)
        .update(`${decoded.c}|${decoded.r}`)
        .digest("hex").slice(0, 16);
      if (decoded.s !== expected) return null;
      return { configId: decoded.c, rollNo: String(decoded.r) };
    }

    const expected = crypto.createHmac("sha256", RC_SECRET)
      .update(String(decoded.r))
      .digest("hex").slice(0, 16);
    if (decoded.s !== expected) return null;
    return { configId: LEGACY_CONFIG_ID, rollNo: String(decoded.r) };
  } catch {
    return null;
  }
}

// ─── URL builders ──────────────────────────────────────────────────────────

function buildPdfUrl(token) {
  const base = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8001}`).replace(/\/+$/, "");
  return `${base}/api/results/pdf/${token}`;
}

function buildJsonUrl(token) {
  const base = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8001}`).replace(/\/+$/, "");
  return `${base}/api/results/data/${token}`;
}

// ─── HTML Generation (config-driven) ───────────────────────────────────────

function generateHTML(student, config, { qrDataUri = "", photoBase64 = "", gender = null, crossSemester = null } = {}) {
  const { seatNo, name, rollNo, grNo, prn, subjects, practical, remark } = student;
  const displayName = gender && gender.toLowerCase() === "female" ? `/ ${name}` : name;
  const { limits } = config;
  const pracDef = config.practical;
  const hasPractical = !!pracDef && !!practical;

  const totalSubjects = subjects.length + (hasPractical ? 1 : 0);
  const sgpiRowspan = totalSubjects + 1;

  // Subject rows
  let subjectRowsHTML = "";
  for (let i = 0; i < subjects.length; i++) {
    const s = subjects[i];
    const sgpiCell = i === 0
      ? `<td rowspan="${sgpiRowspan}" class="font-bold align-middle">${student.sgpa !== null ? student.sgpa.toFixed(2) : "NA"}</td>`
      : "";
    const iDisplayVal = s.internalAbsent ? "AB" : s.iDisplay;
    const eDisplayVal = s.externalAbsent ? "AB" : s.eDisplay;
    const tDisplayVal = s.isAbsent ? "AB" : s.total;
    subjectRowsHTML += `
                <tr>
                    <td class="font-bold">${s.code}</td>
                    <td class="text-left-pad font-bold uppercase">${s.name}</td>
                    <td>${limits.maxI}</td><td>${limits.minI}</td><td class="${!s.passed && typeof s.internal === "number" && s.internal < limits.minI ? "text-red-600 font-bold" : ""}${s.internalAbsent ? " text-red-600 font-bold" : ""}">${iDisplayVal}</td>
                    <td>${limits.maxE}</td><td>${limits.minE}</td><td class="${!s.passed && typeof s.external === "number" && s.external < limits.minE ? "text-red-600 font-bold" : ""}${s.externalAbsent ? " text-red-600 font-bold" : ""}">${eDisplayVal}</td>
                    <td>${limits.maxT}</td><td>${limits.minT}</td><td class="${!s.passed ? "font-bold" : ""}">${tDisplayVal}</td>
                    <td class="font-bold">${s.grade}</td><td>${s.gp}</td><td>${s.credit}</td><td>${s.earned}</td><td>${s.cg}</td>
                    ${sgpiCell}
                </tr>`;
  }

  // Practical row
  const p = practical;
  if (hasPractical) {
  if (p.type === "split") {
    subjectRowsHTML += `
                <tr>
                    <td class="font-bold">${p.code || ""}</td>
                    <td class="text-left-pad font-bold uppercase">${p.name || "PRACTICAL"}</td>
                    <td>${p.maxI}</td><td>${p.minI}</td><td>${p.iDisplay}</td>
                    <td>${p.maxE}</td><td>${p.minE}</td><td>${p.eDisplay}</td>
                    <td>${pracDef.max}</td><td>${pracDef.min}</td><td class="${!p.passed ? "font-bold" : ""}">${p.display}</td>
                    <td class="font-bold">${p.grade}</td><td>${p.gp}</td><td>${p.credit}</td><td>${p.earned}</td><td>${p.cg}</td>
                </tr>`;
  } else {
    subjectRowsHTML += `
                <tr>
                    <td class="font-bold">${p.code || ""}</td>
                    <td class="text-left-pad font-bold uppercase">${p.name || "PRACTICAL"}</td>
                    <td>--</td><td>--</td><td>--</td>
                    <td>--</td><td>--</td><td>--</td>
                    <td>${pracDef.max}</td><td>${pracDef.min}</td><td class="${!p.passed ? "font-bold" : ""}">${p.display}</td>
                    <td class="font-bold">${p.grade}</td><td>${p.gp}</td><td>${p.credit}</td><td>${p.earned}</td><td>${p.cg}</td>
                </tr>`;
  }
  }

  // Total row
  const totalGPsum = subjects.reduce((sum, s) => sum + s.gp, 0) + (hasPractical ? p.gp : 0);
  const totalMaxMarks = subjects.length * limits.maxT + (hasPractical ? pracDef.max : 0);
  const totalMinMarks = subjects.length * limits.minT + (hasPractical ? pracDef.min : 0);

  subjectRowsHTML += `
                <tr>
                    <td></td>
                    <td class="text-right-pad font-bold">Total</td>
                    <td></td><td></td><td></td>
                    <td></td><td></td><td></td>
                    <td class="font-bold">${totalMaxMarks}</td><td class="font-bold">${totalMinMarks}</td><td class="font-bold">${student.totalMarksObt}</td>
                    <td></td>
                    <td class="font-bold">${totalGPsum}</td>
                    <td class="font-bold">${student.totalCredits}</td>
                    <td class="font-bold">${student.totalEarned}</td>
                    <td class="font-bold">${student.totalCG}</td>
                </tr>`;

  // Semester credit/SGPI summary rows (filled from cross-semester data when available)
  const semData = crossSemester?.semMap;
  const semCreditCells = Array.from({ length: config.totalSemesters }, (_, i) => {
    const semNum = i + 1;
    const label = `Sem ${toRoman(semNum)}`;
    let val = "--";
    if (semNum === config.semesterNumber) val = student.totalEarned;
    else if (semData?.has(semNum)) val = semData.get(semNum).earnedCredits;
    return `<td class="text-left-pad"><b>${label}:</b> ${val}</td>`;
  }).join("\n                ");

  const semSGPICells = Array.from({ length: config.totalSemesters }, (_, i) => {
    const semNum = i + 1;
    const label = `Sem ${toRoman(semNum)}`;
    let val = "--";
    if (semNum === config.semesterNumber) val = student.sgpa !== null ? student.sgpa.toFixed(2) : "NA";
    else if (semData?.has(semNum)) val = semData.get(semNum).sgpa?.toFixed(2) ?? "NA";
    return `<td class="text-left-pad"><b>${label}:</b> ${val}</td>`;
  }).join("\n                ");

  // Cumulative CGPA: cross-semester if available, else this semester's SGPA
  const cgpa = crossSemester ? crossSemester.cgpa : (student.sgpa || 0);

  // Photo
  const photoHTML = photoBase64
    ? `<img src="${photoBase64}" style="width:100%; height:85px; object-fit:cover;" />`
    : `<div class="w-full h-[85px] bg-gray-200 border-l border-black flex flex-col items-center justify-center text-gray-500 font-bold text-xs">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            PHOTO
          </div>`;

  // QR
  const qrHTML = qrDataUri
    ? `<img src="${qrDataUri}" style="width:130px; height:130px;" />`
    : `<div style="width:130px; height:130px; border:2px dashed #9ca3af; background:#f9fafb; display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0;">
            <svg xmlns="http://www.w3.org/2000/svg" style="width:28px;height:28px;color:#9ca3af;margin-bottom:4px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <span style="color:#9ca3af; font-weight:bold; font-size:10px;">QR CODE</span>
          </div>`;

  // Exam type badge for reval/atkt
  const examTypeBadge = config.examType !== "regular"
    ? `<div style="font-weight:bold; font-size:11px; margin-left:20px;">(${config.examType.toUpperCase()})</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Result Card - ${name}</title>
    <script>${getTailwindJS()}</script>
    <style>
        @font-face { font-family: 'Arimo'; font-style: normal; font-weight: 400; src: url(data:font/ttf;base64,${getArimoBase64(400)}) format('truetype'); }
        @font-face { font-family: 'Arimo'; font-style: normal; font-weight: 700; src: url(data:font/ttf;base64,${getArimoBase64(700)}) format('truetype'); }
        html, body {
            font-family: 'Arial', Arial, Helvetica, sans-serif;
            background-color: white;
            padding: 0;
            margin: 0;
            height: 100%;
        }
        body {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .marksheet-wrapper {
            background-color: white;
            width: 100%;
            max-width: 1100px;
            padding: 8px 40px 0 40px;
            color: black;
            font-size: 11.5px;
            line-height: 1.2;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
        }
        .card-content { margin-top: auto; margin-bottom: 32px; }
        .footer-section {
            margin-top: 0;
            padding: 6px 40px 8px 40px;
            width: 100%;
            max-width: 1100px;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td {
            border: 1px solid black;
            padding: 4px 2px;
            text-align: center;
            vertical-align: middle;
        }
        .table-stacked { margin-top: -1px; }
        .text-left-pad { text-align: left; padding-left: 8px; }
        .text-right-pad { text-align: right; padding-right: 8px; }
        .header-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 4px;
            font-weight: bold;
            font-size: 12.5px;
        }
        .col-code { width: 40px; }
        .col-title { width: auto; }
        .col-marks { width: 38px; }
        .col-grades { width: 42px; }
        .col-small { width: 38px; }
        .col-sgpi { width: 55px; }
        @media print {
            body { background-color: white; padding: 0; }
            .marksheet-wrapper { box-shadow: none; padding: 10px 10px 0 10px; max-width: 100%; }
            .footer-section { padding: 0 10px 10px 10px; }
        }
    </style>
</head>
<body>
    <div class="marksheet-wrapper">
      <div class="card-content">

        <div class="header-section">
            <div>PROGRAMME: ${config.programme}</div>
            <div>Year: ${config.year}</div>
            <div style="margin-right:100px;">SEMESTER - ${config.semester}${examTypeBadge}</div>
        </div>

        <table>
            <tr>
                <th class="w-[12%]">Roll No.</th>
                <th class="w-[20%]">PRN No.</th>
                <th class="w-[10%]">GR. No.</th>
                <th class="w-[35%]">Name of the Candidate</th>
                <th class="w-[15%]">Month & Year of Examination</th>
                <td rowspan="2" class="w-[8%] p-0 align-top">
                    ${photoHTML}
                </td>
            </tr>
            <tr>
                <td class="font-bold">${rollNo}</td>
                <td class="font-bold">${prn || "--"}</td>
                <td class="font-bold">${grNo || "--"}</td>
                <td class="font-bold">${displayName}</td>
                <td class="font-bold uppercase">${config.examMonth}</td>
            </tr>
        </table>

        <table class="table-stacked">
            <thead>
                <tr>
                    <th rowspan="2" class="col-code">Course<br>Code</th>
                    <th rowspan="2" class="col-title">Course Title</th>
                    <th colspan="3">Internal Assessment</th>
                    <th colspan="3">Semester End Exam</th>
                    <th colspan="3">Total Marks</th>
                    <th rowspan="2" class="col-grades">Grades</th>
                    <th rowspan="2" class="col-small">Grade<br>Point<br>(G)</th>
                    <th rowspan="2" class="col-small">Credit<br>Points</th>
                    <th rowspan="2" class="col-small">Credit<br>Earned<br>(C)</th>
                    <th rowspan="2" class="col-small">CG =<br>(C*G)</th>
                    <th rowspan="2" class="col-sgpi">SGPI=<br>&Sigma;CG/&Sigma;C</th>
                </tr>
                <tr>
                    <th class="col-marks">Max<br>Marks</th>
                    <th class="col-marks">Min<br>Marks</th>
                    <th class="col-marks">Marks<br>Obt</th>
                    <th class="col-marks">Max<br>Marks</th>
                    <th class="col-marks">Min<br>Marks</th>
                    <th class="col-marks">Marks<br>Obt</th>
                    <th class="col-marks">Max<br>Marks</th>
                    <th class="col-marks">Min<br>Marks</th>
                    <th class="col-marks">Marks<br>Obt</th>
                </tr>
            </thead>
            <tbody>
                ${subjectRowsHTML}
            </tbody>
        </table>

        <table class="table-stacked">
            <tr>
                <td class="text-left-pad w-[30%]"><b>Remark:</b> ${remark}</td>
                <td class="text-left-pad w-[20%]"><b>Credits Earned:</b> ${student.totalEarned}</td>
                <td class="text-left-pad w-[15%]"><b>SGPA:</b> ${student.sgpa !== null ? student.sgpa.toFixed(2) : "NA"}</td>
                <td class="text-left-pad w-[17%]"><b>Final Grade:</b> ${student.finalGrade}</td>
                <td class="text-left-pad w-[18%]"><b>CGPA:</b> ${cgpa !== null && cgpa !== 0 ? cgpa.toFixed(2) : "0.00"}</td>
            </tr>
        </table>

        <table class="table-stacked">
            <tr>
                <td class="text-left-pad font-bold" style="width:9%">Credit Earned</td>
                ${semCreditCells}
            </tr>
            <tr>
                <td class="text-left-pad font-bold" style="width:9%">SGPI</td>
                ${semSGPICells}
            </tr>
        </table>

      </div>
    </div>

    <div class="footer-section">
        <div style="display:flex; gap:20px; align-items:flex-end;">
            ${qrHTML}
            <div style="flex-grow:1; display:flex; flex-direction:column; justify-content:flex-end; padding-bottom:4px;">
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:11px; margin-bottom:8px;">
                    <div>Place: ${config.place}</div>
                    <div>Entered By</div>
                    <div>Checked By</div>
                    <div>Read By</div>
                    <div>Principal</div>
                </div>
                <div style="font-weight:bold; font-size:11px;">
                    Result Declared On: ${config.resultDeclaredOn || "--"}
                </div>
                ${config.examType === "reval" ? `<div style="font-weight:bold; font-size:11px;">
                    Result Amended On: ${config.resultAmendedOn || "--"}
                </div>` : ""}
                <div style="font-size:9.5px; margin-top:4px;">
                    #.0229, @-5042 / 0.5043, * - 0 5048, F-HEAD OF FAILURE, E-EXEMPTION IN THE HEAD, -- -NOT APPLICABLE, A-ABSENT. EX- EXEMPTION CARRIED, /-FEMALE -- - DYSLEXIA BENEFIT
                </div>
            </div>
        </div>
    </div>

</body>
</html>`;
}

// ─── Puppeteer singleton ────────────────────────────────────────────────────

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  }
  return browserInstance;
}

// ─── Controller Methods ─────────────────────────────────────────────────────

/**
 * GET /api/results/configs
 * Returns all registered exam configurations.
 */
export const getExamConfigs = async (_req, res) => {
  try {
    const docs = await ResultConfig.find({ status: "active" })
      .select("slug label programme programId semester semesterNumber year examMonth examType")
      .sort({ programId: 1, semesterNumber: 1, year: -1 })
      .lean();

    const configs = docs.map((d) => ({
      id: d.slug,
      _id: d._id,
      label: d.label,
      programme: d.programme,
      programId: d.programId,
      semester: d.semester,
      semesterNumber: d.semesterNumber,
      year: d.year,
      examMonth: d.examMonth,
      examType: d.examType,
    }));

    res.status(200).json({ success: true, configs });
  } catch (error) {
    console.error("Error listing configs:", error);
    res.status(500).json({ success: false, message: "Failed to list configurations." });
  }
};

/**
 * GET /api/results/pdf/:token
 * Public — generates and serves the result card PDF.
 */
export const getResultPdf = async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ success: false, message: "Invalid or tampered result card link." });

    const configDoc = await resolveConfig(decoded.configId);
    if (!configDoc) return res.status(404).json({ success: false, message: "Exam configuration not found." });
    const config = toParserConfig(configDoc);

    const students = await getStudentsForConfig(configDoc);
    await decorateATKTExemptions(students, configDoc);

    const student = findStudentByRoll(students, decoded.rollNo);
    if (!student) return res.status(404).json({ success: false, message: "Result card not found." });

    const qrUrl = buildPdfUrl(token);
    const [qrDataUri, photoBase64, gender, crossSemester] = await Promise.all([
      QRCode.toDataURL(qrUrl, { width: 200, margin: 1 }),
      getStudentPhotoBase64(student.rollNo),
      getStudentGender(student.rollNo),
      getCrossSemesterData(student.rollNo, config.programId, config.totalSemesters, config.semesterNumber),
    ]);

    const html = generateHTML(student, config, { qrDataUri, photoBase64, gender, crossSemester });

    const browser = await getBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    await page.close();

    const disposition = req.query.download === "true" ? "attachment" : "inline";
    const filename = `ResultCard_${student.rollNo}_${student.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating result card PDF:", error);
    res.status(500).json({ success: false, message: "Failed to generate result card." });
  }
};

/**
 * GET /api/results/verify/:token
 * Public — returns JSON metadata for a result card.
 */
export const verifyResult = async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ success: false, message: "Invalid or tampered result card link." });

    const configDoc = await resolveConfig(decoded.configId);
    if (!configDoc) return res.status(404).json({ success: false, message: "Exam configuration not found." });
    const config = toParserConfig(configDoc);

    const students = await getStudentsForConfig(configDoc);
    const student = findStudentByRoll(students, decoded.rollNo);
    if (!student) return res.status(404).json({ success: false, message: "No result card found." });

    res.status(200).json({
      success: true,
      student: {
        seatNo: student.seatNo,
        name: student.name,
        rollNo: student.rollNo,
        grNo: student.grNo,
        prn: student.prn,
        remark: student.remark,
        sgpa: student.sgpa,
        finalGrade: student.finalGrade,
        totalMarksObt: student.totalMarksObt,
        maxMarks: student.maxMarks,
      },
      pdfUrl: buildPdfUrl(token),
      jsonUrl: buildJsonUrl(token),
      programme: config.programme,
      semester: config.semester,
      examMonth: config.examMonth,
      examType: config.examType,
      configId: decoded.configId,
    });
  } catch (error) {
    console.error("Error verifying result card:", error);
    res.status(500).json({ success: false, message: "Failed to verify result card." });
  }
};

/**
 * GET /api/results/data/:token
 * Public — returns full structured JSON result data for a student.
 * Designed to be LLM-readable and database-insertable.
 */
export const getResultData = async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ success: false, message: "Invalid or tampered link." });

    const configDoc = await resolveConfig(decoded.configId);
    if (!configDoc) return res.status(404).json({ success: false, message: "Exam configuration not found." });
    const config = toParserConfig(configDoc);

    const students = await getStudentsForConfig(configDoc);
    const s = findStudentByRoll(students, decoded.rollNo);
    if (!s) return res.status(404).json({ success: false, message: "Student not found." });

    const crossSemester = await getCrossSemesterData(s.rollNo, config.programId, config.totalSemesters, config.semesterNumber);

    res.status(200).json({
      success: true,
      meta: {
        configId: decoded.configId,
        programme: config.programme,
        semester: config.semester,
        semesterNumber: config.semesterNumber,
        year: config.year,
        examMonth: config.examMonth,
        examType: config.examType,
        resultDeclaredOn: config.resultDeclaredOn,
        place: config.place,
        generatedAt: new Date().toISOString(),
      },
      student: {
        seatNo: s.seatNo,
        name: s.name,
        rollNo: s.rollNo,
        grNo: s.grNo,
        prn: s.prn,
      },
      subjects: s.subjects.map((sub) => ({
        code: sub.code,
        name: sub.name,
        internal: sub.internal,
        external: sub.external,
        total: sub.total,
        grade: sub.grade,
        gradePoint: sub.gp,
        credit: sub.credit,
        creditEarned: sub.earned,
        creditGrade: sub.cg,
        passed: sub.passed,
        isAbsent: sub.isAbsent,
        internalAbsent: sub.internalAbsent || false,
        externalAbsent: sub.externalAbsent || false,
      })),
      practical: s.practical ? {
        code: s.practical.code,
        name: s.practical.name,
        type: s.practical.type,
        marks: s.practical.type === "single" ? s.practical.marks : undefined,
        internal: s.practical.type === "split" ? s.practical.internal : undefined,
        external: s.practical.type === "split" ? s.practical.external : undefined,
        total: s.practical.type === "split" ? s.practical.total : undefined,
        grade: s.practical.grade,
        gradePoint: s.practical.gp,
        credit: s.practical.credit,
        creditEarned: s.practical.earned,
        creditGrade: s.practical.cg,
        passed: s.practical.passed,
      } : null,
      result: {
        totalMarksObtained: s.totalMarksObt,
        maxMarks: s.maxMarks,
        totalCredits: s.totalCredits,
        totalCreditsEarned: s.totalEarned,
        totalCreditGrade: s.totalCG,
        sgpa: s.sgpa,
        cgpa: crossSemester ? crossSemester.cgpa : (s.sgpa || 0),
        finalGrade: s.finalGrade,
        remark: s.remark,
        allPassed: s.allPassed,
      },
      links: {
        pdfUrl: buildPdfUrl(token),
        jsonUrl: buildJsonUrl(token),
      },
    });
  } catch (error) {
    console.error("Error fetching result data:", error);
    res.status(500).json({ success: false, message: "Failed to fetch result data." });
  }
};

/**
 * GET /api/results/:configId/list
 * Admin — returns all students for a specific exam config with token-based links.
 */
export const listStudents = async (req, res) => {
  try {
    const { configId } = req.params;
    const configDoc = await resolveConfig(configId);
    if (!configDoc) return res.status(404).json({ success: false, message: `Config "${configId}" not found.` });
    const config = toParserConfig(configDoc);
    const slugOrId = configDoc.slug || configId;

    const students = await getStudentsForConfig(configDoc);

    const list = students.map((s) => {
      const token = generateToken(slugOrId, s.rollNo);
      return {
        seatNo: s.seatNo,
        name: s.name,
        rollNo: s.rollNo,
        remark: s.remark,
        sgpa: s.sgpa,
        finalGrade: s.finalGrade,
        isPublished: !!s.isPublished,
        isRestricted: !!s.isRestricted,
        token,
        pdfUrl: buildPdfUrl(token),
        jsonUrl: buildJsonUrl(token),
      };
    });

    res.status(200).json({ success: true, configId: slugOrId, label: config.label, count: list.length, students: list });
  } catch (error) {
    console.error("Error listing students:", error);
    res.status(500).json({ success: false, message: "Failed to list students." });
  }
};

/**
 * GET /api/results/:configId/download-links
 * Admin — Excel file with all student links for one exam config.
 */
export const downloadLinksExcel = async (req, res) => {
  try {
    const { configId } = req.params;
    const configDoc = await resolveConfig(configId);
    if (!configDoc) return res.status(404).json({ success: false, message: `Config "${configId}" not found.` });
    const config = toParserConfig(configDoc);
    const slugOrId = configDoc.slug || configId;

    const students = await getStudentsForConfig(configDoc);
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Result Card Links");

    ws.columns = [
      { header: "Sr No", key: "sr", width: 8 },
      { header: "Seat No", key: "seatNo", width: 12 },
      { header: "Roll No", key: "rollNo", width: 12 },
      { header: "Name", key: "name", width: 35 },
      { header: "PRN", key: "prn", width: 22 },
      { header: "Result", key: "remark", width: 16 },
      { header: "SGPA", key: "sgpa", width: 8 },
      { header: "Grade", key: "grade", width: 8 },
      { header: "Result Card Link", key: "link", width: 80 },
      { header: "JSON Data Link", key: "jsonLink", width: 80 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5F99" } };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 22;

    students.forEach((s, idx) => {
      const token = generateToken(slugOrId, s.rollNo);
      const pdfUrl = buildPdfUrl(token);
      const jsonUrl = buildJsonUrl(token);
      const row = ws.addRow({
        sr: idx + 1,
        seatNo: s.seatNo,
        rollNo: s.rollNo,
        name: s.name,
        prn: s.prn || "",
        remark: s.remark,
        sgpa: s.sgpa !== null ? s.sgpa : "NA",
        grade: s.finalGrade,
        link: pdfUrl,
        jsonLink: jsonUrl,
      });
      row.getCell("link").value = { text: pdfUrl, hyperlink: pdfUrl };
      row.getCell("link").font = { color: { argb: "FF0563C1" }, underline: true };
      row.getCell("jsonLink").value = { text: jsonUrl, hyperlink: jsonUrl };
      row.getCell("jsonLink").font = { color: { argb: "FF0563C1" }, underline: true };
    });

    const safeLabel = config.label.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-");
    await sendExcelResponse(res, workbook, `ResultLinks-${safeLabel}.xlsx`);
  } catch (error) {
    console.error("Error generating links Excel:", error);
    res.status(500).json({ success: false, message: "Failed to generate Excel." });
  }
};

// ─── Bulk PDF ZIP (Job System) ──────────────────────────────────────────────

const processBulkGeneration = async (jobId, configId, rollNumbers) => {
  let browser = null;
  try {
    const configDoc = await resolveConfig(configId);
    if (!configDoc) {
      updateJob(jobId, { status: "failed", error: "Config not found" });
      return;
    }
    const config = toParserConfig(configDoc);
    const slugOrId = configDoc.slug || configId;

    updateJob(jobId, { status: "in_progress", progress: 0, metadata: { message: "Reading student data..." } });

    const allStudents = await getStudentsForConfig(configDoc);
    await decorateATKTExemptions(allStudents, configDoc);

    const students = rollNumbers && rollNumbers.length > 0
      ? allStudents.filter((s) => rollNumbers.includes(String(s.rollNo)))
      : allStudents;

    if (students.length === 0) {
      updateJob(jobId, { status: "failed", error: "No students found", metadata: { failureReason: "no_data" } });
      return;
    }

    updateJob(jobId, {
      metadata: { totalStudents: students.length, processedStudents: 0, message: `Generating ${students.length} result cards...` },
    });

    const tempDir = path.join(__dirname, "..", "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const zipFileName = `Results_${slugOrId}_${Date.now()}.zip`;
    const zipFilePath = path.join(tempDir, zipFileName);
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(output);

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    let processedCount = 0;

    for (const student of students) {
      try {
        const token = generateToken(slugOrId, student.rollNo);
        const qrUrl = buildPdfUrl(token);
        const [qrDataUri, photoBase64, gender, crossSemester] = await Promise.all([
          QRCode.toDataURL(qrUrl, { width: 200, margin: 1 }),
          getStudentPhotoBase64(student.rollNo),
          getStudentGender(student.rollNo),
          getCrossSemesterData(student.rollNo, config.programId, config.totalSemesters, config.semesterNumber),
        ]);
        const html = generateHTML(student, config, { qrDataUri, photoBase64, gender, crossSemester });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdfBuffer = await page.pdf({
          format: "A4",
          landscape: true,
          printBackground: true,
          margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
        });
        await page.close();

        archive.append(pdfBuffer, {
          name: `ResultCard_${student.rollNo}_${student.name.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}.pdf`,
        });

        processedCount++;
        const progress = Math.round((processedCount / students.length) * 100);
        updateJob(jobId, {
          progress,
          metadata: { processedStudents: processedCount, totalStudents: students.length, message: `Generated ${processedCount} of ${students.length}` },
        });
      } catch (err) {
        console.error(`Error generating result card for ${student.rollNo}:`, err);
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
        metadata: { message: "Done!", downloadUrl: `/api/results/bulk-download-result/${jobId}` },
      });
    });
  } catch (error) {
    console.error("Error in bulk generation job:", error);
    if (browser) await browser.close();
    updateJob(jobId, { status: "failed", error: error.message });
  }
};

/**
 * GET /api/results/:configId/bulk-download/start
 */
export const startBulkGeneration = async (req, res) => {
  try {
    const { configId } = req.params;
    const configDoc = await resolveConfig(configId);
    if (!configDoc) return res.status(404).json({ success: false, message: `Config "${configId}" not found.` });

    const { rollNumbers } = req.query;
    const rollList = rollNumbers ? rollNumbers.split(",").map((r) => r.trim()).filter(Boolean) : [];

    const jobId = uuidv4();
    createJob(jobId, { type: "bulk_result", configId });
    processBulkGeneration(jobId, configId, rollList);

    res.status(202).json({ message: "Bulk generation started", jobId, configId });
  } catch (error) {
    console.error("Error starting bulk job:", error);
    res.status(500).json({ message: "Failed to start job", error: error.message });
  }
};

/**
 * GET /api/results/bulk-download-status/:jobId
 */
export const getBulkStatus = async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  if (!job) return res.status(404).json({ message: "Job not found" });
  res.status(200).json(job);
};

/**
 * GET /api/results/bulk-download-result/:jobId
 */
export const downloadBulkResult = async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  if (!job || job.status !== "completed" || !job.result) {
    return res.status(404).json({ message: "Result not available" });
  }
  res.download(job.result, "ResultCards.zip", (err) => {
    if (err) console.error("Error sending file:", err);
  });
};
