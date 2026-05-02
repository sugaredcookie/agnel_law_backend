/**
 * Cross-sheet analysis: Compare student data across Regular vs ATKT vs Reval sheets.
 * Finds same students (by name or roll/seat) and reports what changes between exam types.
 */
const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");

const EXCEL_DIR = path.join(__dirname, "..", "uploads", "excel");

// Normalize cell value
function cellVal(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  const v = cell.value;
  if (typeof v === "object" && v !== null) {
    if (v.result !== undefined) return v.result;
    if (v.richText) return v.richText.map(r => r.text).join("");
    if (v.formula) return v.result ?? null;
  }
  return v;
}

function norm(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// Detect header row (the row with "Name" in it)
function findHeaderRow(ws) {
  for (let r = 1; r <= 10; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 30; c++) {
      const v = norm(cellVal(row.getCell(c))).toLowerCase();
      if (v === "name" || v === "student name" || v === "name of the student") {
        return r;
      }
    }
  }
  return null;
}

// Build column map from header rows (scan rows headerRow to headerRow+4)
function buildColumnMap(ws, headerRow) {
  const map = {};
  const scanRows = [headerRow];
  // Also check rows below for GR/PRN/PNR/CP/GP which sometimes appear 2 rows below
  for (let offset = 1; offset <= 4; offset++) {
    scanRows.push(headerRow + offset);
  }

  for (const r of scanRows) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 40; c++) {
      const raw = norm(cellVal(row.getCell(c))).toLowerCase();
      if (!raw) continue;

      if (!map.name && (raw === "name" || raw === "student name" || raw === "name of the student")) map.name = c;
      if (!map.rollNo && (raw === "roll no" || raw === "roll no.")) map.rollNo = c;
      if (!map.seatNo && (raw === "exam seat no" || raw === "examseatno" || raw === "exam seat no.")) map.seatNo = c;
      if (!map.studentId && (raw === "student id" || raw === "student id.")) map.studentId = c;
      if (!map.grNo && (raw === "gr no" || raw === "gr no." || raw === "gr" || raw === "gr no")) map.grNo = c;
      if (!map.prn && (raw === "prn" || raw === "prn." || raw === "prn no" || raw === "prn no." || raw === "prn. no." || raw === "pnr")) map.prn = c;
      if (!map.grandTotal && (raw === "grand total" || raw === "total")) map.grandTotal = c;
      if (!map.remarks && (raw === "remarks" || raw === "remark")) map.remarks = c;
      if (!map.cp && (raw === "cp" || raw === "credit")) map.cp = c;
      if (!map.gp && (raw === "gp" || raw === "total gp")) map.gp = c;
      if (!map.sgpa && (raw === "sgpa" || raw === "sgp" || raw === "sgpi" || raw === "cg" || raw === "cgp")) map.sgpa = c;
      if (!map.srNo && (raw === "sr no" || raw === "sr no.")) map.srNo = c;
      if (!map.totalMaxMarks && (raw === "total max marks")) map.totalMaxMarks = c;
    }
  }

  return map;
}

// Find subject columns (anything between the identification columns and Grand Total)
function findSubjectRange(ws, headerRow, colMap) {
  // Subject columns start after the last identification column
  const idCols = [colMap.name, colMap.rollNo, colMap.seatNo, colMap.studentId, colMap.grNo, colMap.prn, colMap.srNo].filter(Boolean);
  const startAfter = Math.max(...idCols);

  // Subject columns end before Grand Total or Remarks
  const endBefore = Math.min(
    ...[colMap.grandTotal, colMap.remarks, colMap.totalMaxMarks].filter(Boolean)
  );

  return { startCol: startAfter + 1, endCol: endBefore - 1 };
}

// Read all students from a sheet
function readStudents(ws, headerRow, colMap) {
  const dataStart = headerRow + 1;
  // Skip max/min rows (usually 2 rows below header for limits)
  let actualStart = dataStart;

  // Check if rows right after header are numeric limit rows
  for (let r = dataStart; r <= dataStart + 4; r++) {
    const row = ws.getRow(r);
    const nameVal = norm(cellVal(row.getCell(colMap.name)));
    if (!nameVal) continue;
    // If it looks like a header sub-row (I, E, T, Internal, External, etc.) skip
    if (/^(i|e|t|internal|external|total|max|min|semester|end|assessment)$/i.test(nameVal)) {
      actualStart = r + 1;
      continue;
    }
    // If it's a number (max/min marks row), skip
    if (/^\d+$/.test(nameVal)) {
      actualStart = r + 1;
      continue;
    }
    break;
  }

  const students = [];
  const maxRow = Math.min(ws.rowCount, actualStart + 500);
  let emptyCount = 0;

  for (let r = actualStart; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const name = norm(cellVal(row.getCell(colMap.name)));
    if (!name || /^(result\s*declared|note|total)/i.test(name)) {
      emptyCount++;
      if (emptyCount > 10) break;
      continue;
    }
    emptyCount = 0;

    const rollNo = colMap.rollNo ? norm(cellVal(row.getCell(colMap.rollNo))) : "";
    const seatNo = colMap.seatNo ? norm(cellVal(row.getCell(colMap.seatNo))) : "";
    const studentId = colMap.studentId ? norm(cellVal(row.getCell(colMap.studentId))) : "";
    const grNo = colMap.grNo ? norm(cellVal(row.getCell(colMap.grNo))) : "";
    const prn = colMap.prn ? norm(cellVal(row.getCell(colMap.prn))) : "";
    const grandTotal = colMap.grandTotal ? norm(cellVal(row.getCell(colMap.grandTotal))) : "";
    const remarks = colMap.remarks ? norm(cellVal(row.getCell(colMap.remarks))) : "";
    const cp = colMap.cp ? norm(cellVal(row.getCell(colMap.cp))) : "";
    const gp = colMap.gp ? norm(cellVal(row.getCell(colMap.gp))) : "";
    const sgpa = colMap.sgpa ? norm(cellVal(row.getCell(colMap.sgpa))) : "";

    // Read all subject marks (raw cell values)
    const subjRange = findSubjectRange(ws, headerRow, colMap);
    const subjectMarks = [];
    for (let c = subjRange.startCol; c <= subjRange.endCol; c++) {
      subjectMarks.push(norm(cellVal(row.getCell(c))));
    }

    // Key for matching: prefer rollNo, then seatNo, then name
    const key = rollNo || seatNo || name;

    students.push({
      key, name, rollNo, seatNo, studentId, grNo, prn,
      grandTotal, remarks, cp, gp, sgpa,
      subjectMarks,
      row: r,
    });
  }
  return students;
}

// Compare two student records and report differences
function diffStudent(regStudent, otherStudent, otherType) {
  const diffs = [];

  // Check marks changes
  const regMarks = regStudent.subjectMarks;
  const otherMarks = otherStudent.subjectMarks;

  // Find marks that changed
  const maxLen = Math.max(regMarks.length, otherMarks.length);
  const markChanges = [];
  for (let i = 0; i < maxLen; i++) {
    const rv = regMarks[i] || "";
    const ov = otherMarks[i] || "";
    if (rv !== ov) {
      markChanges.push({ col: i + 1, regular: rv, [otherType]: ov });
    }
  }
  if (markChanges.length > 0) {
    diffs.push({ field: "subjectMarks", changes: markChanges });
  }

  // Check other fields
  for (const field of ["grandTotal", "remarks", "cp", "gp", "sgpa", "grNo", "prn"]) {
    if (regStudent[field] !== otherStudent[field]) {
      diffs.push({ field, regular: regStudent[field], [otherType]: otherStudent[field] });
    }
  }

  return diffs;
}

async function analyzeFile(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const fileName = path.basename(filePath);
  const results = { file: fileName, sheets: {}, comparisons: [] };

  // Categorize sheets
  const sheetData = {};

  for (const ws of wb.worksheets) {
    const sheetName = ws.name;
    const lowerName = sheetName.toLowerCase();

    // Skip raw/copy/grace/transfer sheets
    if (lowerName === "raw" || lowerName === "copy" || lowerName === "grace" ||
        lowerName.includes("transfer") || lowerName.includes("trasnfer")) continue;

    let type = "regular";
    if (lowerName.includes("reval")) type = "reval";
    else if (lowerName.includes("atkt")) type = "atkt";

    const headerRow = findHeaderRow(ws);
    if (!headerRow) {
      results.sheets[sheetName] = { type, error: "No header row found" };
      continue;
    }

    const colMap = buildColumnMap(ws, headerRow);
    if (!colMap.name) {
      results.sheets[sheetName] = { type, error: "No Name column found" };
      continue;
    }

    const students = readStudents(ws, headerRow, colMap);

    results.sheets[sheetName] = {
      type,
      headerRow,
      columns: colMap,
      studentCount: students.length,
    };

    sheetData[sheetName] = { type, students, colMap };
  }

  // Find Regular sheet(s)
  const regularSheets = Object.entries(sheetData).filter(([, d]) => d.type === "regular");
  const revalSheets = Object.entries(sheetData).filter(([, d]) => d.type === "reval");
  const atktSheets = Object.entries(sheetData).filter(([, d]) => d.type === "atkt");

  // Compare Regular vs Reval
  for (const [regName, regData] of regularSheets) {
    for (const [revName, revData] of revalSheets) {
      const comparison = {
        regular: regName,
        reval: revName,
        matchedStudents: 0,
        totalReval: revData.students.length,
        changes: [],
        remarkPatterns: { regular: {}, reval: {} },
        abPatterns: { regularStudentsWithAB: 0, revalStudentsWithAB: 0 },
      };

      // Build lookup from regular
      const regMap = new Map();
      for (const s of regData.students) {
        regMap.set(s.key, s);
        // Also try name-based matching
        regMap.set(s.name.toLowerCase(), s);

        // Count remarks
        const rem = s.remarks || "(blank)";
        comparison.remarkPatterns.regular[rem] = (comparison.remarkPatterns.regular[rem] || 0) + 1;

        if (s.subjectMarks.some(m => m.toUpperCase() === "AB" || m === "(AB)")) {
          comparison.abPatterns.regularStudentsWithAB++;
        }
      }

      for (const revStudent of revData.students) {
        const rem = revStudent.remarks || "(blank)";
        comparison.remarkPatterns.reval[rem] = (comparison.remarkPatterns.reval[rem] || 0) + 1;

        if (revStudent.subjectMarks.some(m => m.toUpperCase() === "AB" || m === "(AB)")) {
          comparison.abPatterns.revalStudentsWithAB++;
        }

        const regStudent = regMap.get(revStudent.key) || regMap.get(revStudent.name.toLowerCase());
        if (!regStudent) continue;

        comparison.matchedStudents++;
        const diffs = diffStudent(regStudent, revStudent, "reval");
        if (diffs.length > 0) {
          comparison.changes.push({
            student: revStudent.name,
            key: revStudent.key,
            regularRemarks: regStudent.remarks,
            revalRemarks: revStudent.remarks,
            diffs,
          });
        }
      }

      results.comparisons.push(comparison);
    }

    // Compare Regular vs ATKT
    for (const [atktName, atktData] of atktSheets) {
      const comparison = {
        regular: regName,
        atkt: atktName,
        matchedStudents: 0,
        totalAtkt: atktData.students.length,
        changes: [],
        remarkPatterns: { regular: {}, atkt: {} },
        abPatterns: { regularStudentsWithAB: 0, atktStudentsWithAB: 0 },
      };

      const regMap = new Map();
      for (const s of regData.students) {
        regMap.set(s.key, s);
        regMap.set(s.name.toLowerCase(), s);

        const rem = s.remarks || "(blank)";
        comparison.remarkPatterns.regular[rem] = (comparison.remarkPatterns.regular[rem] || 0) + 1;

        if (s.subjectMarks.some(m => m.toUpperCase() === "AB" || m === "(AB)")) {
          comparison.abPatterns.regularStudentsWithAB++;
        }
      }

      for (const atktStudent of atktData.students) {
        const rem = atktStudent.remarks || "(blank)";
        comparison.remarkPatterns.atkt[rem] = (comparison.remarkPatterns.atkt[rem] || 0) + 1;

        if (atktStudent.subjectMarks.some(m => m.toUpperCase() === "AB" || m === "(AB)")) {
          comparison.abPatterns.atktStudentsWithAB++;
        }

        const regStudent = regMap.get(atktStudent.key) || regMap.get(atktStudent.name.toLowerCase());
        if (!regStudent) continue;

        comparison.matchedStudents++;
        const diffs = diffStudent(regStudent, atktStudent, "atkt");
        if (diffs.length > 0) {
          comparison.changes.push({
            student: atktStudent.name,
            key: atktStudent.key,
            regularRemarks: regStudent.remarks,
            atktRemarks: atktStudent.remarks,
            diffs,
          });
        }
      }

      results.comparisons.push(comparison);
    }
  }

  return results;
}

async function main() {
  const files = fs.readdirSync(EXCEL_DIR).filter(f => f.endsWith(".xlsx"));
  console.log(`\n=== REVAL / ATKT DATA ANALYSIS ===\n`);
  console.log(`Found ${files.length} Excel files\n`);

  const allRemarkValues = { regular: new Set(), reval: new Set(), atkt: new Set() };
  const allChangePatterns = { reval: [], atkt: [] };

  for (const file of files) {
    const filePath = path.join(EXCEL_DIR, file);
    try {
      const result = await analyzeFile(filePath);

      console.log(`${"=".repeat(70)}`);
      console.log(`FILE: ${result.file}`);
      console.log(`${"=".repeat(70)}`);

      // Sheet summary
      for (const [name, info] of Object.entries(result.sheets)) {
        if (info.error) {
          console.log(`  Sheet "${name}" (${info.type}): ${info.error}`);
        } else {
          console.log(`  Sheet "${name}" (${info.type}): ${info.studentCount} students, headerRow=${info.headerRow}`);
          console.log(`    Columns: ${JSON.stringify(info.columns)}`);
        }
      }

      // Comparisons
      for (const comp of result.comparisons) {
        const otherType = comp.reval !== undefined ? "reval" : "atkt";
        const otherSheet = comp[otherType];

        console.log(`\n  --- ${comp.regular} vs ${otherSheet} (${otherType.toUpperCase()}) ---`);
        console.log(`  Matched: ${comp.matchedStudents}/${comp[`total${otherType.charAt(0).toUpperCase() + otherType.slice(1)}`]} ${otherType} students found in regular`);

        // Remark patterns
        console.log(`  Remark values in Regular: ${JSON.stringify(comp.remarkPatterns.regular)}`);
        console.log(`  Remark values in ${otherType}: ${JSON.stringify(comp.remarkPatterns[otherType])}`);

        // AB patterns
        console.log(`  AB marks: Regular=${comp.abPatterns.regularStudentsWithAB}, ${otherType}=${comp.abPatterns[`${otherType}StudentsWithAB`]}`);

        // Collect all remark values
        for (const rem of Object.keys(comp.remarkPatterns.regular)) allRemarkValues.regular.add(rem);
        for (const rem of Object.keys(comp.remarkPatterns[otherType])) allRemarkValues[otherType].add(rem);

        // Sample changes (first 5)
        if (comp.changes.length > 0) {
          console.log(`  ${comp.changes.length} students with changes. Examples:`);
          for (const ch of comp.changes.slice(0, 5)) {
            console.log(`\n    Student: ${ch.student} (${ch.key})`);
            console.log(`    Remark: "${ch.regularRemarks}" -> "${ch[`${otherType}Remarks`]}"`);
            for (const d of ch.diffs) {
              if (d.field === "subjectMarks") {
                for (const mc of d.changes.slice(0, 10)) {
                  console.log(`      Mark col${mc.col}: "${mc.regular}" -> "${mc[otherType]}"`);
                }
                if (d.changes.length > 10) console.log(`      ... and ${d.changes.length - 10} more mark changes`);
              } else {
                console.log(`      ${d.field}: "${d.regular}" -> "${d[otherType]}"`);
              }
            }

            // Classify change type
            const hasABtoMark = ch.diffs.some(d =>
              d.field === "subjectMarks" &&
              d.changes.some(mc => (mc.regular === "AB" || mc.regular === "(AB)") && mc[otherType] !== "AB" && mc[otherType] !== "(AB)" && mc[otherType] !== "")
            );
            const hasMarkChange = ch.diffs.some(d =>
              d.field === "subjectMarks" &&
              d.changes.some(mc => mc.regular !== "" && mc[otherType] !== "" && mc.regular !== "AB" && mc[otherType] !== "AB")
            );
            const remarkChange = ch.regularRemarks !== ch[`${otherType}Remarks`];

            const pattern = [];
            if (hasABtoMark) pattern.push("AB->marks");
            if (hasMarkChange) pattern.push("marks-changed");
            if (remarkChange) pattern.push(`remark:${ch.regularRemarks}->${ch[`${otherType}Remarks`]}`);
            if (pattern.length > 0) {
              allChangePatterns[otherType].push(pattern.join(", "));
            }
          }

          // Overall change stats
          let abToMarks = 0, marksChanged = 0, remarkChanged = 0, gpChanged = 0, sgpaChanged = 0;
          for (const ch of comp.changes) {
            for (const d of ch.diffs) {
              if (d.field === "subjectMarks") {
                for (const mc of d.changes) {
                  if ((mc.regular === "AB" || mc.regular === "(AB)") && mc[otherType] !== "AB") abToMarks++;
                  else if (mc.regular !== mc[otherType] && mc.regular !== "" && mc[otherType] !== "") marksChanged++;
                }
              }
              if (d.field === "gp") gpChanged++;
              if (d.field === "sgpa") sgpaChanged++;
              if (d.field === "remarks") remarkChanged++;
            }
          }
          console.log(`\n  Change summary: AB->marks=${abToMarks}, marks-changed=${marksChanged}, remark-changed=${remarkChanged}, gp-changed=${gpChanged}, sgpa-changed=${sgpaChanged}`);
        } else {
          console.log(`  No data changes detected for matched students`);
        }
      }

      console.log("");
    } catch (err) {
      console.error(`ERROR processing ${file}: ${err.message}`);
    }
  }

  // Global summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("GLOBAL SUMMARY");
  console.log(`${"=".repeat(70)}`);
  console.log(`\nAll REMARK values found:`);
  console.log(`  Regular: ${[...allRemarkValues.regular].join(", ")}`);
  console.log(`  Reval:   ${[...allRemarkValues.reval].join(", ")}`);
  console.log(`  ATKT:    ${[...allRemarkValues.atkt].join(", ")}`);

  console.log(`\nChange patterns in REVAL (sample):`);
  const revalPatterns = {};
  for (const p of allChangePatterns.reval) {
    revalPatterns[p] = (revalPatterns[p] || 0) + 1;
  }
  for (const [p, count] of Object.entries(revalPatterns)) {
    console.log(`  ${p}: ${count}`);
  }

  console.log(`\nChange patterns in ATKT (sample):`);
  const atktPatterns = {};
  for (const p of allChangePatterns.atkt) {
    atktPatterns[p] = (atktPatterns[p] || 0) + 1;
  }
  for (const [p, count] of Object.entries(atktPatterns)) {
    console.log(`  ${p}: ${count}`);
  }
}

main().catch(console.error);
