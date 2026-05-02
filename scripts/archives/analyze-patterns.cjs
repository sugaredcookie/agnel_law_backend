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
  const exPatterns = new Set();
  const plusPatterns = new Set();
  const otherPatterns = new Set();
  const remarkValues = { regular: {}, reval: {}, atkt: {} };

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DIR, file));
    for (const ws of wb.worksheets) {
      const lName = ws.name.toLowerCase();
      if (lName === "raw" || lName === "copy" || lName === "grace" || lName.includes("instructions") || lName.includes("transfer") || lName.includes("trasnfer")) continue;

      let type = "regular";
      if (lName.includes("reval")) type = "reval";
      else if (lName.includes("atkt")) type = "atkt";

      const maxRow = Math.min(ws.rowCount, 300);
      for (let r = 5; r <= maxRow; r++) {
        for (let c = 1; c <= 30; c++) {
          const raw = cellVal(ws.getRow(r).getCell(c));
          if (raw === null || raw === undefined) continue;
          const s = String(raw).trim();
          if (!s) continue;

          // EX suffix: "59 EX", "49EX", "56Ex"
          if (/\d+\s*ex$/i.test(s)) {
            exPatterns.add(s);
          }
          // Grace marks: "25+5", "26+4", "21 +", "18+"
          if (/\d+\s*\+/.test(s)) {
            plusPatterns.add(s);
          }
          // Non-numeric, non-standard in data rows
          if (r >= 7 && /[a-zA-Z]/.test(s) && s.length < 20) {
            const lower = s.toLowerCase();
            if (
              !/^\d+$/.test(s) &&
              !/(name|roll|seat|student|exam|internal|external|total|grand|credit|semester|assessment|remarks?|prn|pnr|gr|cp|gp|sgpa|sgp|cg|cgp|sr|max|min)/i.test(s) &&
              !/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(s) // skip names
            ) {
              if (!["ab", "rr", "(ab)", "(rr)", "absent", "pass", "fail", "p", "f"].includes(lower)) {
                otherPatterns.add(`${s}  [${type}/${ws.name} in ${file}]`);
              }
            }
          }
        }
      }
    }
  }

  console.log("=== EX SUFFIX patterns (exempted/carried-forward marks) ===");
  const exArr = [...exPatterns].sort();
  exArr.forEach((p) => console.log("  " + p));
  console.log("Total unique:", exPatterns.size);

  console.log("\n=== GRACE MARKS (+) patterns ===");
  const plusArr = [...plusPatterns].sort();
  plusArr.forEach((p) => console.log("  " + p));
  console.log("Total unique:", plusPatterns.size);

  console.log("\n=== OTHER unusual cell values (non-numeric, non-standard) ===");
  const otherArr = [...otherPatterns].sort();
  otherArr.forEach((p) => console.log("  " + p));
  console.log("Total unique:", otherPatterns.size);
}

main().catch(console.error);
