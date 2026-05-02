/**
 * Migration: Seed all 29 hardcoded exam configs into the ResultConfig collection.
 *
 * Usage: node scripts/migrateResultConfigs.js
 *
 * Safe to re-run -- uses upsert on slug so existing docs are updated, not duplicated.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the hardcoded configs + model
import EXAM_CONFIGS from "../config/resultExamConfigs.js";
import ResultConfig from "../models/resultConfigModel.js";

const MONGO_URI = process.env.MONGO_DB_URI || process.env.MONGODB_URI;

// Map programme display names to Program.programName in DB
const PROGRAMME_NAME_MAP = {
  "FIRST YEAR LL.B. (THREE YEAR COURSE)": "LLB",
  "SECOND YEAR LL.B. (THREE YEAR COURSE)": "LLB",
  "THIRD YEAR LL.B. (THREE YEAR COURSE)": "LLB",
  "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)": "BA LLB",
  "SECOND YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)": "BA LLB",
  "THIRD YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)": "BA LLB",
  "FOURTH YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)": "BA LLB",
  "FIFTH YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)": "BA LLB",
};

async function migrate() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.\n");

  const entries = Object.entries(EXAM_CONFIGS);
  console.log(`Found ${entries.length} hardcoded configs to migrate.\n`);

  // Load programs from DB to resolve programId
  const programs = await mongoose.connection.db.collection("programs").find({}).project({ programName: 1 }).toArray();
  const programMap = new Map();
  for (const p of programs) programMap.set(p.programName, p._id);
  console.log(`Loaded ${programs.length} programs: ${[...programMap.keys()].join(", ")}\n`);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const [slug, cfg] of entries) {
    try {
      const progName = PROGRAMME_NAME_MAP[cfg.programme];
      const programId = progName ? programMap.get(progName) : null;
      if (!programId) {
        console.error(`  [SKIP]    ${slug}: No Program found for "${cfg.programme}" (mapped to "${progName}")`);
        errors++;
        continue;
      }

      // Build the document matching the ResultConfig schema
      const doc = {
        slug,
        label: cfg.label,
        programme: cfg.programme,
        programId,
        semester: cfg.semester,
        semesterNumber: cfg.semesterNumber,
        totalSemesters: cfg.totalSemesters,
        examType: cfg.examType,
        year: cfg.year,
        examMonth: cfg.examMonth,
        resultDeclaredOn: cfg.resultDeclaredOn || "",
        place: cfg.place || "Mumbai",
        dataSource: "excel",
        excelFile: cfg.file, // absolute path as stored in old config
        sheetIndex: cfg.sheet,
        dataStartRow: cfg.dataStartRow,
        columns: {
          studentId: cfg.columns.studentId,
          name: cfg.columns.name,
          rollNo: cfg.columns.rollNo,
          grNo: cfg.columns.grNo,
          grandTotal: cfg.columns.grandTotal,
          remarks: cfg.columns.remarks,
          prn: cfg.columns.prn,
        },
        subjects: cfg.subjects.map((s) => ({
          code: s.code,
          name: s.name,
          credit: s.credit,
          iCol: s.iCol,
          eCol: s.eCol,
          tCol: s.tCol || undefined,
          gpCol: s.gpCol || undefined,
          elective: s.elective || false,
        })),
        limits: cfg.limits
          ? {
              maxI: cfg.limits.maxI,
              minI: cfg.limits.minI,
              maxE: cfg.limits.maxE,
              minE: cfg.limits.minE,
              maxT: cfg.limits.maxT,
              minT: cfg.limits.minT,
            }
          : undefined,
        practical: cfg.practical
          ? {
              code: cfg.practical.code,
              name: cfg.practical.name,
              type: cfg.practical.type,
              col: cfg.practical.col || undefined,
              iCol: cfg.practical.iCol || undefined,
              eCol: cfg.practical.eCol || undefined,
              tCol: cfg.practical.tCol || undefined,
              maxI: cfg.practical.maxI || undefined,
              minI: cfg.practical.minI || undefined,
              maxE: cfg.practical.maxE || undefined,
              minE: cfg.practical.minE || undefined,
              max: cfg.practical.max,
              min: cfg.practical.min,
              credit: cfg.practical.credit,
            }
          : null,
        remarkMap: cfg.remarkMap || null,
        status: "active",
      };

      const result = await ResultConfig.findOneAndUpdate(
        { slug },
        { $set: doc },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
        console.log(`  [CREATED] ${slug}`);
      } else {
        updated++;
        console.log(`  [UPDATED] ${slug}`);
      }
    } catch (err) {
      errors++;
      console.error(`  [ERROR]   ${slug}: ${err.message}`);
    }
  }

  console.log(`\nMigration complete: ${created} created, ${updated} updated, ${errors} errors.`);
  console.log(`Total ResultConfig documents: ${await ResultConfig.countDocuments()}`);

  await mongoose.disconnect();
  console.log("Disconnected.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
