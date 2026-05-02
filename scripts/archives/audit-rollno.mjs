import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const uri = process.env.MONGO_DB_URI?.replace(/^"|"$/g, "").trim();
await mongoose.connect(uri);
const db = mongoose.connection.db;

const parsedResults = db.collection("parsedresults");
const students = db.collection("students");

// 1. Get all distinct rollNos from ParsedResult
const prRollNos = await parsedResults.distinct("rollNo");
console.log(`\n=== ParsedResult distinct rollNos: ${prRollNos.length} ===`);

// 2. Get all distinct academicDetails.rollNumber from Students
const stRollNos = await students.distinct("academicDetails.rollNumber");
console.log(`Student distinct rollNumbers: ${stRollNos.length}`);

// 3. Normalize all for comparison
const normalize = (v) => String(v ?? "").trim();
const prSet = new Set(prRollNos.map(normalize).filter(Boolean));
const stSet = new Set(stRollNos.map(normalize).filter(Boolean));

// 4. In ParsedResult but NOT in Student
const inPRnotST = [...prSet].filter(r => !stSet.has(r));
console.log(`\n--- In ParsedResult but NOT in Student DB: ${inPRnotST.length} ---`);
if (inPRnotST.length <= 50) {
  inPRnotST.sort().forEach(r => console.log(`  ${r}`));
} else {
  inPRnotST.sort().slice(0, 30).forEach(r => console.log(`  ${r}`));
  console.log(`  ... and ${inPRnotST.length - 30} more`);
}

// 5. In Student but NOT in ParsedResult
const inSTnotPR = [...stSet].filter(r => !prSet.has(r));
console.log(`\n--- In Student DB but NOT in ParsedResult: ${inSTnotPR.length} ---`);
if (inSTnotPR.length <= 50) {
  inSTnotPR.sort().forEach(r => console.log(`  ${r}`));
} else {
  inSTnotPR.sort().slice(0, 30).forEach(r => console.log(`  ${r}`));
  console.log(`  ... and ${inSTnotPR.length - 30} more`);
}

// 6. Check for casing/whitespace mismatches
const prOrigMap = new Map();
for (const r of prRollNos) {
  const norm = normalize(r);
  if (!prOrigMap.has(norm)) prOrigMap.set(norm, []);
  prOrigMap.get(norm).push(r);
}
const stOrigMap = new Map();
for (const r of stRollNos) {
  const norm = normalize(r);
  if (!stOrigMap.has(norm)) stOrigMap.set(norm, []);
  stOrigMap.get(norm).push(r);
}

// Check for case-insensitive matches that aren't exact
const prLower = new Map();
for (const r of prSet) prLower.set(r.toLowerCase(), r);
const stLower = new Map();
for (const r of stSet) stLower.set(r.toLowerCase(), r);

let caseMismatches = 0;
for (const [low, prVal] of prLower) {
  const stVal = stLower.get(low);
  if (stVal && stVal !== prVal) {
    if (caseMismatches < 20) console.log(`  Case mismatch: PR="${prVal}" vs ST="${stVal}"`);
    caseMismatches++;
  }
}
console.log(`\n--- Case/whitespace mismatches: ${caseMismatches} ---`);

// 7. Check types stored in DB
const typeSample = await parsedResults.aggregate([
  { $group: { _id: { $type: "$rollNo" }, count: { $sum: 1 } } }
]).toArray();
console.log(`\n--- ParsedResult rollNo BSON types ---`);
typeSample.forEach(t => console.log(`  ${t._id}: ${t.count}`));

const stTypeSample = await students.aggregate([
  { $group: { _id: { $type: "$academicDetails.rollNumber" }, count: { $sum: 1 } } }
]).toArray();
console.log(`\n--- Student rollNumber BSON types ---`);
stTypeSample.forEach(t => console.log(`  ${t._id}: ${t.count}`));

// 8. Check numeric-looking rollNos stored as numbers vs strings
const numericPR = await parsedResults.find({ rollNo: { $type: "number" } }).limit(10).toArray();
if (numericPR.length) {
  console.log(`\n--- ParsedResult rollNos stored as NUMBER type (first 10): ---`);
  numericPR.forEach(r => console.log(`  rollNo=${r.rollNo} (typeof ${typeof r.rollNo}), name=${r.name}`));
}

const numericST = await students.find({ "academicDetails.rollNumber": { $type: "number" } }).limit(10).toArray();
if (numericST.length) {
  console.log(`\n--- Student rollNumbers stored as NUMBER type (first 10): ---`);
  numericST.forEach(r => console.log(`  rollNumber=${r.academicDetails?.rollNumber}, name=${r.studentDetails?.firstName} ${r.studentDetails?.lastName}`));
}

// 9. Sample matched rollNos to show format patterns
const matched = [...prSet].filter(r => stSet.has(r));
console.log(`\n--- Matched rollNos: ${matched.length} out of ${prSet.size} ParsedResult rollNos ---`);
console.log(`Sample matched (first 10): ${matched.sort().slice(0, 10).join(", ")}`);

// 10. Sample unmatched to understand patterns
if (inPRnotST.length > 0) {
  console.log(`\nSample unmatched PR rollNos (first 10): ${inPRnotST.sort().slice(0, 10).join(", ")}`);
}

// 11. QR token info - check how many parsed results have been served via PDF
console.log(`\n=== QR Code Impact Summary ===`);
console.log(`QR tokens encode: { c: configId, r: rollNo, s: hmacSig }`);
console.log(`Token is HMAC(configId|rollNo) — changing rollNo would invalidate ALL existing QR codes for that student`);
console.log(`Total ParsedResult documents: ${await parsedResults.countDocuments()}`);

await mongoose.disconnect();
console.log("\nDone.");
