import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'temp', 'student_data');

const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.xlsx'));

for (const file of files) {
  const filePath = path.join(dataDir, file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(1);

  // Read headers from row 1
  const headers = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers.push({ col, value: String(cell.value || '').trim() });
  });

  const genderCol = headers.find(h => /^gender$/i.test(h.value));
  const rollCol = headers.find(h => /roll\s*no/i.test(h.value));

  const totalRows = ws.rowCount - 1; // exclude header
  let withGender = 0;
  let withoutGender = 0;

  if (genderCol) {
    for (let r = 2; r <= ws.rowCount; r++) {
      const val = ws.getRow(r).getCell(genderCol.col).value;
      if (val && String(val).trim() !== '') withGender++;
      else withoutGender++;
    }
  }

  console.log(`\n=== ${file} ===`);
  console.log('  Headers:', headers.map(h => h.value).join(' | '));
  console.log('  Roll No column:', rollCol ? `YES (col ${rollCol.col}, "${rollCol.value}")` : 'NOT FOUND');
  console.log('  Gender column:', genderCol ? `YES (col ${genderCol.col}, "${genderCol.value}")` : 'NOT FOUND');
  if (genderCol) {
    console.log(`  With gender: ${withGender} | Without: ${withoutGender} | Total: ${totalRows}`);
  }
}
