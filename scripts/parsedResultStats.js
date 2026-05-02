/**
 * ParsedResult collection stats -- reports missing/empty fields per config and overall.
 *
 * Usage:  node scripts/parsedResultStats.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import ParsedResult from "../models/parsedResultModel.js";
import ResultConfig from "../models/resultConfigModel.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_DB_URI;

// Fields to check for missing/empty values
const FIELDS = ["name", "grNo", "prn", "seatNo", "remark", "sgpa", "finalGrade", "rollNo"];

function isEmpty(val) {
  if (val === undefined || val === null) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  return false;
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB\n");

  const configs = await ResultConfig.find({}).sort({ programme: 1, semesterNumber: 1 }).lean();
  const allRecords = await ParsedResult.find({}).lean();

  // Build config lookup
  const configMap = new Map();
  for (const c of configs) configMap.set(String(c._id), c);

  // Group records by config
  const byConfig = new Map();
  for (const r of allRecords) {
    const key = String(r.resultConfigId);
    if (!byConfig.has(key)) byConfig.set(key, []);
    byConfig.get(key).push(r);
  }

  // Overall counters
  const overall = { total: allRecords.length };
  for (const f of FIELDS) overall[f] = 0;
  overall.noSubjects = 0;
  overall.noPractical = 0;
  overall.zeroCredits = 0;
  overall.notPassed = 0;

  console.log("=" .repeat(100));
  console.log("PER-CONFIG STATS");
  console.log("=".repeat(100));

  for (const [configId, records] of byConfig) {
    const cfg = configMap.get(configId);
    const label = cfg
      ? `${cfg.programme} | Sem ${cfg.semesterNumber} | ${cfg.examType} | ${cfg.year}`
      : `Unknown config ${configId}`;

    const stats = { total: records.length };
    for (const f of FIELDS) stats[f] = 0;
    stats.noSubjects = 0;
    stats.noPractical = 0;
    stats.zeroCredits = 0;
    stats.notPassed = 0;

    for (const r of records) {
      for (const f of FIELDS) {
        if (isEmpty(r[f])) stats[f]++;
      }
      if (!r.subjects || r.subjects.length === 0) stats.noSubjects++;
      if (!r.practical) stats.noPractical++;
      if (r.totalCredits === 0) stats.zeroCredits++;
      if (!r.allPassed) stats.notPassed++;
    }

    // Aggregate into overall
    for (const f of FIELDS) overall[f] += stats[f];
    overall.noSubjects += stats.noSubjects;
    overall.noPractical += stats.noPractical;
    overall.zeroCredits += stats.zeroCredits;
    overall.notPassed += stats.notPassed;

    // Only print configs that have at least one missing field
    const hasMissing = FIELDS.some((f) => stats[f] > 0) || stats.noSubjects > 0;
    if (!hasMissing) continue;

    console.log(`\n${label}  (${stats.total} students)`);
    console.log("-".repeat(60));
    for (const f of FIELDS) {
      if (stats[f] > 0) {
        const pct = ((stats[f] / stats.total) * 100).toFixed(1);
        console.log(`  missing ${f.padEnd(12)} : ${String(stats[f]).padStart(5)} / ${stats.total}  (${pct}%)`);
      }
    }
    if (stats.noSubjects > 0) console.log(`  no subjects      : ${String(stats.noSubjects).padStart(5)} / ${stats.total}`);
    if (stats.noPractical > 0) console.log(`  no practical     : ${String(stats.noPractical).padStart(5)} / ${stats.total}`);
    if (stats.zeroCredits > 0) console.log(`  zero credits     : ${String(stats.zeroCredits).padStart(5)} / ${stats.total}`);
    if (stats.notPassed > 0) console.log(`  not all passed   : ${String(stats.notPassed).padStart(5)} / ${stats.total}`);
  }

  // Overall summary
  console.log("\n" + "=".repeat(100));
  console.log("OVERALL SUMMARY");
  console.log("=".repeat(100));
  console.log(`  Total records    : ${overall.total}`);
  console.log(`  Total configs    : ${byConfig.size}`);
  console.log("");
  for (const f of FIELDS) {
    const pct = overall.total ? ((overall[f] / overall.total) * 100).toFixed(1) : "0.0";
    console.log(`  missing ${f.padEnd(12)} : ${String(overall[f]).padStart(5)} / ${overall.total}  (${pct}%)`);
  }
  console.log(`  no subjects      : ${String(overall.noSubjects).padStart(5)} / ${overall.total}`);
  console.log(`  no practical     : ${String(overall.noPractical).padStart(5)} / ${overall.total}`);
  console.log(`  zero credits     : ${String(overall.zeroCredits).padStart(5)} / ${overall.total}`);
  console.log(`  not all passed   : ${String(overall.notPassed).padStart(5)} / ${overall.total}`);

  await mongoose.disconnect();
  console.log("\nDone.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
