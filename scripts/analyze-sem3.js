import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, "..", "uploads", "excel", "TY LLB (SYLLB SEM 3.xlsx");
const wb = new ExcelJS.Workbook();

function getVal(row, c) {
  const cell = row.getCell(c);
  let v = cell.value;
  if (v && typeof v === "object") {
    if (v.result !== undefined) v = v.result;
    else if (v.richText) v = v.richText.map((x) => x.text).join("");
    else if (v.formula) v = "[F]";
  }
  return v;
}

try {
  await wb.xlsx.readFile(filePath);
  console.log("Sheets:", wb.worksheets.length);

  for (const ws of wb.worksheets) {
    console.log("\n===", ws.name, "=== Rows:", ws.rowCount, "Cols:", ws.columnCount);

    for (let r = 1; r <= Math.min(8, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const cells = [];
      for (let c = 1; c <= Math.min(25, ws.columnCount); c++) {
        const v = getVal(row, c);
        if (v !== null && v !== undefined) cells.push(`[C${c}]=${String(v).substring(0, 50)}`);
      }
      if (cells.length) console.log(`  R${r}: ${cells.join(" | ")}`);
    }

    let dc = 0;
    for (let r = 5; r <= Math.min(20, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const name = getVal(row, 2);
      if (name && String(name).trim().length > 3 && /[a-zA-Z]/.test(String(name)) && dc < 3) {
        const cells = [];
        for (let c = 1; c <= Math.min(25, ws.columnCount); c++) {
          const v = getVal(row, c);
          if (v !== null && v !== undefined) cells.push(`[C${c}]=${String(v).substring(0, 35)}`);
        }
        console.log(`  DATA R${r}: ${cells.join(" | ")}`);
        dc++;
      }
    }

    let total = 0;
    for (let r = 5; r <= ws.rowCount; r++) {
      const name = getVal(ws.getRow(r), 2);
      if (name && String(name).trim().length > 2 && /[a-zA-Z]/.test(String(name))) total++;
    }
    console.log(`  ~${total} data rows`);
  }
} catch (e) {
  console.error("Error:", e.message);
}
