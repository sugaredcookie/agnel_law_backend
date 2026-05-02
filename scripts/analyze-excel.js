import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = [
  "FY LLB SEM 1.xlsx",
  "FY LLB SEM 1 and Reval to be Printed (1).xlsx",
  "TY LLB (FY LLB SEM 2).xlsx",
  "TY LLB (SYLLB SEM 3.xlsx",
];

function getCellValue(row, col) {
  const cell = row.getCell(col);
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null) {
    if (v.result !== undefined) return v.result;
    if (v.richText) return v.richText.map(r => r.text).join("");
    if (v.formula) return `[FORMULA: ${v.formula}]`;
  }
  return v;
}

async function analyzeFile(filename) {
  const filePath = path.join(__dirname, "..", "uploads", "excel", filename);
  console.log("\n" + "=".repeat(100));
  console.log(`FILE: ${filename}`);
  console.log("=".repeat(100));

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(filePath);
  } catch (e) {
    console.log(`  ERROR reading file: ${e.message}`);
    return;
  }

  console.log(`  Total Sheets: ${wb.worksheets.length}`);
  console.log(`  Sheet Names: ${wb.worksheets.map(s => `"${s.name}"`).join(", ")}`);

  for (const ws of wb.worksheets) {
    console.log("\n" + "-".repeat(80));
    console.log(`  SHEET: "${ws.name}"  |  Rows: ${ws.rowCount}  |  Columns: ${ws.columnCount}`);
    console.log("-".repeat(80));

    // Print first 8 rows to understand header structure
    console.log("\n  --- HEADER ROWS (1-8) ---");
    for (let r = 1; r <= Math.min(8, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const cells = [];
      for (let c = 1; c <= Math.min(25, ws.columnCount); c++) {
        const val = getCellValue(row, c);
        if (val !== null && val !== undefined) {
          cells.push(`[C${c}]=${val}`);
        }
      }
      if (cells.length > 0) {
        console.log(`    Row ${r}: ${cells.join(" | ")}`);
      }
    }

    // Find data rows - look for rows with roll numbers
    console.log("\n  --- FIRST 5 DATA ROWS (starting from row 7) ---");
    let dataCount = 0;
    for (let r = 5; r <= Math.min(ws.rowCount, 30); r++) {
      const row = ws.getRow(r);
      const cells = [];
      let hasData = false;
      for (let c = 1; c <= Math.min(25, ws.columnCount); c++) {
        const val = getCellValue(row, c);
        cells.push(val !== null && val !== undefined ? String(val) : "");
        if (val !== null && val !== undefined && String(val).trim() !== "") hasData = true;
      }
      if (hasData && dataCount < 5) {
        // Check if it looks like a data row (col 2 or 3 has something that looks like a name)
        const col2 = cells[1];
        const col3 = cells[2];
        if (col2 && col2.length > 3 && /[a-zA-Z]/.test(col2)) {
          console.log(`    Row ${r}: ${cells.map((c, i) => c ? `[C${i+1}]=${c}` : "").filter(Boolean).join(" | ")}`);
          dataCount++;
        } else if (r <= 8) {
          // Still header area, print anyway
        }
      }
    }

    // Check last few rows with data
    console.log("\n  --- LAST 3 DATA ROWS ---");
    let lastDataRows = [];
    for (let r = ws.rowCount; r >= Math.max(1, ws.rowCount - 20); r--) {
      const row = ws.getRow(r);
      let hasData = false;
      const cells = [];
      for (let c = 1; c <= Math.min(25, ws.columnCount); c++) {
        const val = getCellValue(row, c);
        cells.push(val !== null && val !== undefined ? String(val) : "");
        if (val !== null && val !== undefined && String(val).trim() !== "") hasData = true;
      }
      if (hasData && lastDataRows.length < 3) {
        lastDataRows.unshift({ row: r, cells });
      }
    }
    for (const d of lastDataRows) {
      console.log(`    Row ${d.row}: ${d.cells.map((c, i) => c ? `[C${i+1}]=${c}` : "").filter(Boolean).join(" | ")}`);
    }

    // Column analysis - check what's in header rows 4-6 for subject mapping
    console.log("\n  --- COLUMN HEADERS (rows 4-6 merged) ---");
    for (let c = 1; c <= Math.min(25, ws.columnCount); c++) {
      const vals = [];
      for (let r = 3; r <= 6; r++) {
        const val = getCellValue(ws.getRow(r), c);
        if (val !== null && val !== undefined) vals.push(`R${r}:${val}`);
      }
      if (vals.length > 0) {
        console.log(`    Col ${c}: ${vals.join(" | ")}`);
      }
    }

    // Check for merged cells patterns
    console.log("\n  --- TOTAL DATA ROWS (approx) ---");
    let totalDataRows = 0;
    for (let r = 7; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = getCellValue(row, 2);
      if (name && String(name).trim().length > 2 && /[a-zA-Z]/.test(String(name))) {
        totalDataRows++;
      }
    }
    console.log(`    ~${totalDataRows} student rows detected`);
  }
}

async function main() {
  for (const file of files) {
    await analyzeFile(file);
  }
}

main().catch(console.error);
