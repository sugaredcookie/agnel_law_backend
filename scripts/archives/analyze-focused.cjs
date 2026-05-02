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
  const exValues = [];
  const graceValues = [];
  const remarkSet = { regular: new Set(), reval: new Set(), atkt: new Set() };
  const specialMarks = [];

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

      for (let r = 7; r <= maxRow; r++) {
        const row = ws.getRow(r);
        for (let c = 1; c <= 30; c++) {
          const raw = cellVal(row.getCell(c));
          if (raw === null || raw === undefined) continue;
          const s = String(raw).trim();
          if (!s) continue;

          // EX suffix: "59 EX", "49EX", "56Ex", "40 EX", "51 EX"
          if (/^\d+\s*ex$/i.test(s)) {
            exValues.push({ value: s, type, sheet: ws.name, file, row: r, col: c });
          }

          // Grace marks with +: "25+5", "26+4", "21 +", "18+", "21 +"
          if (/^\d+\s*\+\s*\d*$/.test(s)) {
            graceValues.push({ value: s, type, sheet: ws.name, file, row: r, col: c });
          }

          // Non-numeric values that are NOT names, NOT standard headers, in mark columns
          // (looking for stuff like "45E", "40E", "42E" without the X)
          if (/^\d+\s*[eE]$/.test(s)) {
            specialMarks.push({ value: s, type, sheet: ws.name, file, row: r, col: c, pattern: "digit+E" });
          }
        }
      }
    }
  }

  // REPORT
  console.log("=" .repeat(70));
  console.log("FINDING 1: EX SUFFIX (Exempted/Carry-forward marks)");
  console.log("=" .repeat(70));
  console.log(`Found ${exValues.length} cells with EX suffix\n`);
  console.log("By sheet type:");
  const exByType = { regular: 0, reval: 0, atkt: 0 };
  for (const e of exValues) exByType[e.type]++;
  console.log(`  Regular: ${exByType.regular}`);
  console.log(`  Reval:   ${exByType.reval}`);
  console.log(`  ATKT:    ${exByType.atkt}`);
  console.log("\nUnique values:", [...new Set(exValues.map((e) => e.value))].sort().join(", "));
  console.log("\nSamples:");
  for (const e of exValues.slice(0, 15)) {
    console.log(`  "${e.value}" at row ${e.row}, col ${e.col} in ${e.type}/${e.sheet} (${e.file})`);
  }

  console.log("\n" + "=" .repeat(70));
  console.log("FINDING 2: GRACE MARKS (number + number)");
  console.log("=" .repeat(70));
  console.log(`Found ${graceValues.length} cells with grace marks\n`);
  const grByType = { regular: 0, reval: 0, atkt: 0 };
  for (const g of graceValues) grByType[g.type]++;
  console.log("By sheet type:");
  console.log(`  Regular: ${grByType.regular}`);
  console.log(`  Reval:   ${grByType.reval}`);
  console.log(`  ATKT:    ${grByType.atkt}`);
  console.log("\nUnique values:", [...new Set(graceValues.map((g) => g.value))].sort().join(", "));

  if (specialMarks.length > 0) {
    console.log("\n" + "=" .repeat(70));
    console.log("FINDING 3: digit+E (without X) pattern");
    console.log("=" .repeat(70));
    console.log(`Found ${specialMarks.length} cells`);
    for (const m of specialMarks.slice(0, 10)) {
      console.log(`  "${m.value}" at row ${m.row}, col ${m.col} in ${m.type}/${m.sheet} (${m.file})`);
    }
  }

  // What does the EX mean in context?
  console.log("\n" + "=" .repeat(70));
  console.log("FINDING 4: CONTEXT ANALYSIS -- EX marks vs subject columns");
  console.log("=" .repeat(70));
  console.log("Examining where EX appears in column structure (I/E/T position):");
  for (const e of exValues.slice(0, 20)) {
    // Read header above to identify if this is I, E, or T column
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(path.join(DIR, e.file));
    const ws2 = wb2.getWorksheet(e.sheet);

    // Check rows 3, 4 for context
    let headerAbove = "";
    for (let hr = 1; hr <= 6; hr++) {
      const hv = cellVal(ws2.getRow(hr).getCell(e.col));
      if (hv) headerAbove += `R${hr}="${String(hv).trim()}" `;
    }
    console.log(`  "${e.value}" col ${e.col}: headers above: ${headerAbove}`);
  }
}

main().catch(console.error);
