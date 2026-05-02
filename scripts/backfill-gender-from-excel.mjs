import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'temp', 'student_data');

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('=== DRY RUN MODE (no writes) ===\n');

await mongoose.connect(process.env.MONGO_DB_URI.trim());
const db = mongoose.connection.db;
const students = db.collection('students');

// Step 1: Read all Roll No -> Gender from Excel files
const excelMap = new Map(); // rollNo -> gender
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.xlsx'));

for (const file of files) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(dataDir, file));
  const ws = wb.getWorksheet(1);

  const headers = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers.push({ col, value: String(cell.value || '').trim() });
  });

  const genderCol = headers.find(h => /^gender$/i.test(h.value));
  const rollCol = headers.find(h => /roll\s*no/i.test(h.value));
  if (!genderCol || !rollCol) continue;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const roll = String(row.getCell(rollCol.col).value || '').trim();
    const gender = String(row.getCell(genderCol.col).value || '').trim();
    if (roll && gender) excelMap.set(roll, gender);
  }
}

console.log('Excel: Total unique Roll No with gender:', excelMap.size);

// Step 2: Get all students missing gender from DB
const missingGender = await students.find({
  $or: [
    { 'studentDetails.gender': { $exists: false } },
    { 'studentDetails.gender': null },
    { 'studentDetails.gender': '' }
  ]
}).project({ 'academicDetails.rollNumber': 1, 'studentDetails.firstName': 1 }).toArray();

console.log('DB: Students missing gender:', missingGender.length);

// Step 3: Match and update
let updated = 0;
let notInExcel = [];
for (const s of missingGender) {
  const roll = s.academicDetails?.rollNumber;
  if (!roll) continue;
  const gender = excelMap.get(String(roll).trim());
  if (gender) {
    const normalized = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
    if (!DRY_RUN) {
      await students.updateOne({ _id: s._id }, { $set: { 'studentDetails.gender': normalized } });
    }
    updated++;
  } else {
    notInExcel.push({ roll, name: s.studentDetails?.firstName });
  }
}

console.log('\nUpdated from Excel:', updated);
console.log('Still missing (not in any Excel):', notInExcel.length);

if (notInExcel.length > 0 && notInExcel.length <= 50) {
  console.log('\nMissing roll numbers:');
  notInExcel.forEach(s => console.log('  Roll:', s.roll, '| Name:', s.name));
} else if (notInExcel.length > 50) {
  console.log('\nFirst 30 missing:');
  notInExcel.slice(0, 30).forEach(s => console.log('  Roll:', s.roll, '| Name:', s.name));
  console.log('  ... and', notInExcel.length - 30, 'more');
}

// Step 4: Check Excel roll numbers not in DB at all
const allDbRolls = new Set();
const allStudents = await students.find({}).project({ 'academicDetails.rollNumber': 1 }).toArray();
allStudents.forEach(s => { if (s.academicDetails?.rollNumber) allDbRolls.add(String(s.academicDetails.rollNumber).trim()); });

let excelNotInDb = 0;
const excelNotInDbSamples = [];
for (const [roll, gender] of excelMap) {
  if (!allDbRolls.has(roll)) {
    excelNotInDb++;
    if (excelNotInDbSamples.length < 10) excelNotInDbSamples.push(roll);
  }
}
console.log('\nExcel roll numbers NOT in DB:', excelNotInDb);
if (excelNotInDbSamples.length > 0) {
  console.log('  Samples:', excelNotInDbSamples.join(', '));
}

if (DRY_RUN) console.log('\nRe-run WITHOUT --dry-run to apply changes.');

await mongoose.disconnect();
