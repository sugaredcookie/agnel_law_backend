const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

const DIR = path.join(__dirname, "..", "uploads", "excel");

function cellVal(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  const v = cell.value;
  if (typeof v === "object" && v !== null) {
    if (v.result !== undefined) return v.result;
    if (v.richText) return v.richText.map((r) => r.text).join("");
  }
  return v;
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".xlsx"));

  // Find "E" suffix (without X): "45E", "40E"
  const eSuffix = [];
  // Find all ATKT header row 2 text (exam session info)
  const atktHeaders = [];
  // Find min marks row with EX
  const minRowEX = [];
  // Track all ATKT total column patterns
  const atktTotalPatterns = new Set();

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DIR, file));

    for (const ws of wb.worksheets) {
      const lName = ws.name.toLowerCase();
      if (lName === "raw" || lName === "copy" || lName === "grace" || lName.includes("instructions") || lName.includes("transfer") || lName.includes("trasnfer")) continue;

      let type = "regular";
      if (lName.includes("reval")) type = "reval";
      else if (lName.includes("atkt")) type = "atkt";

      // Check ATKT header rows
      if (type === "atkt") {
        for (let r = 1; r <= 6; r++) {
          const row = ws.getRow(r);
          for (let c = 1; c <= 30; c++) {
            const v = cellVal(row.getCell(c));
            if (v && String(v).length > 10) {
              atktHeaders.push({ value: String(v).trim().substring(0, 100), row: r, sheet: ws.name, file });
            }
          }
        }
      }

      // Check rows 5-6 for EX in min/max marks
      for (let r = 4; r <= 8; r++) {
        const row = ws.getRow(r);
        for (let c = 1; c <= 30; c++) {
          const v = cellVal(row.getCell(c));
          if (v && /\d+\s*ex$/i.test(String(v).trim())) {
            minRowEX.push({ value: String(v).trim(), row: r, col: c, sheet: ws.name, file, type });
          }
        }
      }

      const maxRow = Math.min(ws.rowCount, 300);
      for (let r = 7; r <= maxRow; r++) {
        const row = ws.getRow(r);
        for (let c = 1; c <= 30; c++) {
          const raw = cellVal(row.getCell(c));
          if (raw === null || raw === undefined) continue;
          const s = String(raw).trim();

          // "E" suffix without X: "45E", "40E", "42E"
          if (/^\d+\s*[eE]$/.test(s)) {
            eSuffix.push({ value: s, type, sheet: ws.name, file, row: r, col: c });
          }

          // In Total columns of ATKT sheets, look for EX values
          if (type === "atkt" && /\d/.test(s) && /[a-zA-Z]/.test(s) && s.length < 12) {
            atktTotalPatterns.add(s);
          }
        }
      }
    }
  }

  console.log("=" .repeat(70));
  console.log("REPORT A: 'E' suffix (without X) -- e.g. '45E'");
  console.log("=" .repeat(70));
  console.log(`Found ${eSuffix.length} cells`);
  const eByType = { regular: 0, reval: 0, atkt: 0 };
  for (const e of eSuffix) eByType[e.type]++;
  console.log(`  Regular: ${eByType.regular}, Reval: ${eByType.reval}, ATKT: ${eByType.atkt}`);
  console.log("Unique:", [...new Set(eSuffix.map((e) => e.value))].sort().join(", "));
  for (const e of eSuffix.slice(0, 10)) {
    console.log(`  "${e.value}" in ${e.type}/${e.sheet} (${e.file}) row ${e.row}, col ${e.col}`);
  }

  console.log("\n" + "=" .repeat(70));
  console.log("REPORT B: EX in header/min-max rows (rows 4-8)");
  console.log("=" .repeat(70));
  console.log(`Found ${minRowEX.length} cells`);
  for (const m of minRowEX) {
    console.log(`  "${m.value}" at row ${m.row}, col ${m.col} in ${m.type}/${m.sheet} (${m.file})`);
  }

  console.log("\n" + "=" .repeat(70));
  console.log("REPORT C: ATKT sheet header rows (Row 1-2 exam session info)");
  console.log("=" .repeat(70));
  const seen = new Set();
  for (const h of atktHeaders) {
    const key = `${h.file}|${h.sheet}|${h.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  [${h.file} / ${h.sheet}] R${h.row}: "${h.value}"`);
  }

  console.log("\n" + "=" .repeat(70));
  console.log("REPORT D: All alphanumeric mark patterns in ATKT data");
  console.log("=" .repeat(70));
  const sorted = [...atktTotalPatterns].sort();
  for (const p of sorted.slice(0, 80)) {
    console.log(`  ${p}`);
  }
  console.log(`Total unique: ${sorted.length}`);
}

main().catch(console.error);
