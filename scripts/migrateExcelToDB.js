/**
 * Migration: Parse all Excel-based ResultConfigs and store data in ParsedResult collection.
 *
 * Usage: node scripts/migrateExcelToDB.js
 *
 * Safe to re-run -- uses upsert on (resultConfigId, rollNo).
 * Does NOT flip dataSource to "db" -- run verifyMigration.js --commit for that.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import ResultConfig from "../models/resultConfigModel.js";
import SemesterResult from "../models/semesterResultModel.js";
import ParsedResult from "../models/parsedResultModel.js";
import { readStudents, readStudentsStandard } from "../utils/resultExcelParser.js";

const MONGO_URI = process.env.MONGO_DB_URI || process.env.MONGODB_URI;

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

function buildParsedResultDoc(student, configId) {
  return {
    resultConfigId: configId,
    rowNumber: student.row,
    seatNo: student.seatNo,
    name: student.name,
    rollNo: String(student.rollNo),
    grNo: student.grNo,
    prn: student.prn,
    subjects: student.subjects,
    practical: student.practical,
    totalMarksObt: student.totalMarksObt,
    maxMarks: student.maxMarks,
    totalCG: student.totalCG,
    totalCredits: student.totalCredits,
    totalEarned: student.totalEarned,
    sgpa: student.sgpa,
    finalGrade: student.finalGrade,
    cgpa: student.cgpa,
    remark: student.remark,
    allPassed: student.allPassed,
  };
}

async function upsertSemesterResults(students, config, configDoc) {
  if (!students.length) return;
  const ops = students.map((s) => ({
    updateOne: {
      filter: {
        rollNo: String(s.rollNo),
        programId: config.programId,
        semesterNumber: config.semesterNumber,
      },
      update: {
        $set: {
          totalCredits: s.totalCredits,
          earnedCredits: s.totalEarned,
          totalCG: s.totalCG,
          sgpa: s.sgpa || 0,
          finalGrade: s.finalGrade,
          remark: s.remark,
          subjects: s.subjects.map((sub) => ({
            code: sub.code,
            name: sub.name,
            credit: sub.credit,
            internal: typeof sub.internal === "number" ? sub.internal : 0,
            external: typeof sub.external === "number" ? sub.external : 0,
            total: sub.total,
            grade: sub.grade,
            gp: sub.gp,
            earned: sub.earned,
            passed: sub.passed,
          })),
          practical: s.practical
            ? {
                code: s.practical.code,
                name: s.practical.name,
                credit: s.practical.credit,
                total:
                  typeof s.practical.total === "number"
                    ? s.practical.total
                    : typeof s.practical.marks === "number"
                      ? s.practical.marks
                      : 0,
                grade: s.practical.grade,
                gp: s.practical.gp,
                earned: s.practical.earned,
                passed: s.practical.passed,
              }
            : null,
          programme: config.programme,
          programId: config.programId,
          resultConfigId: configDoc._id,
          examType: config.examType || "regular",
          academicYear: config.year || "",
        },
      },
      upsert: true,
    },
  }));
  await SemesterResult.bulkWrite(ops, { ordered: false });
}

async function migrate() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.\n");

  const configs = await ResultConfig.find({
    dataSource: "excel",
    excelFile: { $exists: true, $ne: null, $ne: "" },
  }).lean();

  console.log(`Found ${configs.length} Excel-based ResultConfigs to migrate.\n`);

  let totalStudents = 0;
  let totalConfigs = 0;
  let errors = 0;

  for (const doc of configs) {
    const slug = doc.slug;
    try {
      const parserCfg = toParserConfig(doc);
      const students =
        doc.excelFormat === "standard"
          ? await readStudentsStandard(parserCfg)
          : await readStudents(parserCfg);

      if (!students.length) {
        console.log(`  [EMPTY]   ${slug}: 0 students parsed`);
        continue;
      }

      // Bulk upsert into ParsedResult
      const ops = students.map((s) => ({
        updateOne: {
          filter: {
            resultConfigId: doc._id,
            rollNo: String(s.rollNo),
          },
          update: { $set: buildParsedResultDoc(s, doc._id) },
          upsert: true,
        },
      }));
      const bulkRes = await ParsedResult.bulkWrite(ops, { ordered: false });
      const upserted = bulkRes.upsertedCount || 0;
      const modified = bulkRes.modifiedCount || 0;

      // Also populate SemesterResult for CGPA
      await upsertSemesterResults(students, parserCfg, doc);

      totalStudents += students.length;
      totalConfigs++;
      console.log(
        `  [OK]      ${slug}: ${students.length} students (${upserted} new, ${modified} updated)`
      );
    } catch (err) {
      errors++;
      console.error(`  [ERROR]   ${slug}: ${err.message}`);
    }
  }

  console.log("\n--- Migration Summary ---");
  console.log(`  Configs processed: ${totalConfigs}/${configs.length}`);
  console.log(`  Total students stored: ${totalStudents}`);
  console.log(`  Errors: ${errors}`);
  console.log(
    "\nDone. dataSource NOT flipped yet. Run verifyMigration.js --commit to finalize."
  );

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});