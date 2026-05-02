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

await mongoose.connect(process.env.MONGO_DB_URI.trim());
const db = mongoose.connection.db;
const students = db.collection('students');

// Read all Roll No -> Gender from Excel files
const excelMap = new Map();
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
  const nameCol = headers.find(h => /name on marksheet/i.test(h.value));
  const emailCol = headers.find(h => /^email$/i.test(h.value));
  const programCol = headers.find(h => /applied program/i.test(h.value));
  if (!rollCol) continue;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const roll = String(row.getCell(rollCol.col).value || '').trim();
    if (!roll) continue;
    excelMap.set(roll, {
      gender: genderCol ? String(row.getCell(genderCol.col).value || '').trim() : '',
      name: nameCol ? String(row.getCell(nameCol.col).value || '').trim() : '',
      email: emailCol ? String(row.getCell(emailCol.col).value || '').trim() : '',
      program: programCol ? String(row.getCell(programCol.col).value || '').trim() : '',
      file,
    });
  }
}

// Get all DB students
const allStudents = await students.find({}).project({
  'academicDetails.rollNumber': 1,
  'academicDetails.batch.name': 1,
  'academicDetails.program': 1,
  'studentDetails.firstName': 1,
  'studentDetails.middleName': 1,
  'studentDetails.lastName': 1,
  'studentDetails.gender': 1,
  'studentDetails.emailAddress': 1,
  status: 1,
}).toArray();

const dbRollSet = new Set();
allStudents.forEach(s => {
  if (s.academicDetails?.rollNumber) dbRollSet.add(String(s.academicDetails.rollNumber).trim());
});

// Build output workbook
const outWb = new ExcelJS.Workbook();

// Sheet 1: DB students still missing gender
const ws1 = outWb.addWorksheet('Missing Gender (DB)');
ws1.columns = [
  { header: 'Roll No', key: 'roll', width: 15 },
  { header: 'First Name', key: 'first', width: 20 },
  { header: 'Middle Name', key: 'middle', width: 20 },
  { header: 'Last Name', key: 'last', width: 20 },
  { header: 'Email', key: 'email', width: 30 },
  { header: 'Program', key: 'program', width: 20 },
  { header: 'Batch', key: 'batch', width: 20 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Gender (FILL THIS)', key: 'gender', width: 18 },
];

const missing = allStudents.filter(s => {
  const g = s.studentDetails?.gender;
  return !g || g.trim() === '';
});

missing.forEach(s => {
  ws1.addRow({
    roll: s.academicDetails?.rollNumber || '',
    first: s.studentDetails?.firstName || '',
    middle: s.studentDetails?.middleName || '',
    last: s.studentDetails?.lastName || '',
    email: s.studentDetails?.emailAddress || '',
    program: s.academicDetails?.program || '',
    batch: s.academicDetails?.batch?.name || '',
    status: s.status || '',
    gender: '',
  });
});

// Sheet 2: Excel roll numbers not in DB
const ws2 = outWb.addWorksheet('Excel Not In DB');
ws2.columns = [
  { header: 'Roll No', key: 'roll', width: 15 },
  { header: 'Name (Marksheet)', key: 'name', width: 35 },
  { header: 'Gender', key: 'gender', width: 12 },
  { header: 'Email', key: 'email', width: 30 },
  { header: 'Program', key: 'program', width: 25 },
  { header: 'Source File', key: 'file', width: 20 },
];

for (const [roll, data] of excelMap) {
  if (!dbRollSet.has(roll)) {
    ws2.addRow({ roll, name: data.name, gender: data.gender, email: data.email, program: data.program, file: data.file });
  }
}

// Style headers for both sheets
for (const ws of [ws1, ws2]) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5F99' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 22;
}

// Highlight gender column in sheet 1
const genderColIdx = 9;
for (let r = 2; r <= ws1.rowCount; r++) {
  ws1.getRow(r).getCell(genderColIdx).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' },
  };
}

const outPath = path.join(__dirname, '..', 'temp', 'gender-missing-report.xlsx');
await outWb.xlsx.writeFile(outPath);
console.log('Report saved to:', outPath);
console.log('Sheet 1 - Missing Gender (DB):', missing.length, 'students');
console.log('Sheet 2 - Excel Not In DB:', [...excelMap.keys()].filter(r => !dbRollSet.has(r)).length, 'roll numbers');

await mongoose.disconnect();
