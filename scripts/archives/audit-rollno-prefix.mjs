import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const uri = process.env.MONGO_DB_URI?.replace(/^"|"$/g, "").trim();
await mongoose.connect(uri);
const db = mongoose.connection.db;

const parsedResults = db.collection("parsedresults");
const students = db.collection("students");

const normalize = (v) => String(v ?? "").trim();

// Get all distinct values
const prRollNos = (await parsedResults.distinct("rollNo")).map(normalize).filter(Boolean);
const stRollNos = (await students.distinct("academicDetails.rollNumber")).map(normalize).filter(Boolean);

const stSet = new Set(stRollNos);

// Build reverse map: strip prefix from student rollNo -> original student rollNo
const stDigitsMap = new Map(); // "23301" -> "A23301"
for (const sr of stRollNos) {
  const digits = sr.replace(/^[A-Za-z]+/, "");
  if (digits && digits !== sr) {
    if (!stDigitsMap.has(digits)) stDigitsMap.set(digits, []);
    stDigitsMap.get(digits).push(sr);
  }
}

// Also build student endsWith map for suffix matching
const stSuffixMap = new Map(); // last N digits -> student roll numbers ending with those
for (const sr of stRollNos) {
  // Try last 5 and last 4 digits as suffixes
  for (const len of [5, 4, 3]) {
    if (sr.length > len) {
      const suffix = sr.slice(-len);
      if (!stSuffixMap.has(suffix)) stSuffixMap.set(suffix, []);
      stSuffixMap.get(suffix).push(sr);
    }
  }
}

// For each unmatched PR rollNo, try prefix matching
const unmatched = prRollNos.filter(r => !stSet.has(r));
console.log(`\nTotal unmatched PR rollNos: ${unmatched.length}`);

let prefixMatched = 0;
let suffixMatched = 0;
let stillUnmatched = 0;
const prefixResults = [];
const suffixResults = [];
const noMatch = [];

for (const prRoll of unmatched) {
  // Case 1: PR has "23301", Student has "A23301" (student has prefix)
  const candidates = stDigitsMap.get(prRoll);
  if (candidates?.length) {
    prefixMatched++;
    prefixResults.push({ pr: prRoll, st: candidates });
    continue;
  }

  // Case 2: PR has "A23301", Student has "23301" (PR has prefix, unlikely but check)
  const prDigits = prRoll.replace(/^[A-Za-z]+/, "");
  if (prDigits !== prRoll && stSet.has(prDigits)) {
    prefixMatched++;
    prefixResults.push({ pr: prRoll, st: [prDigits] });
    continue;
  }

  // Case 3: suffix/contains matching
  const suffCandidates = stSuffixMap.get(prRoll);
  if (suffCandidates?.length) {
    suffixMatched++;
    suffixResults.push({ pr: prRoll, st: suffCandidates });
    continue;
  }

  stillUnmatched++;
  noMatch.push(prRoll);
}

console.log(`\n=== PREFIX MATCH RESULTS ===`);
console.log(`Prefix matched: ${prefixMatched}`);
console.log(`Suffix matched: ${suffixMatched}`);
console.log(`Still unmatched: ${stillUnmatched}`);

if (prefixResults.length > 0) {
  console.log(`\n--- Prefix matches (PR -> Student DB) ---`);
  prefixResults.slice(0, 40).forEach(m => 
    console.log(`  PR: "${m.pr}" -> Student: "${m.st.join('", "')}"`)
  );
  if (prefixResults.length > 40) console.log(`  ... and ${prefixResults.length - 40} more`);
}

if (suffixResults.length > 0) {
  console.log(`\n--- Suffix matches ---`);
  suffixResults.slice(0, 20).forEach(m => 
    console.log(`  PR: "${m.pr}" -> Student: "${m.st.join('", "')}"`)
  );
}

if (noMatch.length > 0) {
  console.log(`\n--- Still no match at all ---`);
  noMatch.sort().slice(0, 30).forEach(r => console.log(`  ${r}`));
  if (noMatch.length > 30) console.log(`  ... and ${noMatch.length - 30} more`);
}

// Show the actual prefix letters used
const prefixLetters = new Map();
for (const m of prefixResults) {
  for (const sr of m.st) {
    const prefix = sr.replace(/\d+$/, "");
    if (prefix) {
      prefixLetters.set(prefix, (prefixLetters.get(prefix) || 0) + 1);
    }
  }
}
if (prefixLetters.size > 0) {
  console.log(`\n--- Prefix letters used in Student DB ---`);
  for (const [p, c] of [...prefixLetters].sort((a,b) => b[1] - a[1])) {
    console.log(`  "${p}" : ${c} students`);
  }
}

// Also check: do enrichFromStudentDB queries actually use prefix-aware matching?
console.log(`\n=== enrichFromStudentDB Impact ===`);
console.log(`enrichFromStudentDB uses EXACT match: academicDetails.rollNumber: { $in: rollNos }`);
console.log(`So ${prefixMatched} students will FAIL to enrich (PRN/GR not pulled from Student DB)`);

await mongoose.disconnect();
console.log("\nDone.");
