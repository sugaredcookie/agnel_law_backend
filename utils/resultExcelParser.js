/**
 * Generic Result Excel Parser
 *
 * Reads student results from any Excel file using the config definition
 * from resultExamConfigs.js. Handles all format variants:
 *   - Different data start rows
 *   - Different column mappings
 *   - Single-column vs split (I/E/T) practicals
 *   - Varied remark formats (P/F, Pass/Fail, etc.)
 *   - Inflated rowCount in some sheets (1M+ rows)
 */

import ExcelJS from "exceljs";

// ─── Grade Mapping (same as original) ───────────────────────────────────────

export function getGradeInfo(totalMarks) {
  if (totalMarks >= 80) return { grade: "O", gp: 10 };
  if (totalMarks >= 70) return { grade: "A+", gp: 9 };
  if (totalMarks >= 60) return { grade: "A", gp: 8 };
  if (totalMarks >= 55) return { grade: "B+", gp: 7 };
  if (totalMarks >= 50) return { grade: "B", gp: 6 };
  if (totalMarks >= 45) return { grade: "C", gp: 5 };
  if (totalMarks >= 40) return { grade: "D", gp: 4 };
  return { grade: "F", gp: 0 };
}

export function getFinalGrade(sgpa) {
  if (sgpa === null) return "F";
  if (sgpa >= 9.5) return "O";
  if (sgpa >= 8.5) return "A+";
  if (sgpa >= 7.5) return "A";
  if (sgpa >= 6.5) return "B+";
  if (sgpa >= 5.5) return "B";
  if (sgpa >= 4.5) return "C";
  if (sgpa >= 4.0) return "D";
  return "F";
}

// ─── Cell Helpers ───────────────────────────────────────────────────────────

function getCellValue(row, col) {
  if (!col) return null;
  const cell = row.getCell(col);
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null) {
    if (v.result !== undefined) return v.result;
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.formula) return null;
  }
  return v;
}

function normalizeSpecialStatus(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  const stripped = str.replace(/^\((.+)\)$/, "$1");
  const lower = stripped.toLowerCase();
  if (["ab", "absent"].includes(lower)) return "AB";
  if (lower === "rr") return "RR";
  return null;
}

function parseMarks(value) {
  if (value === null || value === undefined) return { num: null, display: null };
  if (typeof value === "number") return { num: value, display: value };
  const str = String(value).trim();
  if (str === "") return { num: null, display: null };
  const special = normalizeSpecialStatus(str);
  if (special) return { num: special, display: special };

  // Strip "EX" suffix (e.g., "59 EX" → 59) -- ATKT carry-forward marker
  const exMatch = str.match(/^(\d+)\s*EX$/i);
  if (exMatch) {
    const n = parseInt(exMatch[1], 10);
    return { num: n, display: n };
  }

  // Grace marks "27 + 3" → num=30, display="27 + 3"; trailing "15+" → num=15, display=15
  if (str.includes("+")) {
    const parts = str.split("+").map((s) => s.trim()).filter((s) => s !== "");
    const nums = parts.map((s) => parseInt(s, 10));
    if (nums.every((n) => !isNaN(n))) {
      const total = nums.reduce((a, b) => a + b, 0);
      return { num: total, display: parts.length > 1 ? str : total };
    }
  }

  const num = Number(str);
  return isNaN(num) ? { num: str, display: str } : { num, display: num };
}

function isSpecialStatus(val) {
  return typeof val === "string" && ["AB", "RR"].includes(val);
}

// ─── Per-config cache ───────────────────────────────────────────────────────

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(config) {
  return `${config.file}::${config.sheet}`;
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export async function readStudents(config) {
  const key = getCacheKey(config);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(config.file);

  const ws = typeof config.sheet === "number"
    ? wb.worksheets[config.sheet]
    : wb.getWorksheet(config.sheet);

  if (!ws) throw new Error(`Sheet "${config.sheet}" not found in ${config.file}`);

  const { columns: cols, subjects: subjDefs, practical: pracDef, limits } = config;
  const remarkMap = config.remarkMap || {};
  const students = [];

  const maxScan = Math.min(ws.rowCount, config.dataStartRow + 500);
  let consecutiveEmpty = 0;

  for (let r = config.dataStartRow; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const name = getCellValue(row, cols.name);

    if (!name || String(name).trim() === "") {
      consecutiveEmpty++;
      if (consecutiveEmpty > 10) break;
      continue;
    }
    consecutiveEmpty = 0;

    // Skip footer/summary rows that appear in data range
    const nameStr = String(name).trim();
    if (/^(result\s*declared|note[:\s]|total[:\s]|grand\s*total|\*|#)/i.test(nameStr)) continue;

    const rollRaw = getCellValue(row, cols.rollNo);
    if (!rollRaw || String(rollRaw).trim() === "" || String(rollRaw).trim() === "null") continue;
    let rollStr = String(rollRaw).trim();
    // Skip header-like rows that leaked into data range
    if (/^(student|name|roll|exam|max|min|seat|result|total|note)/i.test(rollStr)) continue;

    const seatNo = getCellValue(row, cols.studentId);
    const grNo = cols.grNo ? getCellValue(row, cols.grNo) : null;
    const prn = cols.prn ? getCellValue(row, cols.prn) : null;

    // Remark
    const remarkRaw = getCellValue(row, cols.remarks);
    const remarkStr = (remarkRaw || "").toString().trim();
    const mapped = remarkMap[remarkStr];
    let remarkCategory;
    if (mapped) {
      remarkCategory = mapped;
    } else {
      const lower = remarkStr.toLowerCase();
      if (["pass", "p", "successful"].includes(lower)) remarkCategory = "pass";
      else if (["fail", "f", "unsuccessful"].includes(lower)) remarkCategory = "fail";
      else if (lower === "absent") remarkCategory = "absent";
      else if (["rr", "result restricted"].includes(lower)) remarkCategory = "rr";
      else if (remarkStr === "") remarkCategory = "auto";
      else remarkCategory = "other";
    }

    // ── Theory subjects ──
    const subjectResults = [];
    let totalMarksObt = 0;
    let totalCG = 0;
    let totalCredits = 0;
    let totalEarned = 0;

    for (const subj of subjDefs) {
      const rawI = getCellValue(row, subj.iCol);
      const rawE = getCellValue(row, subj.eCol);
      const internal = parseMarks(rawI);
      const external = parseMarks(rawE);

      const iNum = typeof internal.num === "number" ? internal.num : 0;
      const eNum = typeof external.num === "number" ? external.num : 0;

      const iIsSpecial = isSpecialStatus(internal.num);
      const eIsSpecial = isSpecialStatus(external.num);

      // Skip elective subjects the student didn't take (both I and E are 0)
      if (subj.elective && !iIsSpecial && !eIsSpecial && iNum === 0 && eNum === 0) continue;

      const total = iNum + eNum;
      const passed = !iIsSpecial && !eIsSpecial &&
        iNum >= limits.minI && eNum >= limits.minE && total >= limits.minT;

      const gradeInfo = passed ? getGradeInfo(total) : { grade: "F", gp: 0 };
      const earned = passed ? subj.credit : 0;
      const cg = earned * gradeInfo.gp;

      totalMarksObt += total;
      totalCG += cg;
      totalCredits += subj.credit;
      totalEarned += earned;

      let gradeDisplay;
      if (iIsSpecial && eIsSpecial) gradeDisplay = internal.num === external.num ? internal.display : `${internal.display}/${external.display}`;
      else if (iIsSpecial) gradeDisplay = internal.display;
      else if (eIsSpecial) gradeDisplay = external.display;
      else gradeDisplay = gradeInfo.grade;

      subjectResults.push({
        code: subj.code,
        name: subj.name,
        internal: iIsSpecial ? internal.num : iNum,
        external: eIsSpecial ? external.num : eNum,
        total,
        iDisplay: internal.display,
        eDisplay: external.display,
        grade: gradeDisplay,
        gp: gradeInfo.gp,
        credit: subj.credit,
        earned,
        cg,
        passed,
        internalAbsent: !!iIsSpecial,
        externalAbsent: !!eIsSpecial,
        isAbsent: iIsSpecial || eIsSpecial,
      });
    }

    // ── Practical ──
    let practicalResult = null;

    if (pracDef && pracDef.type === "single") {
      const rawPrac = getCellValue(row, pracDef.col);
      const pracMarks = parseMarks(rawPrac);
      const pracNum = typeof pracMarks.num === "number" ? pracMarks.num : 0;
      const pracSpecial = isSpecialStatus(pracMarks.num);
      const pracPassed = !pracSpecial && pracNum >= pracDef.min;
      const pracGrade = pracPassed ? getGradeInfo(pracNum) : { grade: "F", gp: 0 };
      const pracEarned = pracPassed ? pracDef.credit : 0;
      const pracCG = pracEarned * pracGrade.gp;

      totalMarksObt += pracNum;
      totalCG += pracCG;
      totalCredits += pracDef.credit;
      totalEarned += pracEarned;

      practicalResult = {
        code: pracDef.code,
        name: pracDef.name,
        type: "single",
        marks: pracSpecial ? pracMarks.num : pracNum,
        display: pracMarks.display,
        total: pracNum,
        grade: pracSpecial ? pracMarks.display : pracGrade.grade,
        gp: pracGrade.gp,
        credit: pracDef.credit,
        earned: pracEarned,
        cg: pracCG,
        passed: pracPassed,
      };
    } else if (pracDef) {
      // split: I / E / T
      const rawPI = getCellValue(row, pracDef.iCol);
      const rawPE = getCellValue(row, pracDef.eCol);
      const pI = parseMarks(rawPI);
      const pE = parseMarks(rawPE);
      const piNum = typeof pI.num === "number" ? pI.num : 0;
      const peNum = typeof pE.num === "number" ? pE.num : 0;
      const pTotal = piNum + peNum;
      const piSpecial = isSpecialStatus(pI.num);
      const peSpecial = isSpecialStatus(pE.num);

      const pracPassed = !piSpecial && !peSpecial &&
        piNum >= pracDef.minI && peNum >= pracDef.minE && pTotal >= pracDef.min;
      const pracGrade = pracPassed ? getGradeInfo(pTotal) : { grade: "F", gp: 0 };
      const pracEarned = pracPassed ? pracDef.credit : 0;
      const pracCG = pracEarned * pracGrade.gp;

      totalMarksObt += pTotal;
      totalCG += pracCG;
      totalCredits += pracDef.credit;
      totalEarned += pracEarned;

      practicalResult = {
        code: pracDef.code,
        name: pracDef.name,
        type: "split",
        internal: piSpecial ? pI.num : piNum,
        external: peSpecial ? pE.num : peNum,
        total: pTotal,
        iDisplay: pI.display,
        eDisplay: pE.display,
        display: pTotal,
        grade: (piSpecial || peSpecial) ? (piSpecial ? pI.display : pE.display) : pracGrade.grade,
        gp: pracGrade.gp,
        credit: pracDef.credit,
        earned: pracEarned,
        cg: pracCG,
        passed: pracPassed,
        maxI: pracDef.maxI,
        minI: pracDef.minI,
        maxE: pracDef.maxE,
        minE: pracDef.minE,
      };
    }

    const sgpa = totalCredits > 0 ? parseFloat((totalCG / totalCredits).toFixed(2)) : null;
    const finalGrade = sgpa !== null ? getFinalGrade(sgpa) : "F";

    const allPassed = subjectResults.every((s) => s.passed) && (practicalResult ? practicalResult.passed : true);
    const hasAbsent = subjectResults.some((s) => s.isAbsent) || (practicalResult && isSpecialStatus(practicalResult.marks));

    let remarkDisplay;
    switch (remarkCategory) {
      case "pass": remarkDisplay = "SUCCESSFUL"; break;
      case "absent": remarkDisplay = "ABSENT"; break;
      case "rr": remarkDisplay = "RESULT RESTRICTED"; break;
      case "auto":
        remarkDisplay = hasAbsent ? "ABSENT" : allPassed ? "SUCCESSFUL" : "UNSUCCESSFUL";
        break;
      default: remarkDisplay = "UNSUCCESSFUL"; break;
    }

    students.push({
      row: r,
      seatNo,
      name: String(name).trim(),
      rollNo: rollStr,
      grNo,
      prn,
      subjects: subjectResults,
      practical: practicalResult,
      totalMarksObt,
      maxMarks: subjectResults.length * limits.maxT + (pracDef ? pracDef.max : 0),
      totalCG,
      totalCredits,
      totalEarned,
      sgpa,
      finalGrade,
      cgpa: sgpa || 0,
      remark: remarkDisplay,
      allPassed,
    });
  }

  cache.set(key, { data: students, ts: Date.now() });
  return students;
}

// ─── Standard Template Parser ───────────────────────────────────────────────
// Reads Excel files that follow the university-style template format:
// Row 1-2: institution/programme headers (merged, skipped)
// Row 3-4: subject names / I-E-T sub-headers
// Row 5-6: max/min marks (skipped)
// Row 7+: data -- Seat(1), Name(2), Roll(3), GR(4), [I|E|T per subject],
// Practical, Total Marks, Remark, Credit, PRN, GP, SGPA

export async function readStudentsStandard(config) {
  const key = `${config.file}::standard`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(config.file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No worksheet found in ${config.file}`);

  const { subjects: subjDefs, practical: pracDef, limits } = config;

  const cols = { studentId: 1, name: 2, rollNo: 3, grNo: 4 };
  let nextCol = 5;

  // Each subject: I, E, T (3 cols; T is auto-calculated, skipped by parser)
  const mappedSubjects = subjDefs.map((subj) => {
    const mapped = { ...subj, iCol: nextCol, eCol: nextCol + 1 };
    nextCol += 3;
    return mapped;
  });

  // Practical: 1 column
  let mappedPractical = null;
  if (pracDef) {
    mappedPractical = { ...pracDef, type: "single", col: nextCol };
    nextCol++;
  }

  // Total Marks, Remark, Credit, PRN, GP, SGPA
  cols.grandTotal = nextCol++;
  cols.remarks = nextCol++;
  nextCol++; // Credit -- informational, skip
  cols.prn = nextCol++;
  // GP and SGPA are computed, not parsed

  const derivedConfig = {
    file: config.file,
    sheet: 0,
    dataStartRow: 7,
    columns: cols,
    subjects: mappedSubjects,
    limits,
    practical: mappedPractical,
    remarkMap: config.remarkMap || null,
  };

  const students = await readStudents(derivedConfig);

  cache.set(key, { data: students, ts: Date.now() });
  return students;
}

export function findStudentByRoll(students, rollNo) {
  const target = String(rollNo).trim();
  // Try exact match first, then strip any leading letter prefix for backward compatibility
  return students.find((s) => String(s.rollNo).trim() === target)
    || students.find((s) => String(s.rollNo).trim() === target.replace(/^[A-Za-z]+/, ""));
}

export function clearCache(configOrKey) {
  if (!configOrKey) {
    cache.clear();
  } else if (typeof configOrKey === "string") {
    cache.delete(configOrKey);
  } else {
    cache.delete(getCacheKey(configOrKey));
  }
}

export async function preloadAll(configs) {
  const start = Date.now();
  let loaded = 0;
  for (const config of configs) {
    try {
      await readStudents(config);
      loaded++;
    } catch (err) {
      console.warn(`[preload] Failed to load ${getCacheKey(config)}: ${err.message}`);
    }
  }
  console.log(`[preload] Cached ${loaded}/${configs.length} exam configs in ${Date.now() - start}ms`);
}
