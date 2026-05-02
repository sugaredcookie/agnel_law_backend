// Extract only header/label columns from each sheet (skip data rows, school name rows)
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

function isHeaderCell(val) {
  if (val == null) return false;
  const s = String(val).trim();
  if (s.length === 0) return false;
  // Skip pure numbers, formulas, school name
  if (/^\d+(\.\d+)?$/.test(s)) return false;
  if (s.startsWith("{")) return false;
  if (/agnel school/i.test(s)) return false;
  if (/exam marks for/i.test(s)) return false;
  if (/^(FY|SY|TY)\s/i.test(s) && s.length > 15) return false;
  // Skip pure score patterns like "29+1", "26+4", "Pass", "Fail"
  if (/^\d+\s*\+\s*\d+$/.test(s)) return false;
  if (/^(pass|fail|done|reval|atkt)$/i.test(s)) return false;
  // Skip long PRN-like numbers
  if (/^\d{10,}$/.test(s)) return false;
  return true;
}

(async () => {
  const dir = path.join(__dirname, "..", "uploads/excel");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".xlsx") || f.endsWith(".xls"));

  console.log("=== EXCEL COLUMN HEADERS ANALYSIS ===\n");

  const allFileData = [];

  for (const file of files) {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(path.join(dir, file));

      console.log("=".repeat(60));
      console.log("FILE:", file);
      console.log("Sheets:", wb.worksheets.map(s => s.name).join(", "));

      const fileSheets = [];

      for (const ws of wb.worksheets) {
        // Collect all unique header labels and their column positions
        const colHeaders = {};  // col number -> header label
        const scanRows = Math.min(ws.rowCount, 10);

        for (let r = 1; r <= scanRows; r++) {
          const row = ws.getRow(r);
          for (let c = 1; c <= 30; c++) {
            const cell = row.getCell(c);
            if (cell.value == null) continue;
            const raw = typeof cell.value === "object" ? "" : String(cell.value).trim();
            if (!isHeaderCell(raw)) continue;
            // Only keep first occurrence per column
            if (!colHeaders[c]) {
              colHeaders[c] = { label: raw, row: r };
            }
          }
        }

        // Build ordered list
        const cols = Object.keys(colHeaders).map(Number).sort((a, b) => a - b);
        const headerList = cols.map(c => "C" + c + "=" + colHeaders[c].label + " (R" + colHeaders[c].row + ")");

        // Detect key columns
        const hasName = cols.some(c => /\bname\b/i.test(colHeaders[c].label));
        const hasGR = cols.some(c => /\bgr\b/i.test(colHeaders[c].label));
        const hasPRN = cols.some(c => /\bprn\b|\bp\.?r\.?n/i.test(colHeaders[c].label));
        const hasRollNo = cols.some(c => /roll\s*no/i.test(colHeaders[c].label));
        const hasSeatNo = cols.some(c => /seat\s*no/i.test(colHeaders[c].label) || /examseatno/i.test(colHeaders[c].label));
        const hasStudentId = cols.some(c => /student\s*id/i.test(colHeaders[c].label));
        const hasPNR = cols.some(c => /\bpnr\b/i.test(colHeaders[c].label));

        console.log("\n  Sheet: \"" + ws.name + "\" (" + ws.rowCount + " rows)");
        console.log("    Headers: " + headerList.join(" | "));
        console.log("    --> Name:" + (hasName?"YES":"NO") +
          " GR:" + (hasGR?"YES":"NO") +
          " PRN:" + (hasPRN?"YES":"NO") +
          " PNR:" + (hasPNR?"YES":"NO") +
          " RollNo:" + (hasRollNo?"YES":"NO") +
          " SeatNo:" + (hasSeatNo?"YES":"NO") +
          " StudentId:" + (hasStudentId?"YES":"NO"));

        fileSheets.push({ sheet: ws.name, hasName, hasGR, hasPRN, hasPNR, hasRollNo, hasSeatNo, hasStudentId });
      }

      allFileData.push({ file, sheets: fileSheets });
      console.log("");
    } catch (err) {
      console.log("ERROR reading", file, err.message);
    }
  }

  // Summary table
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY TABLE");
  console.log("=".repeat(60));
  console.log("File | Sheet | Name | GR | PRN | PNR | RollNo | SeatNo | StudentId");
  console.log("-".repeat(60));
  for (const f of allFileData) {
    for (const s of f.sheets) {
      const yn = v => v ? "Y" : "-";
      console.log(f.file + " | " + s.sheet + " | " +
        yn(s.hasName) + " | " + yn(s.hasGR) + " | " + yn(s.hasPRN) + " | " +
        yn(s.hasPNR) + " | " + yn(s.hasRollNo) + " | " + yn(s.hasSeatNo) + " | " +
        yn(s.hasStudentId));
    }
  }
})();
