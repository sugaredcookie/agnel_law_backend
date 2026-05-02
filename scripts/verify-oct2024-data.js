/**
 * Verification Script: Compare old resultCardController data vs new multiResult parser
 * for FY LLB SEM 1 October 2024 (Regular) — same Excel, same sheet.
 *
 * Run: node scripts/verify-oct2024-data.js
 */

import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

// ─── Shared helpers (identical in both systems) ──────────────────────────────

function getGradeInfo(totalMarks) {
  if (totalMarks >= 80) return { grade: "O", gp: 10 };
  if (totalMarks >= 70) return { grade: "A+", gp: 9 };
  if (totalMarks >= 60) return { grade: "A", gp: 8 };
  if (totalMarks >= 55) return { grade: "B+", gp: 7 };
  if (totalMarks >= 50) return { grade: "B", gp: 6 };
  if (totalMarks >= 45) return { grade: "C", gp: 5 };
  if (totalMarks >= 40) return { grade: "D", gp: 4 };
  return { grade: "F", gp: 0 };
}

function getFinalGrade(sgpa) {
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

function getCellValue(row, col) {
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
  if (str.includes("+")) {
    const parts = str.split("+").map((s) => parseInt(s.trim(), 10));
    if (parts.every((n) => !isNaN(n))) return { num: parts.reduce((a, b) => a + b, 0), display: str };
  }
  const num = Number(str);
  return isNaN(num) ? { num: str, display: str } : { num, display: num };
}

function isSpecialStatus(val) {
  return typeof val === "string" && ["AB", "RR"].includes(val);
}

// ─── OLD System: reads exactly like resultCardController.js ─────────────────

async function readOldSystem() {
  const SUBJECTS = [
    { code: 1, name: "Legal Language", iCol: 5, eCol: 6, credit: 4 },
    { code: 2, name: "Law of Torts, Motor Accident Claims and Consumer Protection", iCol: 8, eCol: 9, credit: 4 },
    { code: 3, name: "Law of Contract and Specific Relief", iCol: 11, eCol: 12, credit: 4 },
    { code: 4, name: "Labour Law & Industrial Relations - I", iCol: 14, eCol: 15, credit: 4 },
  ];
  const PRACTICAL = { code: 5, name: "Practical Training - I", col: 17, max: 100, min: 40, credit: 4 };
  const LIMITS = { maxI: 25, minI: 10, maxE: 75, minE: 30, maxT: 100, minT: 40 };

  const excelFile = path.join(ROOT, "uploads", "excel", "FY LLB SEM 1.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelFile);
  const ws = wb.getWorksheet(1);

  const maxMarksCell = getCellValue(ws.getRow(5), 19);
  const parsedMaxMarks = maxMarksCell && typeof maxMarksCell === "number" ? maxMarksCell : 500;
  const maxScanRow = ws.rowCount || 285;
  const students = [];

  for (let r = 7; r <= maxScanRow; r++) {
    const row = ws.getRow(r);
    const name = getCellValue(row, 2);
    if (!name) continue;
    const rollNo = getCellValue(row, 3);
    if (!rollNo || String(rollNo).trim() === "" || String(rollNo).trim() === "null") continue;

    const remark = getCellValue(row, 20);
    const remarkRaw = (remark || "").toString().trim();
    const remarkLower = remarkRaw.toLowerCase();
    let remarkCategory;
    if (remarkLower === "pass") remarkCategory = "pass";
    else if (remarkLower === "fail") remarkCategory = "fail";
    else if (remarkLower === "absent") remarkCategory = "absent";
    else if (remarkLower === "rr") remarkCategory = "rr";
    else if (remarkRaw === "") remarkCategory = "rr";
    else remarkCategory = "other";

    const seatNo = getCellValue(row, 1);
    const grNo = getCellValue(row, 4);
    const prn = getCellValue(row, 22);

    let totalMarksObt = 0, totalCG = 0, totalCredits = 0, totalEarned = 0, allPassed = true;
    const subjectResults = [];

    for (const subj of SUBJECTS) {
      const rawI = getCellValue(row, subj.iCol);
      const rawE = getCellValue(row, subj.eCol);
      const internal = parseMarks(rawI);
      const external = parseMarks(rawE);
      const iNum = typeof internal.num === "number" ? internal.num : 0;
      const eNum = typeof external.num === "number" ? external.num : 0;
      const total = iNum + eNum;
      const iIsSpecial = isSpecialStatus(internal.num);
      const eIsSpecial = isSpecialStatus(external.num);
      const passed = !iIsSpecial && !eIsSpecial && iNum >= LIMITS.minI && eNum >= LIMITS.minE && total >= LIMITS.minT;
      const gradeInfo = passed ? getGradeInfo(total) : { grade: "F", gp: 0 };
      const earned = passed ? subj.credit : 0;
      const cg = earned * gradeInfo.gp;
      if (!passed) allPassed = false;
      totalMarksObt += total;
      totalCG += cg;
      totalCredits += subj.credit;
      totalEarned += earned;

      subjectResults.push({ code: subj.code, name: subj.name, internal: iIsSpecial ? internal.num : iNum, external: eIsSpecial ? external.num : eNum, total, iDisplay: internal.display, eDisplay: external.display, gp: gradeInfo.gp, credit: subj.credit, earned, cg, passed });
    }

    const rawPrac = getCellValue(row, PRACTICAL.col);
    const pracMarks = parseMarks(rawPrac);
    const pracNum = typeof pracMarks.num === "number" ? pracMarks.num : 0;
    const pracSpecial = isSpecialStatus(pracMarks.num);
    const pracPassed = !pracSpecial && pracNum >= PRACTICAL.min;
    const pracGrade = pracPassed ? getGradeInfo(pracNum) : { grade: "F", gp: 0 };
    const pracEarned = pracPassed ? PRACTICAL.credit : 0;
    const pracCG = pracEarned * pracGrade.gp;
    if (!pracPassed) allPassed = false;
    totalMarksObt += pracNum;
    totalCG += pracCG;
    totalCredits += PRACTICAL.credit;
    totalEarned += pracEarned;

    const sgpa = totalCredits > 0 ? parseFloat((totalCG / totalCredits).toFixed(2)) : null;
    const finalGrade = sgpa !== null ? getFinalGrade(sgpa) : "F";
    const cgpa = sgpa !== null ? sgpa : 0;

    let remarkDisplay;
    switch (remarkCategory) {
      case "pass": remarkDisplay = "SUCCESSFUL"; break;
      case "absent": remarkDisplay = "ABSENT"; break;
      case "rr": remarkDisplay = "RESULT RESTRICTED"; break;
      default: remarkDisplay = "UNSUCCESSFUL"; break;
    }

    students.push({ rollNo: String(rollNo), name, seatNo, grNo, prn, totalMarksObt, maxMarks: parsedMaxMarks, totalCG, totalCredits, totalEarned, sgpa, finalGrade, cgpa, remark: remarkDisplay, allPassed, subjects: subjectResults, pracGp: pracGrade.gp, pracEarned, pracPassed });
  }
  return students;
}

// ─── NEW System: uses resultExcelParser + config ────────────────────────────

async function readNewSystem() {
  const { getConfig } = await import("../config/resultExamConfigs.js");
  const { readStudents, clearCache } = await import("../utils/resultExcelParser.js");

  clearCache();
  const config = getConfig("fy-llb-sem1-oct2024-regular");
  if (!config) throw new Error("Config fy-llb-sem1-oct2024-regular not found!");
  return await readStudents(config);
}

// ─── Compare ────────────────────────────────────────────────────────────────

function compareStudents(oldList, newList) {
  console.log(`\n${"=".repeat(70)}`);
  console.log("  VERIFICATION: Old ResultCardController vs New MultiResult Parser");
  console.log("  Exam: FY LLB SEM 1 - October 2024 (Regular)");
  console.log(`${"=".repeat(70)}\n`);

  console.log(`Old system: ${oldList.length} students`);
  console.log(`New system: ${newList.length} students\n`);

  // Build lookup maps by rollNo
  const oldMap = new Map(oldList.map((s) => [String(s.rollNo).trim(), s]));
  const newMap = new Map(newList.map((s) => [String(s.rollNo).trim(), s]));

  // Find missing
  const onlyInOld = [...oldMap.keys()].filter((r) => !newMap.has(r));
  const onlyInNew = [...newMap.keys()].filter((r) => !oldMap.has(r));

  if (onlyInOld.length) console.log(`ONLY in OLD (missing from new): ${onlyInOld.join(", ")}`);
  if (onlyInNew.length) console.log(`ONLY in NEW (missing from old): ${onlyInNew.join(", ")}`);

  // Compare matching
  const commonRolls = [...oldMap.keys()].filter((r) => newMap.has(r));
  console.log(`Common students: ${commonRolls.length}\n`);

  let totalDiffs = 0;
  const diffDetails = [];

  for (const roll of commonRolls) {
    const o = oldMap.get(roll);
    const n = newMap.get(roll);
    const diffs = [];

    // Core fields
    const check = (field, oVal, nVal) => {
      const oStr = JSON.stringify(oVal);
      const nStr = JSON.stringify(nVal);
      if (oStr !== nStr) diffs.push({ field, old: oVal, new: nVal });
    };

    check("name", String(o.name).trim(), String(n.name).trim());
    check("seatNo", o.seatNo, n.seatNo);
    check("grNo", o.grNo, n.grNo);
    check("prn", o.prn, n.prn);
    check("totalMarksObt", o.totalMarksObt, n.totalMarksObt);
    check("totalCG", o.totalCG, n.totalCG);
    check("totalCredits", o.totalCredits, n.totalCredits);
    check("totalEarned", o.totalEarned, n.totalEarned);
    check("sgpa", o.sgpa, n.sgpa);
    check("finalGrade", o.finalGrade, n.finalGrade);
    check("cgpa", o.cgpa, n.cgpa);
    check("remark", o.remark, n.remark);
    check("allPassed", o.allPassed, n.allPassed);

    // Subject-level comparison
    for (let i = 0; i < o.subjects.length; i++) {
      const os = o.subjects[i];
      const ns = n.subjects[i];
      if (!ns) { diffs.push({ field: `subject[${i}]`, old: "exists", new: "MISSING" }); continue; }
      check(`subject[${i}].internal`, os.internal, ns.internal);
      check(`subject[${i}].external`, os.external, ns.external);
      check(`subject[${i}].total`, os.total, ns.total);
      check(`subject[${i}].gp`, os.gp, ns.gp);
      check(`subject[${i}].earned`, os.earned, ns.earned);
      check(`subject[${i}].passed`, os.passed, ns.passed);
    }

    // Practical
    check("practical.gp", o.pracGp, n.practical.gp);
    check("practical.earned", o.pracEarned, n.practical.earned);
    check("practical.passed", o.pracPassed, n.practical.passed);

    if (diffs.length > 0) {
      totalDiffs++;
      diffDetails.push({ roll, name: o.name, diffs });
    }
  }

  // Report
  if (totalDiffs === 0) {
    console.log("RESULT: ALL MATCHING");
    console.log(`All ${commonRolls.length} students have identical data in both systems.\n`);
  } else {
    console.log(`RESULT: ${totalDiffs} student(s) with differences:\n`);
    for (const d of diffDetails) {
      console.log(`  Roll ${d.roll} (${d.name}):`);
      for (const diff of d.diffs) {
        console.log(`    ${diff.field}: OLD=${JSON.stringify(diff.old)}  NEW=${JSON.stringify(diff.new)}`);
      }
      console.log();
    }
  }

  // Summary table
  console.log(`${"─".repeat(50)}`);
  console.log(`Students in old system:  ${oldList.length}`);
  console.log(`Students in new system:  ${newList.length}`);
  console.log(`Only in old:             ${onlyInOld.length}`);
  console.log(`Only in new:             ${onlyInNew.length}`);
  console.log(`Common (matched):        ${commonRolls.length}`);
  console.log(`With differences:        ${totalDiffs}`);
  console.log(`Fully matching:          ${commonRolls.length - totalDiffs}`);
  console.log(`${"─".repeat(50)}\n`);
}

// ─── Run ────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const [oldStudents, newStudents] = await Promise.all([readOldSystem(), readNewSystem()]);
    compareStudents(oldStudents, newStudents);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
