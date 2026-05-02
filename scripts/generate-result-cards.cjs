/**
 * Standalone script to generate result card PDFs from Excel data.
 * Reads FY LLB Sem 1 marks from Excel and produces per-student PDF marksheets.
 *
 * Usage: node scripts/generate-result-cards.js
 */

const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  programme: 'FIRST YEAR B.A. LL.B. (FIVE YEAR COURSE)',
  year: '2024-2025',
  semester: 'I',
  examMonth: 'OCTOBER 2024',
  resultDeclaredOn: '11.03.2025',
  place: 'Mumbai',
  totalSemesters: 10,
  excelFile: path.join(__dirname, '..', 'uploads', 'excel', 'FY LLB SEM 1.xlsx'),
  outputDir: path.join(__dirname, '..', 'output', 'result-cards-sem1'),
  dataStartRow: 7,
  dataEndRow: 185,
};

// Column indices (1-based) for subjects: Internal, External
const SUBJECTS = [
  { code: 1, name: 'Legal Language', iCol: 5, eCol: 6, credit: 4 },
  { code: 2, name: 'Law of Torts, Motor Accident Claims and Consumer Protection', iCol: 8, eCol: 9, credit: 4 },
  { code: 3, name: 'Law of Contract and Specific Relief', iCol: 11, eCol: 12, credit: 4 },
  { code: 4, name: 'Labour Law & Industrial Relations - I', iCol: 14, eCol: 15, credit: 4 },
];

const PRACTICAL = { code: 5, name: 'Practical Training - I', col: 17, max: 100, min: 40, credit: 4 };

// Internal/External limits for regular subjects
const LIMITS = { maxI: 25, minI: 10, maxE: 75, minE: 30, maxT: 100, minT: 40 };

// ─── Grade Mapping (verified against 140/142 pass students) ─────────────────

function getGradeInfo(totalMarks) {
  if (totalMarks >= 80) return { grade: 'O', gp: 10 };
  if (totalMarks >= 70) return { grade: 'A+', gp: 9 };
  if (totalMarks >= 60) return { grade: 'A', gp: 8 };
  if (totalMarks >= 55) return { grade: 'B+', gp: 7 };
  if (totalMarks >= 50) return { grade: 'B', gp: 6 };
  if (totalMarks >= 45) return { grade: 'C', gp: 5 };
  if (totalMarks >= 40) return { grade: 'D', gp: 4 };
  return { grade: 'F', gp: 0 };
}

function getFinalGrade(sgpa) {
  if (sgpa === null) return 'F';
  if (sgpa >= 9.5) return 'O';
  if (sgpa >= 8.5) return 'A+';
  if (sgpa >= 7.5) return 'A';
  if (sgpa >= 6.5) return 'B+';
  if (sgpa >= 5.5) return 'B';
  if (sgpa >= 4.5) return 'C';
  if (sgpa >= 4.0) return 'D';
  return 'F';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCellValue(row, col) {
  const cell = row.getCell(col);
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v !== null) {
    if (v.result !== undefined) return v.result;
    if (v.formula) return null; // formula with no cached result
  }
  return v;
}

function parseMarks(value) {
  if (value === null || value === undefined) return { num: null, display: null };
  if (typeof value === 'number') return { num: value, display: value };
  const str = String(value).trim();
  if (['AB', 'Ab', 'Absent', 'RR', ''].includes(str)) return { num: str, display: str };
  if (str.includes('+')) {
    const parts = str.split('+').map(s => parseInt(s.trim(), 10));
    if (parts.every(n => !isNaN(n))) return { num: parts.reduce((a, b) => a + b, 0), display: str };
  }
  const num = Number(str);
  return isNaN(num) ? { num: str, display: str } : { num, display: num };
}

function isSpecialStatus(val) {
  return typeof val === 'string' && ['AB', 'Ab', 'Absent', 'RR'].includes(val);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
}

// ─── Read Excel ─────────────────────────────────────────────────────────────

async function readStudents() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CONFIG.excelFile);
  const ws = wb.getWorksheet(1);

  const students = [];

  for (let r = CONFIG.dataStartRow; r <= CONFIG.dataEndRow; r++) {
    const row = ws.getRow(r);
    const name = getCellValue(row, 2);
    if (!name) continue;

    const remark = getCellValue(row, 20);
    const remarkLower = (remark || '').toString().toLowerCase();

    // Only generate for Pass, Fail, Absent
    if (!['pass', 'fail', 'absent'].includes(remarkLower)) continue;

    const seatNo = getCellValue(row, 1);
    const rollNo = getCellValue(row, 3);
    const grNo = getCellValue(row, 4);
    const prn = getCellValue(row, 22);

    // Parse subjects
    const subjectResults = [];
    let allPassed = true;
    let totalMarksObt = 0;
    let totalCG = 0;
    let totalCredits = 0;
    let totalEarned = 0;

    for (const subj of SUBJECTS) {
      const rawI = getCellValue(row, subj.iCol);
      const rawE = getCellValue(row, subj.eCol);
      const internal = parseMarks(rawI);
      const external = parseMarks(rawE);

      const iNum = typeof internal.num === 'number' ? internal.num : 0;
      const eNum = typeof external.num === 'number' ? external.num : 0;
      const total = iNum + eNum;

      const iIsSpecial = isSpecialStatus(internal.num);
      const eIsSpecial = isSpecialStatus(external.num);
      const passed = !iIsSpecial && !eIsSpecial &&
        iNum >= LIMITS.minI && eNum >= LIMITS.minE && total >= LIMITS.minT;

      const gradeInfo = passed ? getGradeInfo(total) : { grade: 'F', gp: 0 };
      const earned = passed ? subj.credit : 0;
      const cg = earned * gradeInfo.gp;

      if (!passed) allPassed = false;
      totalMarksObt += total;
      totalCG += cg;
      totalCredits += subj.credit;
      totalEarned += earned;

      subjectResults.push({
        code: subj.code,
        name: subj.name,
        internal: iIsSpecial ? internal.num : iNum,
        external: eIsSpecial ? external.num : eNum,
        total,
        iDisplay: iIsSpecial ? internal.display : internal.display,
        eDisplay: eIsSpecial ? external.display : external.display,
        grade: iIsSpecial || eIsSpecial ? (iIsSpecial ? internal.display : external.display) : gradeInfo.grade,
        gp: gradeInfo.gp,
        credit: subj.credit,
        earned,
        cg,
        passed,
        isAbsent: iIsSpecial || eIsSpecial,
      });
    }

    // Practical
    const rawPrac = getCellValue(row, PRACTICAL.col);
    const pracMarks = parseMarks(rawPrac);
    const pracNum = typeof pracMarks.num === 'number' ? pracMarks.num : 0;
    const pracSpecial = isSpecialStatus(pracMarks.num);
    const pracPassed = !pracSpecial && pracNum >= PRACTICAL.min;
    const pracGrade = pracPassed ? getGradeInfo(pracNum) : { grade: 'F', gp: 0 };
    const pracEarned = pracPassed ? PRACTICAL.credit : 0;
    const pracCG = pracEarned * pracGrade.gp;

    if (!pracPassed) allPassed = false;
    totalMarksObt += pracNum;
    totalCG += pracCG;
    totalCredits += PRACTICAL.credit;
    totalEarned += pracEarned;

    const practicalResult = {
      code: PRACTICAL.code,
      name: PRACTICAL.name,
      marks: pracSpecial ? pracMarks.num : pracNum,
      display: pracSpecial ? pracMarks.display : pracMarks.display,
      grade: pracSpecial ? pracMarks.display : pracGrade.grade,
      gp: pracGrade.gp,
      credit: PRACTICAL.credit,
      earned: pracEarned,
      cg: pracCG,
      passed: pracPassed,
    };

    // SGPA
    const sgpa = allPassed ? parseFloat((totalCG / totalCredits).toFixed(2)) : null;
    const finalGrade = allPassed ? getFinalGrade(sgpa) : 'F';
    const cgpa = allPassed ? sgpa : 0;

    const remarkDisplay = remarkLower === 'pass' ? 'SUCCESSFUL' :
      remarkLower === 'absent' ? 'ABSENT' : 'UNSUCCESSFUL';

    students.push({
      row: r,
      seatNo,
      name,
      rollNo,
      grNo,
      prn,
      subjects: subjectResults,
      practical: practicalResult,
      totalMarksObt,
      maxMarks: 500,
      totalCG,
      totalCredits,
      totalEarned,
      sgpa,
      finalGrade,
      cgpa,
      remark: remarkDisplay,
      allPassed,
    });
  }

  return students;
}

// ─── HTML Template ──────────────────────────────────────────────────────────

function generateHTML(student) {
  const { seatNo, name, rollNo, grNo, prn, subjects, practical, remark } = student;
  const totalSubjects = subjects.length + 1; // +1 for practical
  const sgpiRowspan = totalSubjects + 1; // subjects + practical + total row

  // Build subject rows
  let subjectRowsHTML = '';
  for (let i = 0; i < subjects.length; i++) {
    const s = subjects[i];
    const sgpiCell = i === 0
      ? `<td rowspan="${sgpiRowspan}" class="font-bold align-middle">${student.sgpa !== null ? student.sgpa.toFixed(2) : 'NA'}</td>`
      : '';
    subjectRowsHTML += `
                <tr>
                    <td class="font-bold">${s.code}</td>
                    <td class="text-left-pad font-bold uppercase">${s.name}</td>
                    <td>${LIMITS.maxI}</td><td>${LIMITS.minI}</td><td class="${!s.passed && typeof s.internal === 'number' && s.internal < LIMITS.minI ? 'text-red-600 font-bold' : ''}">${s.iDisplay}</td>
                    <td>${LIMITS.maxE}</td><td>${LIMITS.minE}</td><td class="${!s.passed && typeof s.external === 'number' && s.external < LIMITS.minE ? 'text-red-600 font-bold' : ''}">${s.eDisplay}</td>
                    <td>${LIMITS.maxT}</td><td>${LIMITS.minT}</td><td class="${!s.passed ? 'font-bold' : ''}">${s.total}</td>
                    <td class="font-bold">${s.grade}</td><td>${s.gp}</td><td>${s.credit}</td><td>${s.earned}</td><td>${s.cg}</td>
                    ${sgpiCell}
                </tr>`;
  }

  // Practical row
  const p = practical;
  subjectRowsHTML += `
                <tr>
                    <td class="font-bold">${p.code}</td>
                    <td class="text-left-pad font-bold uppercase">${p.name}</td>
                    <td>--</td><td>--</td><td>--</td>
                    <td>--</td><td>--</td><td>--</td>
                    <td>${PRACTICAL.max}</td><td>${PRACTICAL.min}</td><td class="${!p.passed ? 'font-bold' : ''}">${p.display}</td>
                    <td class="font-bold">${p.grade}</td><td>${p.gp}</td><td>${p.credit}</td><td>${p.earned}</td><td>${p.cg}</td>
                </tr>`;

  // Total GP display
  const totalGPsum = subjects.reduce((sum, s) => sum + s.gp, 0) + p.gp;

  // Total row
  subjectRowsHTML += `
                <tr>
                    <td></td>
                    <td class="text-right-pad font-bold">Total</td>
                    <td></td><td></td><td></td>
                    <td></td><td></td><td></td>
                    <td></td><td></td><td class="font-bold">${student.totalMarksObt}</td>
                    <td></td>
                    <td class="font-bold">${totalGPsum}</td>
                    <td class="font-bold">${student.totalCredits}</td>
                    <td class="font-bold">${student.totalEarned}</td>
                    <td class="font-bold">${student.totalCG}</td>
                </tr>`;

  // Semester overview rows
  const semCreditCells = Array.from({ length: CONFIG.totalSemesters }, (_, i) => {
    const semNum = i + 1;
    const label = `Sem ${toRoman(semNum)}`;
    const val = semNum === 1 ? student.totalEarned : '--';
    return `<td class="text-left-pad"><b>${label}:</b> ${val}</td>`;
  }).join('\n                ');

  const semSGPICells = Array.from({ length: CONFIG.totalSemesters }, (_, i) => {
    const semNum = i + 1;
    const label = `Sem ${toRoman(semNum)}`;
    const val = semNum === 1 ? (student.sgpa !== null ? student.sgpa.toFixed(2) : 'NA') : '--';
    return `<td class="text-left-pad"><b>${label}:</b> ${val}</td>`;
  }).join('\n                ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Result Card - ${name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Arimo:wght@400;700&display=swap');
        html, body {
            font-family: 'Arial', Arial, Helvetica, sans-serif;
            background-color: white;
            padding: 0;
            margin: 0;
            height: 100%;
        }
        body {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .marksheet-wrapper {
            background-color: white;
            width: 100%;
            max-width: 1100px;
            padding: 30px 40px 0 40px;
            color: black;
            font-size: 11.5px;
            line-height: 1.2;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .card-content {
            /* The actual result card tables */
        }
        .footer-section {
            margin-top: auto;
            padding: 0 40px 25px 40px;
            width: 100%;
            max-width: 1100px;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td {
            border: 1px solid black;
            padding: 5px 3px;
            text-align: center;
            vertical-align: middle;
        }
        .table-stacked { margin-top: -1px; }
        .text-left-pad { text-align: left; padding-left: 8px; }
        .text-right-pad { text-align: right; padding-right: 8px; }
        .header-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 4px;
            font-weight: bold;
            font-size: 12.5px;
        }
        .col-code { width: 40px; }
        .col-title { width: auto; }
        .col-marks { width: 38px; }
        .col-grades { width: 42px; }
        .col-small { width: 38px; }
        .col-sgpi { width: 55px; }
        @media print {
            body { background-color: white; padding: 0; }
            .marksheet-wrapper { box-shadow: none; padding: 10px 10px 0 10px; max-width: 100%; }
            .footer-section { padding: 0 10px 10px 10px; }
        }
    </style>
</head>
<body>
    <div class="marksheet-wrapper">
      <div class="card-content">

        <div class="header-section">
            <div>PROGRAMME: ${CONFIG.programme}</div>
            <div>Year: ${CONFIG.year}</div>
            <div>SEMESTER - ${CONFIG.semester}</div>
        </div>

        <table>
            <tr>
                <th class="w-[12%]">Exam Seat No.</th>
                <th class="w-[20%]">PRN No.</th>
                <th class="w-[10%]">GR. No.</th>
                <th class="w-[35%]">Name of the Candidate</th>
                <th class="w-[15%]">Month & Year of Examination</th>
                <td rowspan="2" class="w-[8%] p-0 align-top">
                    <div class="w-full h-[85px] bg-gray-200 border-l border-black flex flex-col items-center justify-center text-gray-500 font-bold text-xs">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        PHOTO
                    </div>
                </td>
            </tr>
            <tr>
                <td class="font-bold">${seatNo}</td>
                <td class="font-bold">${prn || '--'}</td>
                <td class="font-bold">${grNo || '--'}</td>
                <td class="font-bold">${name}</td>
                <td class="font-bold uppercase">${CONFIG.examMonth}</td>
            </tr>
        </table>

        <table class="table-stacked">
            <thead>
                <tr>
                    <th rowspan="2" class="col-code">Course<br>Code</th>
                    <th rowspan="2" class="col-title">Course Title</th>
                    <th colspan="3">Internal Assessment</th>
                    <th colspan="3">Semester End Exam</th>
                    <th colspan="3">Total Marks</th>
                    <th rowspan="2" class="col-grades">Grades</th>
                    <th rowspan="2" class="col-small">Grade<br>Point<br>(G)</th>
                    <th rowspan="2" class="col-small">Credit<br>Points</th>
                    <th rowspan="2" class="col-small">Credit<br>Earned<br>(C)</th>
                    <th rowspan="2" class="col-small">CG =<br>(C*G)</th>
                    <th rowspan="2" class="col-sgpi">SGPI=<br>&Sigma;CG/&Sigma;C</th>
                </tr>
                <tr>
                    <th class="col-marks">Max<br>Marks</th>
                    <th class="col-marks">Min<br>Marks</th>
                    <th class="col-marks">Marks<br>Obt</th>
                    <th class="col-marks">Max<br>Marks</th>
                    <th class="col-marks">Min<br>Marks</th>
                    <th class="col-marks">Marks<br>Obt</th>
                    <th class="col-marks">Max<br>Marks</th>
                    <th class="col-marks">Min<br>Marks</th>
                    <th class="col-marks">Marks<br>Obt</th>
                </tr>
            </thead>
            <tbody>
                ${subjectRowsHTML}
            </tbody>
        </table>

        <table class="table-stacked">
            <tr>
                <td class="text-left-pad w-[30%]"><b>Remark:</b> ${remark}</td>
                <td class="text-left-pad w-[20%]"><b>Credits Earned:</b> ${student.totalEarned}</td>
                <td class="text-left-pad w-[15%]"><b>SGPA:</b> ${student.sgpa !== null ? student.sgpa.toFixed(2) : 'NA'}</td>
                <td class="text-left-pad w-[17%]"><b>Final Grade:</b> ${student.finalGrade}</td>
                <td class="text-left-pad w-[18%]"><b>CGPA:</b> ${student.cgpa !== null && student.cgpa !== 0 ? student.cgpa.toFixed(2) : '0.00'}</td>
            </tr>
        </table>

        <table class="table-stacked">
            <tr>
                <td class="text-left-pad font-bold" style="width:9%">Credit Earned</td>
                ${semCreditCells}
            </tr>
            <tr>
                <td class="text-left-pad font-bold" style="width:9%">SGPI</td>
                ${semSGPICells}
            </tr>
        </table>

      </div><!-- end card-content -->
    </div><!-- end marksheet-wrapper -->

    <div class="footer-section">
        <div style="display:flex; gap:20px; align-items:flex-end;">
            <div style="width:100px; height:100px; border:2px dashed #9ca3af; background:#f9fafb; display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0;">
                <svg xmlns="http://www.w3.org/2000/svg" style="width:28px;height:28px;color:#9ca3af;margin-bottom:4px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span style="color:#9ca3af; font-weight:bold; font-size:10px;">QR CODE</span>
            </div>
            <div style="flex-grow:1; display:flex; flex-direction:column; justify-content:flex-end; padding-bottom:4px;">
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:12px; margin-bottom:12px;">
                    <div>Place: ${CONFIG.place}</div>
                    <div>Entered By</div>
                    <div>Checked By</div>
                    <div>Read By</div>
                    <div>Principal</div>
                </div>
                <div style="font-weight:bold; font-size:12px;">
                    Result Declared On: ${CONFIG.resultDeclaredOn}
                </div>
            </div>
        </div>
    </div>

</body>
</html>`;
}

// ─── Roman Numeral Helper ───────────────────────────────────────────────────

function toRoman(num) {
  const map = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let result = '';
  for (const [value, symbol] of map) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
}

// ─── PDF Generation ─────────────────────────────────────────────────────────

async function generatePDFs(students) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  console.log(`Launching browser...`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  let generated = 0;
  let failed = 0;

  for (const student of students) {
    try {
      const html = generateHTML(student);
      const filename = `${student.seatNo}_${student.rollNo}_${sanitizeFilename(student.name)}.pdf`;
      const filepath = path.join(CONFIG.outputDir, filename);

      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: filepath,
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });

      generated++;
      if (generated % 20 === 0) {
        console.log(`  Generated ${generated}/${students.length} PDFs...`);
      }
    } catch (err) {
      console.error(`  FAILED: ${student.name} (Row ${student.row}): ${err.message}`);
      failed++;
    }
  }

  await browser.close();
  return { generated, failed };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const limit = parseInt(process.argv[2], 10) || 0; // pass a number to limit, 0 = all

  console.log('Reading Excel file...');
  let students = await readStudents();
  console.log(`Found ${students.length} students total.`);

  if (limit > 0) {
    students = students.slice(0, limit);
    console.log(`  Test mode: generating only first ${limit}`);
  }

  const pass = students.filter(s => s.allPassed).length;
  const fail = students.length - pass;
  console.log(`  Pass: ${pass}, Fail/Absent: ${fail}`);

  console.log(`\nGenerating PDFs to: ${CONFIG.outputDir}`);
  const { generated, failed } = await generatePDFs(students);

  console.log(`\nDone! Generated: ${generated}, Failed: ${failed}`);
  console.log(`Output: ${CONFIG.outputDir}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
