/**
 * Script to check elective subjects in live DB for specific batches.
 * Run: node scripts/check-electives.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_DB_URI;

// ── Expected electives per batch (from user's list) ──────────────────────
const EXPECTED = {
  "S.Y.LL.B.": {
    note: "Optional Papers (Any one)",
    subjects: [
      "Criminology and Penology",
      "Bankruptcy Laws",
      "Human Rights Law",
    ],
  },
  "T.Y.LL.B.": {
    note: "Optional Papers (Any two)",
    subjects: [
      "Intellectual Property Laws",
      "Law of Banking and Negotiable Instruments",
      "Law and Medicine",
      "Law relating to Women and Children",
      "Law of Insurance",
      "Conflicts of Law",
    ],
  },
  "IV.Y.BA LLB": {
    note: "Optional Papers (Any one)",
    subjects: [
      "Criminology and Penology",
      "Bankruptcy Laws",
      "Human Rights Law",
    ],
  },
  "V.Y.BA LLB": {
    note: "Optional Papers (75:25 and 60:40 pattern)",
    subjects: [
      "Banking & Negotiable Instrument Act",
      "Law of Insurance",
      "Intellectual Property Law",
      "Conflict of Law",
      "Law Relating to Women & Children",
      "Law and Medicine",
    ],
  },
};

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.\n");

  const db = mongoose.connection.db;
  const batchesColl = db.collection("batches");
  const subjectsColl = db.collection("subjects");

  // ── 1. List ALL batches ──────────────────────────────────────────────
  const allBatches = await batchesColl
    .find({}, { projection: { batchName: 1, term: 1, "program.name": 1, subjects: 1 } })
    .toArray();

  console.log("=== ALL BATCHES IN DB ===");
  for (const b of allBatches) {
    console.log(`  [${b._id}] "${b.batchName}" | term=${b.term} | program=${b.program?.name} | subjects=${b.subjects?.length || 0}`);
  }
  console.log(`Total batches: ${allBatches.length}\n`);

  // ── 2. List ALL subjects with isElective=true ────────────────────────
  const allElectives = await subjectsColl
    .find({ isElective: true }, { projection: { subjectName: 1, subjectCode: 1, isElective: 1 } })
    .toArray();

  console.log("=== ALL ELECTIVE SUBJECTS IN DB (isElective=true) ===");
  for (const s of allElectives) {
    console.log(`  [${s._id}] "${s.subjectName}" (code: ${s.subjectCode})`);
  }
  console.log(`Total electives: ${allElectives.length}\n`);

  // ── 3. For each target batch, check its subjects ─────────────────────
  const targetBatchNames = Object.keys(EXPECTED);

  for (const batchKey of targetBatchNames) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`BATCH: "${batchKey}" — ${EXPECTED[batchKey].note}`);
    console.log("=".repeat(60));

    // Find matching batches (fuzzy: batch name contains the key)
    const matchingBatches = allBatches.filter((b) => {
      const name = (b.batchName || "").trim();
      // Try exact match first, then contains
      return name === batchKey || name.includes(batchKey);
    });

    if (matchingBatches.length === 0) {
      console.log(`  *** NO BATCH FOUND matching "${batchKey}" ***`);
      // Try partial match
      const partial = allBatches.filter((b) =>
        (b.batchName || "").toLowerCase().includes(batchKey.toLowerCase().replace(/\./g, ""))
      );
      if (partial.length > 0) {
        console.log(`  Partial matches:`);
        partial.forEach((p) => console.log(`    - "${p.batchName}"`));
      }
      continue;
    }

    for (const batch of matchingBatches) {
      console.log(`\n  Found batch: "${batch.batchName}" (id: ${batch._id})`);
      console.log(`  Program: ${batch.program?.name} | Term: ${batch.term}`);
      console.log(`  Subject IDs count: ${batch.subjects?.length || 0}`);

      if (!batch.subjects || batch.subjects.length === 0) {
        console.log("  *** NO SUBJECTS LINKED TO THIS BATCH ***");
        continue;
      }

      // Fetch full subject details for this batch
      const batchSubjects = await subjectsColl
        .find({ _id: { $in: batch.subjects } })
        .toArray();

      console.log(`\n  All subjects in this batch:`);
      for (const s of batchSubjects) {
        const electiveTag = s.isElective ? " [ELECTIVE]" : "";
        console.log(`    - "${s.subjectName}" (code: ${s.subjectCode})${electiveTag}`);
      }

      // Check which expected electives exist
      const batchSubjectNames = batchSubjects.map((s) => (s.subjectName || "").trim().toLowerCase());
      const batchElectiveNames = batchSubjects
        .filter((s) => s.isElective)
        .map((s) => (s.subjectName || "").trim().toLowerCase());

      console.log(`\n  Expected electives check:`);
      for (const expected of EXPECTED[batchKey].subjects) {
        const normalizedExpected = expected.trim().toLowerCase();

        // Check in batch subjects (any match)
        const foundInBatch = batchSubjectNames.some(
          (n) => n === normalizedExpected || n.includes(normalizedExpected) || normalizedExpected.includes(n)
        );
        // Check if marked as elective
        const foundAsElective = batchElectiveNames.some(
          (n) => n === normalizedExpected || n.includes(normalizedExpected) || normalizedExpected.includes(n)
        );

        let status;
        if (foundAsElective) {
          status = "EXISTS + MARKED ELECTIVE";
        } else if (foundInBatch) {
          status = "EXISTS but NOT marked elective";
        } else {
          status = "MISSING from batch";
        }
        console.log(`    "${expected}" => ${status}`);
      }
    }
  }

  // ── 4. Also dump all subjects (full list) for reference ──────────────
  const allSubjects = await subjectsColl
    .find({}, { projection: { subjectName: 1, subjectCode: 1, isElective: 1 } })
    .toArray();

  console.log(`\n\n=== FULL SUBJECT LIST (${allSubjects.length} total) ===`);
  for (const s of allSubjects) {
    const tag = s.isElective ? " [ELECTIVE]" : "";
    console.log(`  "${s.subjectName}" (code: ${s.subjectCode})${tag}`);
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
