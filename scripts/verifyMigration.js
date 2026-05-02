/**
 * Verify Excel-to-DB migration and optionally commit (flip dataSource to "db").
 *
 * Usage:
 *   node scripts/verifyMigration.js            # verify only, report mismatches
 *   node scripts/verifyMigration.js --commit    # verify + flip dataSource to "db"
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import ResultConfig from "../models/resultConfigModel.js";
import ParsedResult from "../models/parsedResultModel.js";
import { readStudents, readStudentsStandard } from "../utils/resultExcelParser.js";

const MONGO_URI = process.env.MONGO_DB_URI || process.env.MONGODB_URI;
const COMMIT = process.argv.includes("--commit");

function toParserConfig(doc) {
  return {
    file: doc.excelFile,
    sheet: doc.sheetIndex,
    dataStartRow: doc.dataStartRow,
    columns: doc.columns,
    subjects: doc.subjects,
    limits: doc.limits,
    practical: doc.practical || null,
    remarkMap: doc.remarkMap
      ? (doc.remarkMap instanceof Map ? Object.fromEntries(doc.remarkMap) : doc.remarkMap)
      : null,
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
    place: doc.place,
  };
}

async function verify() {
  console.log(`Mode: ${COMMIT ? "VERIFY + COMMIT" : "VERIFY ONLY"}\n`);
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.\n");

  const configs = await ResultConfig.find({
    dataSource: "excel",
    excelFile: { $exists: true, $ne: null, $ne: "" },
  }).lean();

  console.log(`Found ${configs.length} Excel-based configs to verify.\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const doc of configs) {
    const slug = doc.slug;
    try {
      // Parse Excel
      const parserCfg = toParserConfig(doc);
      const excelStudents =
        doc.excelFormat === "standard"
          ? await readStudentsStandard(parserCfg)
          : await readStudents(parserCfg);

      // Load DB
      const dbStudents = await ParsedResult.find({ resultConfigId: doc._id }).lean();

      // Count check
      if (excelStudents.length !== dbStudents.length) {
        const msg = `${slug}: COUNT MISMATCH -- Excel=${excelStudents.length}, DB=${dbStudents.length}`;
        console.log(`  [FAIL]  ${msg}`);
        failures.push(msg);
        failed++;
        continue;
      }

      if (excelStudents.length === 0) {
        console.log(`  [SKIP]  ${slug}: 0 students`);
        continue;
      }

      // Spot-check up to 3 random students
      const dbMap = new Map(dbStudents.map((s) => [String(s.rollNo), s]));
      const sampleSize = Math.min(3, excelStudents.length);
      const indices = new Set();
      while (indices.size < sampleSize) {
        indices.add(Math.floor(Math.random() * excelStudents.length));
      }

      let spotOk = true;
      for (const idx of indices) {
        const exStu = excelStudents[idx];
        const dbStu = dbMap.get(String(exStu.rollNo));
        if (!dbStu) {
          const msg = `${slug}: Roll ${exStu.rollNo} missing in DB`;
          console.log(`  [FAIL]  ${msg}`);
          failures.push(msg);
          spotOk = false;
          break;
        }
        // Compare key numeric fields
        const checks = [
          ["sgpa", exStu.sgpa, dbStu.sgpa],
          ["totalMarksObt", exStu.totalMarksObt, dbStu.totalMarksObt],
          ["subjects.length", exStu.subjects.length, dbStu.subjects.length],
          ["totalCredits", exStu.totalCredits, dbStu.totalCredits],
          ["remark", exStu.remark, dbStu.remark],
        ];
        for (const [field, expected, actual] of checks) {
          // Allow null vs 0 for sgpa
          const expN = expected ?? 0;
          const actN = actual ?? 0;
          if (String(expN) !== String(actN)) {
            const msg = `${slug}: Roll ${exStu.rollNo} field ${field} -- Excel=${expected}, DB=${actual}`;
            console.log(`  [FAIL]  ${msg}`);
            failures.push(msg);
            spotOk = false;
          }
        }
        if (!spotOk) break;
      }

      if (!spotOk) {
        failed++;
        continue;
      }

      passed++;
      console.log(`  [OK]    ${slug}: ${excelStudents.length} students verified`);
    } catch (err) {
      const msg = `${slug}: ERROR -- ${err.message}`;
      console.log(`  [FAIL]  ${msg}`);
      failures.push(msg);
      failed++;
    }
  }

  console.log("\n--- Verification Summary ---");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  if (failures.length) {
    console.log("\n  Failures:");
    failures.forEach((f) => console.log(`    - ${f}`));
  }

  if (COMMIT) {
    if (failed > 0) {
      console.log(`\n[ABORT] ${failed} config(s) failed verification. Fix issues and re-run.`);
    } else {
      console.log("\nAll configs passed. Flipping dataSource to 'db'...");
      const ids = configs.map((c) => c._id);
      const res = await ResultConfig.updateMany(
        { _id: { $in: ids } },
        { $set: { dataSource: "db" } }
      );
      console.log(`  Updated ${res.modifiedCount} configs to dataSource="db".`);
      console.log("Done. Result cards will now read from the database.");
    }
  } else {
    console.log("\nRun with --commit to flip dataSource to 'db'.");
  }

  await mongoose.disconnect();
}

verify().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
