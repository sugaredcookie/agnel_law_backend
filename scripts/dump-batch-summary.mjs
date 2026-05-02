/**
 * Dump a clean summary of target batches with all subjects and IDs.
 * Run: node scripts/dump-batch-summary.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_DB_URI;

const TARGET_BATCHES = [
  "SYLLB-A", "SYLLB-B",
  "TYLLB-A", "TYLLB-B",
  "IVBA-LLB-A", "IVBA-LLB-B",
  "VBA-LLB-A", "VBA-LLB-B",
];

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const batchesColl = db.collection("batches");
  const subjectsColl = db.collection("subjects");

  for (const name of TARGET_BATCHES) {
    const batch = await batchesColl.findOne({ batchName: name });
    if (!batch) { console.log(`Batch "${name}": NOT FOUND\n`); continue; }

    const subjects = batch.subjects?.length
      ? await subjectsColl.find({ _id: { $in: batch.subjects } }).toArray()
      : [];

    const core = subjects.filter(s => !s.isElective);
    const elective = subjects.filter(s => s.isElective);

    console.log(`\nBatch: ${batch.batchName}`);
    console.log(`Batch ID: ${batch._id}`);
    console.log(`Program: ${batch.program?.name}`);
    console.log(`Term: ${batch.term}`);
    console.log(`Total Subjects: ${subjects.length} (${core.length} core + ${elective.length} elective)`);

    console.log(`\n  CORE SUBJECTS:`);
    for (const s of core) {
      console.log(`    ${s._id} | ${s.subjectCode.toString().padEnd(10)} | ${s.subjectName}`);
    }

    console.log(`\n  ELECTIVE SUBJECTS:`);
    for (const s of elective) {
      console.log(`    ${s._id} | ${s.subjectCode.toString().padEnd(10)} | ${s.subjectName}`);
    }
    console.log(`${"─".repeat(90)}`);
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
