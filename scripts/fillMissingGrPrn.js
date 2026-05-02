/**
 * Fill missing grNo and prn in ParsedResult by looking up the Student collection.
 * Matches on rollNumber (digits-only comparison for flexibility).
 *
 * Usage:
 *   node scripts/fillMissingGrPrn.js          # dry-run (report only)
 *   node scripts/fillMissingGrPrn.js --commit  # apply updates
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import ParsedResult from "../models/parsedResultModel.js";
import Student from "../models/studentModel.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_DB_URI;
const COMMIT = process.argv.includes("--commit");

function digits(val) {
  return String(val || "").replace(/\D/g, "");
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB  (mode: ${COMMIT ? "COMMIT" : "DRY-RUN"})\n`);

  // Load all students with rollNumber + grNumber + prnNumber
  const students = await Student.find({
    "academicDetails.rollNumber": { $exists: true, $ne: "" },
  })
    .select("academicDetails.rollNumber studentDetails.grNumber studentDetails.prnNumber")
    .lean();

  // Build lookup maps keyed by digits-only roll number
  const grMap = new Map();   // digits -> grNumber
  const prnMap = new Map();  // digits -> prnNumber

  for (const s of students) {
    const roll = digits(s.academicDetails?.rollNumber);
    if (!roll) continue;
    const gr = s.studentDetails?.grNumber;
    const prn = s.studentDetails?.prnNumber;
    if (gr) grMap.set(roll, gr);
    if (prn) prnMap.set(roll, prn);
  }

  console.log(`Student collection: ${students.length} records with roll numbers`);
  console.log(`  grNumber available : ${grMap.size}`);
  console.log(`  prnNumber available: ${prnMap.size}\n`);

  // Find ParsedResult records missing grNo or prn
  const missing = await ParsedResult.find({
    $or: [
      { grNo: { $in: [null, "", undefined] } },
      { prn: { $in: [null, "", undefined] } },
    ],
  }).lean();

  console.log(`ParsedResult records with missing grNo or prn: ${missing.length}\n`);

  let grFixed = 0;
  let prnFixed = 0;
  let grNotFound = 0;
  let prnNotFound = 0;
  const ops = [];

  for (const r of missing) {
    const roll = digits(r.rollNo);
    if (!roll) continue;

    const update = {};
    const needsGr = !r.grNo || String(r.grNo).trim() === "";
    const needsPrn = !r.prn || String(r.prn).trim() === "";

    if (needsGr) {
      if (grMap.has(roll)) {
        update.grNo = grMap.get(roll);
        grFixed++;
      } else {
        grNotFound++;
      }
    }

    if (needsPrn) {
      if (prnMap.has(roll)) {
        update.prn = prnMap.get(roll);
        prnFixed++;
      } else {
        prnNotFound++;
      }
    }

    if (Object.keys(update).length > 0) {
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: update },
        },
      });
    }
  }

  console.log("Results:");
  console.log(`  grNo  fixed      : ${grFixed}`);
  console.log(`  grNo  not found  : ${grNotFound}  (no matching student in DB)`);
  console.log(`  prn   fixed      : ${prnFixed}`);
  console.log(`  prn   not found  : ${prnNotFound}  (no matching student in DB)`);
  console.log(`  total updates    : ${ops.length}\n`);

  if (COMMIT && ops.length > 0) {
    const result = await ParsedResult.bulkWrite(ops, { ordered: false });
    console.log(`Committed: ${result.modifiedCount} records updated.`);
  } else if (ops.length > 0) {
    console.log("Dry-run complete. Run with --commit to apply updates.");
  } else {
    console.log("Nothing to update.");
  }

  // Show remaining gaps after fix
  if (grNotFound > 0 || prnNotFound > 0) {
    console.log("\n--- Records still missing after fix ---");
    for (const r of missing) {
      const roll = digits(r.rollNo);
      const stillMissingGr = (!r.grNo || String(r.grNo).trim() === "") && !grMap.has(roll);
      const stillMissingPrn = (!r.prn || String(r.prn).trim() === "") && !prnMap.has(roll);
      if (stillMissingGr || stillMissingPrn) {
        const flags = [stillMissingGr && "grNo", stillMissingPrn && "prn"].filter(Boolean).join(", ");
        console.log(`  rollNo: ${r.rollNo}  missing: ${flags}`);
      }
    }
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
