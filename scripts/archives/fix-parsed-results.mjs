#!/usr/bin/env node
/**
 * fix-parsed-results.mjs
 *
 * Fixes broken ParsedResult data in MongoDB:
 *   Phase 1 — Fix malformed iDisplay/eDisplay values across ALL configs
 *             (EX suffix, trailing +, grace marks numeric recalc)
 *   Phase 2 — Apply highest-marks comparison for ATKT/Reval vs Regular,
 *             mark changed display values with trailing "*"
 *
 * Usage:
 *   node scripts/fix-parsed-results.mjs              # dry run (no writes)
 *   node scripts/fix-parsed-results.mjs --apply      # persist changes
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import ParsedResult from "../models/parsedResultModel.js";
import ResultConfig from "../models/resultConfigModel.js";

dotenv.config();

const DRY_RUN = !process.argv.includes("--apply");

// ── Helpers (same logic as resultExcelParser.js) ─────────────────────────────

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

function parseMarks(value) {
  if (value === null || value === undefined) return { num: null, display: null };
  if (typeof value === "number") return { num: value, display: value };
  const str = String(value).trim();
  if (str === "") return { num: null, display: null };

  const stripped = str.replace(/^\((.+)\)$/, "$1").toLowerCase();
  if (["ab", "absent"].includes(stripped)) return { num: "AB", display: "AB" };
  if (stripped === "rr") return { num: "RR", display: "RR" };

  const exMatch = str.match(/^(\d+)\s*EX$/i);
  if (exMatch) {
    const n = parseInt(exMatch[1], 10);
    return { num: n, display: n };
  }

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

/** Returns true when the DB value looks like a broken "15+", "27 + 3", or "59 EX" */
function needsFix(val) {
  if (typeof val !== "string") return false;
  const upper = val.toUpperCase();
  if (["AB", "RR", "ABSENT"].includes(upper)) return false;
  return val.includes("+") || /EX/i.test(val);
}

function recalcStudentAggregates(result) {
  let totalMarksObt = 0, totalCG = 0, totalCredits = 0, totalEarned = 0;
  for (const s of result.subjects) {
    totalMarksObt += s.total || 0;
    totalCG += s.cg || 0;
    totalCredits += s.credit || 0;
    totalEarned += s.earned || 0;
  }
  if (result.practical) {
    totalMarksObt += result.practical.total || 0;
    totalCG += result.practical.cg || 0;
    totalCredits += result.practical.credit || 0;
    totalEarned += result.practical.earned || 0;
  }
  result.totalMarksObt = totalMarksObt;
  result.totalCG = totalCG;
  result.totalCredits = totalCredits;
  result.totalEarned = totalEarned;
  result.sgpa = totalCredits > 0
    ? parseFloat((totalCG / totalCredits).toFixed(2))
    : null;
  result.finalGrade = result.sgpa !== null ? getFinalGrade(result.sgpa) : "F";
  result.cgpa = result.sgpa || 0;
  result.allPassed =
    result.subjects.every((s) => s.passed) &&
    (result.practical ? result.practical.passed : true);
  const hasAbsent = result.subjects.some((s) => s.isAbsent);
  result.remark = hasAbsent
    ? "ABSENT"
    : result.allPassed
      ? "SUCCESSFUL"
      : "UNSUCCESSFUL";
}

// ── Phase 1: Fix broken display / numeric values ─────────────────────────────

async function phase1() {
  console.log("\n=== PHASE 1: Fix broken iDisplay/eDisplay values ===\n");

  const configs = await ResultConfig.find({ status: { $ne: "archived" } }).lean();
  let totalFixed = 0;

  for (const config of configs) {
    const results = await ParsedResult.find({ resultConfigId: config._id });
    const limits = config.limits || {};
    let configFixed = 0;

    for (const result of results) {
      let changed = false;

      // ── Subjects ──
      for (const subj of result.subjects) {
        let subjChanged = false;

        // Fix internal / iDisplay
        const iSrc = needsFix(subj.iDisplay) ? subj.iDisplay
          : (typeof subj.internal === "string" && needsFix(subj.internal)) ? subj.internal
            : null;
        if (iSrc !== null) {
          const parsed = parseMarks(iSrc);
          if (parsed.num !== subj.internal || String(parsed.display) !== String(subj.iDisplay)) {
            console.log(
              `  [${config.slug}] Roll ${result.rollNo} ${subj.name}: ` +
              `iDisplay "${subj.iDisplay}"→"${parsed.display}", internal ${subj.internal}→${parsed.num}`
            );
            subj.internal = parsed.num;
            subj.iDisplay = parsed.display;
            subjChanged = true;
          }
        }

        // Fix external / eDisplay
        const eSrc = needsFix(subj.eDisplay) ? subj.eDisplay
          : (typeof subj.external === "string" && needsFix(subj.external)) ? subj.external
            : null;
        if (eSrc !== null) {
          const parsed = parseMarks(eSrc);
          if (parsed.num !== subj.external || String(parsed.display) !== String(subj.eDisplay)) {
            console.log(
              `  [${config.slug}] Roll ${result.rollNo} ${subj.name}: ` +
              `eDisplay "${subj.eDisplay}"→"${parsed.display}", external ${subj.external}→${parsed.num}`
            );
            subj.external = parsed.num;
            subj.eDisplay = parsed.display;
            subjChanged = true;
          }
        }

        if (subjChanged) {
          changed = true;
          const i = typeof subj.internal === "number" ? subj.internal : 0;
          const e = typeof subj.external === "number" ? subj.external : 0;
          subj.total = i + e;
          subj.passed =
            !subj.isAbsent &&
            i >= (limits.minI ?? 10) &&
            e >= (limits.minE ?? 30) &&
            subj.total >= (limits.minT ?? 40);
          const gi = subj.passed ? getGradeInfo(subj.total) : { grade: "F", gp: 0 };
          subj.grade = gi.grade;
          subj.gp = gi.gp;
          subj.earned = subj.passed ? subj.credit : 0;
          subj.cg = subj.earned * gi.gp;
        }
      }

      // ── Practical ──
      if (result.practical) {
        const p = result.practical;

        if (p.type === "single" && needsFix(p.display)) {
          const parsed = parseMarks(p.display);
          if (parsed.num !== p.marks || String(parsed.display) !== String(p.display)) {
            console.log(
              `  [${config.slug}] Roll ${result.rollNo} Practical: ` +
              `display "${p.display}"→"${parsed.display}", marks ${p.marks}→${parsed.num}`
            );
            p.marks = parsed.num;
            p.display = parsed.display;
            p.total = typeof parsed.num === "number" ? parsed.num : 0;
            p.passed = p.total >= (p.min ?? 0);
            const pgi = p.passed ? getGradeInfo(p.total) : { grade: "F", gp: 0 };
            p.grade = pgi.grade;
            p.gp = pgi.gp;
            p.earned = p.passed ? (p.credit || 4) : 0;
            p.cg = p.earned * pgi.gp;
            changed = true;
          }
        }

        if (p.type === "split") {
          let pChanged = false;
          if (needsFix(p.iDisplay)) {
            const parsed = parseMarks(p.iDisplay);
            console.log(`  [${config.slug}] Roll ${result.rollNo} Practical-I: "${p.iDisplay}"→"${parsed.display}"`);
            p.internal = parsed.num;
            p.iDisplay = parsed.display;
            pChanged = true;
          }
          if (needsFix(p.eDisplay)) {
            const parsed = parseMarks(p.eDisplay);
            console.log(`  [${config.slug}] Roll ${result.rollNo} Practical-E: "${p.eDisplay}"→"${parsed.display}"`);
            p.external = parsed.num;
            p.eDisplay = parsed.display;
            pChanged = true;
          }
          if (pChanged) {
            const pi = typeof p.internal === "number" ? p.internal : 0;
            const pe = typeof p.external === "number" ? p.external : 0;
            p.total = pi + pe;
            p.display = p.total;
            p.passed =
              pi >= (p.minI ?? 0) &&
              pe >= (p.minE ?? 0) &&
              p.total >= (p.min ?? 0);
            const pgi = p.passed ? getGradeInfo(p.total) : { grade: "F", gp: 0 };
            p.grade = pgi.grade;
            p.gp = pgi.gp;
            p.earned = p.passed ? (p.credit || 4) : 0;
            p.cg = p.earned * pgi.gp;
            changed = true;
          }
        }
      }

      // ── Recalc + save ──
      if (changed) {
        recalcStudentAggregates(result);
        if (!DRY_RUN) {
          result.markModified("subjects");
          if (result.practical) result.markModified("practical");
          await result.save();
        }
        configFixed++;
      }
    }

    if (configFixed > 0) {
      console.log(`  → ${config.slug}: ${configFixed} students fixed\n`);
      totalFixed += configFixed;
    }
  }

  console.log(`Phase 1 done: ${totalFixed} students fixed${DRY_RUN ? " (DRY RUN)" : ""}\n`);
  return totalFixed;
}

// ── Phase 2: Highest-marks comparison (ATKT/Reval vs Regular) ────────────────

async function phase2() {
  console.log("\n=== PHASE 2: Highest-marks comparison (ATKT/Reval vs Regular) ===\n");

  const configs = await ResultConfig.find({
    examType: { $in: ["atkt", "reval"] },
    status: { $ne: "archived" },
  }).lean();

  let totalUpdated = 0;

  for (const config of configs) {
    const regularConfig = await ResultConfig.findOne({
      programId: config.programId,
      semesterNumber: config.semesterNumber,
      year: config.year,
      examType: "regular",
      status: { $ne: "archived" },
    }).lean();

    if (!regularConfig) {
      console.log(`  [${config.slug}] No matching regular config — skipped`);
      continue;
    }

    console.log(`  [${config.slug}] comparing against [${regularConfig.slug}]`);

    const regularResults = await ParsedResult.find({
      resultConfigId: regularConfig._id,
    }).lean();
    const regularMap = new Map();
    for (const r of regularResults) regularMap.set(r.rollNo, r);

    const results = await ParsedResult.find({ resultConfigId: config._id });
    const limits = config.limits || {};
    let configUpdated = 0;

    for (const result of results) {
      const regular = regularMap.get(result.rollNo);
      if (!regular) continue;

      let changed = false;

      // ── Subjects ──
      for (const subj of result.subjects) {
        const regSubj = regular.subjects?.find((s) => s.code === subj.code);
        if (!regSubj) continue;

        const rawI = typeof subj.internal === "number" ? subj.internal : 0;
        const rawE = typeof subj.external === "number" ? subj.external : 0;
        const regI = typeof regSubj.internal === "number" ? regSubj.internal : 0;
        const regE = typeof regSubj.external === "number" ? regSubj.external : 0;

        const bestI = Math.max(rawI, regI);
        const bestE = Math.max(rawE, regE);
        const iImproved = bestI !== regI; // ATKT score was higher
        const eImproved = bestE !== regE;

        const newIDisplay = iImproved ? `${bestI}*` : bestI;
        const newEDisplay = eImproved ? `${bestE}*` : bestE;

        if (
          subj.internal !== bestI ||
          subj.external !== bestE ||
          String(subj.iDisplay) !== String(newIDisplay) ||
          String(subj.eDisplay) !== String(newEDisplay)
        ) {
          if (bestI !== rawI || bestE !== rawE) {
            console.log(
              `    Roll ${result.rollNo} ${subj.name}: ` +
              `I ${rawI}→${bestI}${iImproved ? "*" : ""}, ` +
              `E ${rawE}→${bestE}${eImproved ? "*" : ""}`
            );
          }

          subj.internal = bestI;
          subj.external = bestE;
          subj.iDisplay = newIDisplay;
          subj.eDisplay = newEDisplay;
          subj.total = bestI + bestE;
          subj.passed =
            !subj.isAbsent &&
            bestI >= (limits.minI ?? 10) &&
            bestE >= (limits.minE ?? 30) &&
            subj.total >= (limits.minT ?? 40);
          const gi = subj.passed
            ? getGradeInfo(subj.total)
            : { grade: "F", gp: 0 };
          subj.grade = gi.grade;
          subj.gp = gi.gp;
          subj.earned = subj.passed ? subj.credit : 0;
          subj.cg = subj.earned * gi.gp;
          changed = true;
        }
      }

      // ── Practical (split) ──
      if (result.practical?.type === "split" && regular.practical) {
        const p = result.practical;
        const rp = regular.practical;
        const rawPI = typeof p.internal === "number" ? p.internal : 0;
        const rawPE = typeof p.external === "number" ? p.external : 0;
        const regPI = typeof rp.internal === "number" ? rp.internal : 0;
        const regPE = typeof rp.external === "number" ? rp.external : 0;

        const bestPI = Math.max(rawPI, regPI);
        const bestPE = Math.max(rawPE, regPE);
        const piImproved = bestPI !== regPI;
        const peImproved = bestPE !== regPE;

        if (p.internal !== bestPI || p.external !== bestPE) {
          console.log(
            `    Roll ${result.rollNo} Practical: ` +
            `I ${rawPI}→${bestPI}, E ${rawPE}→${bestPE}`
          );
          p.internal = bestPI;
          p.external = bestPE;
          p.iDisplay = piImproved ? `${bestPI}*` : bestPI;
          p.eDisplay = peImproved ? `${bestPE}*` : bestPE;
          p.total = bestPI + bestPE;
          p.display = p.total;
          p.passed =
            bestPI >= (p.minI ?? 0) &&
            bestPE >= (p.minE ?? 0) &&
            p.total >= (p.min ?? 0);
          const pgi = p.passed
            ? getGradeInfo(p.total)
            : { grade: "F", gp: 0 };
          p.grade = pgi.grade;
          p.gp = pgi.gp;
          p.earned = p.passed ? (p.credit || 4) : 0;
          p.cg = p.earned * pgi.gp;
          changed = true;
        }
      }

      // ── Practical (single) ──
      if (
        result.practical?.type === "single" &&
        regular.practical?.type === "single"
      ) {
        const p = result.practical;
        const rp = regular.practical;
        const rawM = typeof p.marks === "number" ? p.marks : 0;
        const regM = typeof rp.marks === "number" ? rp.marks : 0;
        const bestM = Math.max(rawM, regM);

        if (p.marks !== bestM) {
          const mImproved = bestM !== regM;
          console.log(
            `    Roll ${result.rollNo} Practical: marks ${rawM}→${bestM}${mImproved ? "*" : ""}`
          );
          p.marks = bestM;
          p.display = mImproved ? `${bestM}*` : bestM;
          p.total = bestM;
          p.passed = bestM >= (p.min ?? 0);
          const pgi = p.passed
            ? getGradeInfo(bestM)
            : { grade: "F", gp: 0 };
          p.grade = pgi.grade;
          p.gp = pgi.gp;
          p.earned = p.passed ? (p.credit || 4) : 0;
          p.cg = p.earned * pgi.gp;
          changed = true;
        }
      }

      // ── Student-level recalc + save ──
      if (changed) {
        recalcStudentAggregates(result);
        if (!DRY_RUN) {
          result.markModified("subjects");
          if (result.practical) result.markModified("practical");
          await result.save();
        }
        configUpdated++;
      }
    }

    if (configUpdated > 0) {
      console.log(`  → ${config.slug}: ${configUpdated} students updated\n`);
      totalUpdated += configUpdated;
    } else {
      console.log(`  → ${config.slug}: 0 changes needed\n`);
    }
  }

  console.log(
    `Phase 2 done: ${totalUpdated} students updated${DRY_RUN ? " (DRY RUN)" : ""}\n`
  );
  return totalUpdated;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `  Fix ParsedResult Data  ${DRY_RUN ? "(DRY RUN — no writes)" : "(APPLYING CHANGES)"}`
  );
  console.log(`${"=".repeat(60)}`);

  await mongoose.connect(process.env.MONGO_DB_URI.trim());
  console.log("Connected to MongoDB\n");

  const p1 = await phase1();
  const p2 = await phase2();

  console.log(`${"=".repeat(60)}`);
  console.log(`  Phase 1: ${p1} students fixed  |  Phase 2: ${p2} students updated`);
  if (DRY_RUN)
    console.log("  ** DRY RUN — nothing saved. Re-run with --apply to persist. **");
  console.log(`${"=".repeat(60)}\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
