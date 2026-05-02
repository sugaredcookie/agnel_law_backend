/**
 * Migration: fix-elective-inflation.js
 *
 * Finds all ParsedResult records where empty elective subjects (total=0, cg=0, passed=false)
 * are inflating totalCredits, and removes them + recalculates derived fields.
 *
 * Run with: node scripts/fix-elective-inflation.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import ResultConfig from "../models/resultConfigModel.js";
import ParsedResult from "../models/parsedResultModel.js";

dotenv.config();

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

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const configs = await ResultConfig.find({ status: { $ne: "archived" } }).lean();
  let totalFixed = 0;

  for (const config of configs) {
    const electiveCodes = new Set(
      (config.subjects || []).filter((s) => s.elective).map((s) => Number(s.code))
    );
    if (electiveCodes.size === 0) continue;

    const records = await ParsedResult.find({ resultConfigId: config._id }).lean();

    const ops = [];
    for (const rec of records) {
      const before = rec.subjects?.length || 0;
      const cleaned = (rec.subjects || []).filter((s) => {
        if (!electiveCodes.has(Number(s.code))) return true;
        const hasMarks = (s.internal > 0) || (s.external > 0) || (s.total > 0);
        const isAbsent = s.isAbsent || s.internalAbsent || s.externalAbsent;
        return hasMarks || isAbsent;
      });

      if (cleaned.length === before) continue;

      let totalMarksObt = 0, totalCG = 0, totalCredits = 0, totalEarned = 0;
      for (const s of cleaned) {
        totalMarksObt += typeof s.total === "number" ? s.total : 0;
        totalCG += s.cg || 0;
        totalCredits += s.credit || 0;
        totalEarned += s.earned || 0;
      }
      if (rec.practical) {
        totalMarksObt += rec.practical.total || 0;
        totalCG += rec.practical.cg || 0;
        totalCredits += rec.practical.credit || 0;
        totalEarned += rec.practical.earned || 0;
      }

      const sgpa = totalCredits > 0 ? parseFloat((totalCG / totalCredits).toFixed(2)) : null;
      const finalGrade = getFinalGrade(sgpa);
      const allPassed = cleaned.every((s) => s.passed) && (rec.practical ? rec.practical.passed : true);
      const hasAbsent = cleaned.some((s) => s.isAbsent);
      const remark = hasAbsent ? "ABSENT" : allPassed ? "SUCCESSFUL" : "UNSUCCESSFUL";

      ops.push({
        updateOne: {
          filter: { _id: rec._id },
          update: {
            $set: {
              subjects: cleaned,
              totalMarksObt,
              totalCG,
              totalCredits,
              totalEarned,
              sgpa,
              finalGrade,
              allPassed,
              remark,
            },
          },
        },
      });
    }

    if (ops.length) {
      await ParsedResult.bulkWrite(ops, { ordered: false });
      console.log(`Config "${config.slug}": fixed ${ops.length} record(s)`);
      totalFixed += ops.length;
    }
  }

  console.log(`Done. Total records fixed: ${totalFixed}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
