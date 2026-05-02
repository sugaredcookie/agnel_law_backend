import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
const uri = process.env.MONGO_DB_URI?.replace(/^"|"$/g, "").trim();
await mongoose.connect(uri);
const db = mongoose.connection.db;
const pr = db.collection("parsedresults");
const st = db.collection("students");
const norm = v => String(v ?? "").trim();
const prRolls = (await pr.distinct("rollNo")).map(norm).filter(Boolean);
const stRolls = (await st.distinct("academicDetails.rollNumber")).map(norm).filter(Boolean);
const stSet = new Set(stRolls);
const stDigits = new Map();
for (const sr of stRolls) {
  const d = sr.replace(/^[A-Za-z]+/, "");
  if (d && d !== sr) { if (!stDigits.has(d)) stDigits.set(d, []); stDigits.get(d).push(sr); }
}
const noMatch = prRolls.filter(r => {
  if (stSet.has(r)) return false;
  if (stDigits.has(r)) return false;
  const stripped = r.replace(/^[A-Za-z]+/, "");
  if (stripped !== r && stSet.has(stripped)) return false;
  return true;
});
console.log("Still unmatched (" + noMatch.length + "):");
noMatch.sort().forEach(r => console.log("  " + r));
await mongoose.disconnect();
