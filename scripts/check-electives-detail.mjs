/**
 * Detailed per-batch elective verification.
 * Maps user-facing batch names to actual DB batch names and checks subject linkage.
 * Run: node scripts/check-electives-detail.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_DB_URI;

// Map: user-facing name -> actual DB batch names
const BATCH_MAP = {
  "S.Y.LL.B.": {
    dbNames: ["SYLLB-A", "SYLLB-B"],
    note: "Optional Papers (Any one)",
    expectedElectives: [
      "Criminology and Penology",
      "Bankruptcy Laws",
      "Human Rights Law",
    ],
  },
  "T.Y.LL.B.": {
    dbNames: ["TYLLB-A", "TYLLB-B"],
    note: "Optional Papers (Any two)",
    expectedElectives: [
      "Intellectual Property Laws",
      "Law of Banking and Negotiable Instruments",
      "Law and Medicine",
      "Law relating to Women and Children",
      "Law of Insurance",
      "Conflicts of Law",
    ],
  },
  "IV.Y.BA LLB": {
    dbNames: ["IVBA-LLB-A", "IVBA-LLB-B"],
    note: "Optional Papers (Any one)",
    expectedElectives: [
      "Criminology and Penology",
      "Bankruptcy Laws",
      "Human Rights Law",
    ],
  },
  "V.Y.BA LLB": {
    dbNames: ["VBA-LLB-A", "VBA-LLB-B"],
    note: "Optional Papers (75:25 and 60:40 pattern)",
    expectedElectives: [
      "Banking & Negotiable Instrument Act",
      "Law of Insurance",
      "Intellectual Property Law",
      "Conflict of Law",
      "Law Relating to Women & Children",
      "Law and Medicine",
    ],
  },
};

function normalize(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function fuzzyMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return "exact";
  // Strip trailing SEM info for comparison
  const naStem = na.replace(/\s+(sem|tyllb|syllb|fyllb|s\.y\.|t\.y\.).*$/i, "").trim();
  const nbStem = nb.replace(/\s+(sem|tyllb|syllb|fyllb|s\.y\.|t\.y\.).*$/i, "").trim();
  if (naStem === nbStem) return "stem";
  if (na.includes(nb) || nb.includes(na)) return "contains";
  if (naStem.includes(nbStem) || nbStem.includes(naStem)) return "stem-contains";
  return null;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const batchesColl = db.collection("batches");
  const subjectsColl = db.collection("subjects");

  const results = {};

  for (const [label, config] of Object.entries(BATCH_MAP)) {
    console.log(`\n${"#".repeat(70)}`);
    console.log(`# ${label} — ${config.note}`);
    console.log(`${"#".repeat(70)}`);

    results[label] = { batches: [] };

    for (const dbName of config.dbNames) {
      const batch = await batchesColl.findOne({ batchName: dbName });
      if (!batch) {
        console.log(`\n  Batch "${dbName}": NOT FOUND`);
        continue;
      }

      console.log(`\n  Batch "${dbName}" (${batch._id}) — ${batch.subjects?.length || 0} subjects linked`);

      const batchSubjects = batch.subjects?.length
        ? await subjectsColl.find({ _id: { $in: batch.subjects } }).toArray()
        : [];

      const electivesInBatch = batchSubjects.filter((s) => s.isElective);
      const coreInBatch = batchSubjects.filter((s) => !s.isElective);

      console.log(`  Core subjects (${coreInBatch.length}):`);
      for (const s of coreInBatch) {
        console.log(`    - "${s.subjectName}" (${s.subjectCode})`);
      }

      console.log(`  Elective subjects (${electivesInBatch.length}):`);
      for (const s of electivesInBatch) {
        console.log(`    - "${s.subjectName}" (${s.subjectCode})`);
      }

      // Check expected vs actual
      console.log(`\n  --- Expected Elective Verification ---`);
      const batchResult = { name: dbName, found: [], missing: [], wrongFlag: [] };

      for (const expected of config.expectedElectives) {
        let bestMatch = null;
        let bestType = null;

        for (const s of batchSubjects) {
          const matchType = fuzzyMatch(expected, s.subjectName);
          if (matchType) {
            if (!bestType || ["exact", "stem", "contains", "stem-contains"].indexOf(matchType) <
              ["exact", "stem", "contains", "stem-contains"].indexOf(bestType)) {
              bestMatch = s;
              bestType = matchType;
            }
          }
        }

        if (bestMatch) {
          if (bestMatch.isElective) {
            console.log(`  OK: "${expected}" => matched "${bestMatch.subjectName}" [isElective=true] (${bestType})`);
            batchResult.found.push({ expected, actual: bestMatch.subjectName, id: bestMatch._id });
          } else {
            console.log(`  WARNING: "${expected}" => matched "${bestMatch.subjectName}" but isElective=FALSE (${bestType})`);
            batchResult.wrongFlag.push({ expected, actual: bestMatch.subjectName, id: bestMatch._id });
          }
        } else {
          // Check if it exists globally but not in this batch
          const globalMatch = await subjectsColl.findOne({
            $or: [
              { subjectName: { $regex: expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
            ],
          });

          if (globalMatch) {
            console.log(`  MISSING FROM BATCH: "${expected}" => exists globally as "${globalMatch.subjectName}" (${globalMatch._id}) but NOT linked to this batch`);
            batchResult.missing.push({ expected, globalId: globalMatch._id, globalName: globalMatch.subjectName, reason: "not-linked" });
          } else {
            console.log(`  NOT FOUND: "${expected}" => does not exist in DB at all`);
            batchResult.missing.push({ expected, reason: "not-in-db" });
          }
        }
      }

      results[label].batches.push(batchResult);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log(`\n\n${"=".repeat(70)}`);
  console.log("SUMMARY");
  console.log("=".repeat(70));

  for (const [label, data] of Object.entries(results)) {
    console.log(`\n${label}:`);
    for (const b of data.batches) {
      const total = BATCH_MAP[label].expectedElectives.length;
      console.log(`  ${b.name}: ${b.found.length}/${total} OK | ${b.wrongFlag.length} wrong flag | ${b.missing.length} missing`);
      if (b.wrongFlag.length > 0) {
        for (const w of b.wrongFlag) {
          console.log(`    FIX NEEDED: "${w.actual}" (${w.id}) => set isElective=true`);
        }
      }
      if (b.missing.length > 0) {
        for (const m of b.missing) {
          if (m.reason === "not-linked") {
            console.log(`    LINK NEEDED: "${m.globalName}" (${m.globalId}) => add to batch subjects`);
          } else {
            console.log(`    CREATE NEEDED: "${m.expected}" => subject does not exist`);
          }
        }
      }
    }
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
