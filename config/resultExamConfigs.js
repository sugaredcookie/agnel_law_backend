/**
 * Exam Configuration Registry
 *
 * Each entry represents ONE sheet from ONE Excel file for a specific
 * (programme + semester + exam-session + exam-type) combination.
 *
 * To add a new exam: copy an existing config, change the values, and
 * give it a unique ID key. The system auto-discovers everything else.
 *
 * Config ID convention: {prog}-sem{N}-{session}-{type}
 *   prog    = fy-llb | sy-llb | ty-llb
 *   N       = semester number (1-6)
 *   session = oct2024 | jan2024 | apr2025 etc.
 *   type    = regular | reval | atkt
 */

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXCEL_DIR = path.join(__dirname, "..", "uploads", "excel");

// ─── Shared Constants ─────────────────────────────────────────────────────

const THEORY_LIMITS_25_75 = { maxI: 25, minI: 10, maxE: 75, minE: 30, maxT: 100, minT: 40 };
const THEORY_LIMITS_10_30 = { maxI: 10, minI: 4, maxE: 30, minE: 12, maxT: 40, minT: 16 };

const SEM1_SUBJECTS = [
  { code: 1, name: "Legal Language", credit: 4 },
  { code: 2, name: "Law of Torts, Motor Accident Claims and Consumer Protection", credit: 4 },
  { code: 3, name: "Law of Contract and Specific Relief", credit: 4 },
  { code: 4, name: "Labour Law & Industrial Relations - I", credit: 4 },
];

const SEM1_SUBJECTS_ALT_ORDER = [
  { code: 1, name: "Labour Law & Industrial Relations - I", credit: 4 },
  { code: 2, name: "Law of Torts, Motor Accident Claims and Consumer Protection", credit: 4 },
  { code: 3, name: "Law of Contract and Specific Relief", credit: 4 },
  { code: 4, name: "Legal Language", credit: 4 },
];

const SEM2_SUBJECTS = [
  { code: 1, name: "Law of Crimes", credit: 4 },
  { code: 2, name: "Constitutional Law - I", credit: 4 },
  { code: 3, name: "Family Law - I", credit: 4 },
  { code: 4, name: "Environmental Law", credit: 4 },
];

const SEM3_SUBJECTS = [
  { code: 1, name: "Administrative Law", credit: 4 },
  { code: 2, name: "Company Law", credit: 4 },
  { code: 3, name: "Family Law - II", credit: 4 },
  { code: 4, name: "Transfer of Property", credit: 4 },
];

const SEM4_SUBJECTS = [
  { code: 1, name: "Jurisprudence / Legal Theory", credit: 4 },
  { code: 2, name: "Contract - II", credit: 4 },
  { code: 3, name: "Constitutional Law - II", credit: 4 },
  { code: 4, name: "Criminology and Penology", credit: 4, elective: true },
  { code: 5, name: "Bankruptcy Laws", credit: 4, elective: true },
  { code: 6, name: "Human Rights Law", credit: 4, elective: true },
];

// ─── BA LLB Subject Constants ─────────────────────────────────────────────

const BA_LLB_SEM1_SUBJECTS = [
  { code: 1, name: "English - I", credit: 4 },
  { code: 2, name: "Logic - I", credit: 4 },
  { code: 3, name: "Economics", credit: 4 },
];

// TYBALLB files use a different subject order
const BA_LLB_SEM1_SUBJECTS_ALT = [
  { code: 1, name: "English - I", credit: 4 },
  { code: 2, name: "Economics", credit: 4 },
  { code: 3, name: "Logic - I", credit: 4 },
];

const BA_LLB_SEM2_SUBJECTS = [
  { code: 1, name: "History", credit: 4 },
  { code: 2, name: "Legal Language & Writing", credit: 4 },
  { code: 3, name: "Political Science - I", credit: 4 },
];

const BA_LLB_SEM3_SUBJECTS = [
  { code: 1, name: "Political Science - II", credit: 4 },
  { code: 2, name: "Sociology", credit: 4 },
  { code: 3, name: "History of Courts", credit: 4 },
];

const BA_LLB_SEM4_SUBJECTS = [
  { code: 1, name: "English - II", credit: 4 },
  { code: 2, name: "Logic - II", credit: 4 },
  { code: 3, name: "Political Science - III", credit: 4 },
];

// ─── Helper: auto-assign I/E column positions from subjectStartCol ──────

function assignSubjectCols(subjects, startCol) {
  return subjects.map((s, i) => ({
    ...s,
    iCol: startCol + i * 3,
    eCol: startCol + i * 3 + 1,
  }));
}

// 4-column spacing for sheets with an extra GP/grade column per subject
function assignSubjectCols4(subjects, startCol) {
  return subjects.map((s, i) => ({
    ...s,
    iCol: startCol + i * 4,
    eCol: startCol + i * 4 + 1,
  }));
}

// ─── Configurations ─────────────────────────────────────────────────────────

const EXAM_CONFIGS = {

  // ═══════════════════════════════════════════════════════════════════════════
  // FY LLB SEM 1 — October 2024 (current live data, FORMAT A)
  // ═══════════════════════════════════════════════════════════════════════════

  "fy-llb-sem1-oct2024-regular": {
    label: "FY LLB Semester I - October 2024 (Regular)",
    programme: "FIRST YEAR LL.B. (THREE YEAR COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "regular",
    resultDeclaredOn: "11.03.2025",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "FY LLB SEM 1.xlsx"),
    sheet: 0,
    dataStartRow: 7,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: 4,
      grandTotal: 18,
      remarks: 20,
      prn: 22,
    },

    subjects: assignSubjectCols(SEM1_SUBJECTS, 5),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "Practical Training - I",
      type: "single",
      col: 17,
      max: 100,
      min: 40,
      credit: 4,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FY LLB SEM 1 — January 2024 (older session, FORMAT B)
  // File: "FY LLB SEM 1 and Reval to be Printed (1).xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "fy-llb-sem1-jan2024-regular": {
    label: "FY LLB Semester I - January 2024 (Regular)",
    programme: "FIRST YEAR LL.B. (THREE YEAR COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2023-2024",
    examMonth: "JANUARY 2024",
    examType: "regular",
    resultDeclaredOn: "28.03.2024",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "FY LLB SEM 1 and Reval to be Printed.xlsx"),
    sheet: "Regular1",
    dataStartRow: 8,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: 1,
      grandTotal: 19,
      remarks: 20,
      prn: 21,
    },

    subjects: assignSubjectCols(SEM1_SUBJECTS_ALT_ORDER, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "Practical Training - I",
      type: "split",
      iCol: 16,
      eCol: 17,
      tCol: 18,
      maxI: 30,
      minI: 9,
      maxE: 70,
      minE: 21,
      max: 100,
      min: 30,
      credit: 4,
    },

    remarkMap: { P: "pass", F: "fail" },
  },

  "fy-llb-sem1-jan2024-reval": {
    label: "FY LLB Semester I - January 2024 (Revaluation)",
    programme: "FIRST YEAR LL.B. (THREE YEAR COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2023-2024",
    examMonth: "JANUARY 2024",
    examType: "reval",
    resultDeclaredOn: "12.03.2024",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "FY LLB SEM 1 and Reval to be Printed.xlsx"),
    sheet: "Reval",
    dataStartRow: 8,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: null,
      grandTotal: 19,
      remarks: 20,
      prn: 21,
    },

    subjects: assignSubjectCols(SEM1_SUBJECTS_ALT_ORDER, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "Practical Training - I",
      type: "split",
      iCol: 16,
      eCol: 17,
      tCol: 18,
      maxI: 30,
      minI: 9,
      maxE: 70,
      minE: 21,
      max: 100,
      min: 30,
      credit: 4,
    },

    remarkMap: { P: "pass", F: "fail" },
  },

  "fy-llb-sem1-jan2024-atkt": {
    label: "FY LLB Semester I - January 2024 (ATKT)",
    programme: "FIRST YEAR LL.B. (THREE YEAR COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2023-2024",
    examMonth: "JANUARY 2024",
    examType: "atkt",
    resultDeclaredOn: "28.03.2024",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "FY LLB SEM 1 and Reval to be Printed.xlsx"),
    sheet: "ATKT",
    dataStartRow: 8,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: null,
      grandTotal: 19,
      remarks: 20,
      prn: 21,
    },

    subjects: assignSubjectCols(SEM1_SUBJECTS_ALT_ORDER, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "Practical Training - I",
      type: "split",
      iCol: 16,
      eCol: 17,
      tCol: 18,
      maxI: 30,
      minI: 9,
      maxE: 70,
      minE: 21,
      max: 100,
      min: 30,
      credit: 4,
    },

    remarkMap: { P: "pass", F: "fail" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FY LLB SEM 2 (FORMAT C — data starts R5, min-only header)
  // File: "TY LLB (FY LLB SEM 2).xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "fy-llb-sem2-regular": {
    label: "FY LLB Semester II (Regular)",
    programme: "FIRST YEAR LL.B. (THREE YEAR COURSE)",
    semester: "II",
    semesterNumber: 2,
    year: "2024-2025",
    examMonth: "APRIL 2025",
    examType: "regular",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "TY LLB (FY LLB SEM 2).xlsx"),
    sheet: "Regular",
    dataStartRow: 5,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: null,
      grandTotal: 19,
      remarks: 20,
      prn: 21,
    },

    subjects: assignSubjectCols(SEM2_SUBJECTS, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "D.P.C. - I (Practical)",
      type: "split",
      iCol: 16,
      eCol: 17,
      tCol: 18,
      maxI: 30,
      minI: 9,
      maxE: 70,
      minE: 21,
      max: 100,
      min: 40,
      credit: 4,
    },
  },

  "fy-llb-sem2-reval": {
    label: "FY LLB Semester II (Revaluation)",
    programme: "FIRST YEAR LL.B. (THREE YEAR COURSE)",
    semester: "II",
    semesterNumber: 2,
    year: "2024-2025",
    examMonth: "APRIL 2025",
    examType: "reval",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "TY LLB (FY LLB SEM 2).xlsx"),
    sheet: "Reval",
    dataStartRow: 5,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: null,
      grandTotal: 19,
      remarks: 20,
      prn: 21,
    },

    subjects: assignSubjectCols(SEM2_SUBJECTS, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "D.P.C. - I (Practical)",
      type: "split",
      iCol: 16,
      eCol: 17,
      tCol: 18,
      maxI: 30,
      minI: 9,
      maxE: 70,
      minE: 21,
      max: 100,
      min: 40,
      credit: 4,
    },
  },

  "fy-llb-sem2-atkt": {
    label: "FY LLB Semester II (ATKT)",
    programme: "FIRST YEAR LL.B. (THREE YEAR COURSE)",
    semester: "II",
    semesterNumber: 2,
    year: "2024-2025",
    examMonth: "APRIL 2025",
    examType: "atkt",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "TY LLB (FY LLB SEM 2).xlsx"),
    sheet: "ATKT",
    dataStartRow: 5,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: null,
      grandTotal: 19,
      remarks: 20,
      prn: null,
    },

    subjects: assignSubjectCols(SEM2_SUBJECTS, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "D.P.C. - I (Practical)",
      type: "split",
      iCol: 16,
      eCol: 17,
      tCol: 18,
      maxI: 30,
      minI: 9,
      maxE: 70,
      minE: 21,
      max: 100,
      min: 40,
      credit: 4,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SY LLB SEM 3 (FORMAT D — data starts R6, single-col practical)
  // File: "TY LLB (SYLLB SEM 3).xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "sy-llb-sem3-regular": {
    label: "SY LLB Semester III (Regular)",
    programme: "SECOND YEAR LL.B. (THREE YEAR COURSE)",
    semester: "III",
    semesterNumber: 3,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "regular",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "TY LLB (SYLLB SEM 3).xlsx"),
    sheet: "Regular",
    dataStartRow: 6,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: 1,
      grandTotal: 17,
      remarks: 18,
      prn: 19,
    },

    subjects: assignSubjectCols(SEM3_SUBJECTS, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "Practical Training - II",
      type: "single",
      col: 16,
      max: 100,
      min: 40,
      credit: 4,
    },
  },

  "sy-llb-sem3-reval": {
    label: "SY LLB Semester III (Revaluation)",
    programme: "SECOND YEAR LL.B. (THREE YEAR COURSE)",
    semester: "III",
    semesterNumber: 3,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "reval",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "TY LLB (SYLLB SEM 3).xlsx"),
    sheet: "Reval",
    dataStartRow: 6,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: 1,
      grandTotal: 17,
      remarks: 18,
      prn: 19,
    },

    subjects: assignSubjectCols(SEM3_SUBJECTS, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "Practical Training - II",
      type: "single",
      col: 16,
      max: 100,
      min: 40,
      credit: 4,
    },
  },

  "sy-llb-sem3-atkt": {
    label: "SY LLB Semester III (ATKT)",
    programme: "SECOND YEAR LL.B. (THREE YEAR COURSE)",
    semester: "III",
    semesterNumber: 3,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "atkt",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "TY LLB (SYLLB SEM 3).xlsx"),
    sheet: "ATKT",
    dataStartRow: 6,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: 1,
      grandTotal: 17,
      remarks: 18,
      prn: 19,
    },

    subjects: assignSubjectCols(SEM3_SUBJECTS, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 5,
      name: "Practical Training - II",
      type: "single",
      col: 16,
      max: 100,
      min: 40,
      credit: 4,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SY LLB SEM 4 — 3 core + 1-of-3 elective + D.P.C. II
  // File: "SY LLB SEM 4.xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "sy-llb-sem4-regular": {
    label: "SY LLB Semester IV (Regular)",
    programme: "SECOND YEAR LL.B. (THREE YEAR COURSE)",
    semester: "IV",
    semesterNumber: 4,
    year: "2024-2025",
    examMonth: "APRIL 2025",
    examType: "regular",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "SY LLB SEM 4.xlsx"),
    sheet: "Regular",
    dataStartRow: 5,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: 1,
      grandTotal: 23,
      remarks: 24,
      prn: 25,
    },

    subjects: assignSubjectCols(SEM4_SUBJECTS, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 7,
      name: "D.P.C. - II",
      type: "single",
      col: 22,
      max: 100,
      min: 40,
      credit: 4,
    },
  },

  "sy-llb-sem4-atkt": {
    label: "SY LLB Semester IV (ATKT)",
    programme: "SECOND YEAR LL.B. (THREE YEAR COURSE)",
    semester: "IV",
    semesterNumber: 4,
    year: "2024-2025",
    examMonth: "APRIL 2025",
    examType: "atkt",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 6,

    file: path.join(EXCEL_DIR, "SY LLB SEM 4.xlsx"),
    sheet: "ATKT",
    dataStartRow: 5,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 3,
      grNo: null,
      grandTotal: 23,
      remarks: 24,
      prn: 25,
    },

    subjects: assignSubjectCols(SEM4_SUBJECTS, 4),
    limits: THEORY_LIMITS_25_75,

    practical: {
      code: 7,
      name: "D.P.C. - II",
      type: "single",
      col: 22,
      max: 100,
      min: 40,
      credit: 4,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FY BA LLB SEM 1 — Current batch (AY 2024-2025)
  // File: "FY BA LLB sem 1.xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "fy-ballb-sem1-oct2024-regular": {
    label: "FY BA LLB Semester I - October 2024 (Regular)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "regular",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "FY BA LLB sem 1.xlsx"),
    sheet: "Regular",
    dataStartRow: 6,

    columns: {
      studentId: null,
      name: 1,
      rollNo: 3,
      grNo: 2,
      grandTotal: 15,
      remarks: 17,
      prn: 4,
    },

    subjects: assignSubjectCols(BA_LLB_SEM1_SUBJECTS, 6),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "fy-ballb-sem1-oct2024-reval": {
    label: "FY BA LLB Semester I - October 2024 (Revaluation)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "reval",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "FY BA LLB sem 1.xlsx"),
    sheet: "Reval",
    dataStartRow: 6,

    columns: {
      studentId: null,
      name: 1,
      rollNo: 4,
      grNo: 2,
      grandTotal: 14,
      remarks: 16,
      prn: 3,
    },

    subjects: assignSubjectCols(BA_LLB_SEM1_SUBJECTS, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "fy-ballb-sem1-oct2024-atkt": {
    label: "FY BA LLB Semester I - October 2024 (ATKT)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "atkt",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "FY BA LLB sem 1.xlsx"),
    sheet: "Atkt",
    dataStartRow: 6,

    columns: {
      studentId: null,
      name: 1,
      rollNo: 2,
      grNo: 3,
      grandTotal: 14,
      remarks: 15,
      prn: 4,
    },

    subjects: assignSubjectCols(BA_LLB_SEM1_SUBJECTS, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FY BA LLB SEM 2 — Current batch (AY 2024-2025)
  // File: "FY BALLB SEM II.xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "fy-ballb-sem2-apr2025-regular": {
    label: "FY BA LLB Semester II - April 2025 (Regular)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "II",
    semesterNumber: 2,
    year: "2024-2025",
    examMonth: "APRIL 2025",
    examType: "regular",
    resultDeclaredOn: "28.06.2025",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "FY BALLB SEM II.xlsx"),
    sheet: "Regular",
    dataStartRow: 5,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 4,
      grNo: 3,
      grandTotal: 19,
      remarks: 20,
      prn: 5,
    },

    // 4-col spacing (I, E, T, formula per subject)
    subjects: assignSubjectCols4(BA_LLB_SEM2_SUBJECTS, 7),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "fy-ballb-sem2-apr2025-reval": {
    label: "FY BA LLB Semester II - April 2025 (Revaluation)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "II",
    semesterNumber: 2,
    year: "2024-2025",
    examMonth: "APRIL 2025",
    examType: "reval",
    resultDeclaredOn: "28.06.2025",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "FY BALLB SEM II.xlsx"),
    sheet: "Reval",
    dataStartRow: 5,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 5,
      grNo: 3,
      grandTotal: 15,
      remarks: 16,
      prn: 4,
    },

    subjects: assignSubjectCols(BA_LLB_SEM2_SUBJECTS, 6),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "fy-ballb-sem2-apr2025-atkt": {
    label: "FY BA LLB Semester II - April 2025 (ATKT)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "II",
    semesterNumber: 2,
    year: "2024-2025",
    examMonth: "APRIL 2025",
    examType: "atkt",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "FY BALLB SEM II.xlsx"),
    sheet: "ATKT",
    dataStartRow: 5,

    columns: {
      studentId: 2,
      name: 3,
      rollNo: 4,
      grNo: 5,
      grandTotal: 16,
      remarks: 17,
      prn: 6,
    },

    subjects: assignSubjectCols(BA_LLB_SEM2_SUBJECTS, 7),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FY BA LLB SEM 1 — Older batch (AY 2023-2024, TY students retaking)
  // File: "TYBALLB(FY BA LLB sem 1).xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "fy-ballb-sem1-oct2023-regular": {
    label: "FY BA LLB Semester I - October 2023 (Regular)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2023-2024",
    examMonth: "OCTOBER 2023",
    examType: "regular",
    resultDeclaredOn: "20.03.2024",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(FY BA LLB sem 1).xlsx"),
    sheet: "REgular",
    dataStartRow: 8,

    columns: {
      studentId: null,
      name: 2,
      rollNo: 1,
      grNo: 3,
      grandTotal: 14,
      remarks: 15,
      prn: 4,
    },

    subjects: assignSubjectCols(BA_LLB_SEM1_SUBJECTS_ALT, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "fy-ballb-sem1-oct2023-reval": {
    label: "FY BA LLB Semester I - October 2023 (Revaluation)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2023-2024",
    examMonth: "OCTOBER 2023",
    examType: "reval",
    resultDeclaredOn: "20.03.2024",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(FY BA LLB sem 1).xlsx"),
    sheet: "Reval",
    dataStartRow: 6,

    columns: {
      studentId: null,
      name: 3,
      rollNo: 1,
      grNo: null,
      grandTotal: 14,
      remarks: 15,
      prn: 2,
    },

    subjects: assignSubjectCols(BA_LLB_SEM1_SUBJECTS_ALT, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "fy-ballb-sem1-oct2023-atkt": {
    label: "FY BA LLB Semester I - October 2023 (ATKT)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "I",
    semesterNumber: 1,
    year: "2023-2024",
    examMonth: "OCTOBER 2023",
    examType: "atkt",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(FY BA LLB sem 1).xlsx"),
    sheet: "ATKT",
    dataStartRow: 7,

    columns: {
      studentId: null,
      name: 2,
      rollNo: 1,
      grNo: 3,
      grandTotal: 14,
      remarks: 15,
      prn: 4,
    },

    subjects: assignSubjectCols(BA_LLB_SEM1_SUBJECTS_ALT, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FY BA LLB SEM 2 — Older batch (AY 2023-2024, TY students retaking)
  // File: "TYBALLB(FY BA LLB SEM II).xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "fy-ballb-sem2-apr2024-regular": {
    label: "FY BA LLB Semester II - April 2024 (Regular)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "II",
    semesterNumber: 2,
    year: "2023-2024",
    examMonth: "APRIL 2024",
    examType: "regular",
    resultDeclaredOn: "20.07.2024",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(FY BA LLB SEM II).xlsx"),
    sheet: "Regular",
    dataStartRow: 5,

    columns: {
      studentId: null,
      name: 1,
      rollNo: 4,
      grNo: 2,
      grandTotal: 17,
      remarks: 18,
      prn: 3,
    },

    // 4-col spacing (I, E, T, GP per subject)
    subjects: assignSubjectCols4(BA_LLB_SEM2_SUBJECTS, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "fy-ballb-sem2-apr2024-reval": {
    label: "FY BA LLB Semester II - April 2024 (Revaluation)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "II",
    semesterNumber: 2,
    year: "2023-2024",
    examMonth: "APRIL 2024",
    examType: "reval",
    resultDeclaredOn: "20.07.2024",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(FY BA LLB SEM II).xlsx"),
    sheet: "Reval",
    dataStartRow: 5,

    columns: {
      studentId: null,
      name: 1,
      rollNo: 4,
      grNo: 2,
      grandTotal: 17,
      remarks: 18,
      prn: 3,
    },

    subjects: assignSubjectCols4(BA_LLB_SEM2_SUBJECTS, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "fy-ballb-sem2-apr2024-atkt": {
    label: "FY BA LLB Semester II - April 2024 (ATKT)",
    programme: "FIRST YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "II",
    semesterNumber: 2,
    year: "2023-2024",
    examMonth: "APRIL 2024",
    examType: "atkt",
    resultDeclaredOn: "20.07.2024",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(FY BA LLB SEM II).xlsx"),
    sheet: "ATKT",
    dataStartRow: 5,

    columns: {
      studentId: null,
      name: 1,
      rollNo: 4,
      grNo: 2,
      grandTotal: 14,
      remarks: 15,
      prn: 3,
    },

    subjects: assignSubjectCols(BA_LLB_SEM2_SUBJECTS, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SY BA LLB SEM 3 (AY 2024-2025)
  // File: "TYBALLB(SY BA LLB-SEM III).xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "sy-ballb-sem3-oct2024-regular": {
    label: "SY BA LLB Semester III - October 2024 (Regular)",
    programme: "SECOND YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "III",
    semesterNumber: 3,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "regular",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(SY BA LLB-SEM III).xlsx"),
    sheet: "Regular",
    dataStartRow: 6,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 5,
      grNo: 3,
      grandTotal: 15,
      remarks: 17,
      prn: 4,
    },

    subjects: assignSubjectCols(BA_LLB_SEM3_SUBJECTS, 6),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "sy-ballb-sem3-oct2024-reval": {
    label: "SY BA LLB Semester III - October 2024 (Revaluation)",
    programme: "SECOND YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "III",
    semesterNumber: 3,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "reval",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(SY BA LLB-SEM III).xlsx"),
    sheet: "Reval",
    dataStartRow: 6,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 5,
      grNo: 3,
      grandTotal: 15,
      remarks: 17,
      prn: 4,
    },

    subjects: assignSubjectCols(BA_LLB_SEM3_SUBJECTS, 6),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "sy-ballb-sem3-oct2024-atkt": {
    label: "SY BA LLB Semester III - October 2024 (ATKT)",
    programme: "SECOND YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "III",
    semesterNumber: 3,
    year: "2024-2025",
    examMonth: "OCTOBER 2024",
    examType: "atkt",
    resultDeclaredOn: "17.05.2025",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(SY BA LLB-SEM III).xlsx"),
    sheet: "Atkt",
    dataStartRow: 5,

    columns: {
      studentId: 1,
      name: 2,
      rollNo: 5,
      grNo: 3,
      grandTotal: 15,
      remarks: 17,
      prn: 4,
    },

    subjects: assignSubjectCols(BA_LLB_SEM3_SUBJECTS, 6),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SY BA LLB SEM 4 (AY 2024-2025)
  // File: "TYBALLB(SY BALL Sem IV) .xlsx"
  // ═══════════════════════════════════════════════════════════════════════════

  "sy-ballb-sem4-apr2025-regular": {
    label: "SY BA LLB Semester IV - April 2025 (Regular)",
    programme: "SECOND YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "IV",
    semesterNumber: 4,
    year: "2024-2025",
    examMonth: "APRIL 2025",
    examType: "regular",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(SY BALL Sem IV) .xlsx"),
    sheet: "REGULAR",
    dataStartRow: 6,

    columns: {
      studentId: null,
      name: 1,
      rollNo: 4,
      grNo: 2,
      grandTotal: 17,
      remarks: 18,
      prn: 3,
    },

    // 4-col spacing (I, E, T, GP per subject)
    subjects: assignSubjectCols4(BA_LLB_SEM4_SUBJECTS, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },

  "sy-ballb-sem4-apr2025-atkt": {
    label: "SY BA LLB Semester IV - April 2025 (ATKT)",
    programme: "SECOND YEAR B.A. LL.B. (FIVE YEAR LAW COURSE)",
    semester: "IV",
    semesterNumber: 4,
    year: "2024-2025",
    examMonth: "NOVEMBER 2025",
    examType: "atkt",
    resultDeclaredOn: "",
    place: "Mumbai",
    totalSemesters: 10,

    file: path.join(EXCEL_DIR, "TYBALLB(SY BALL Sem IV) .xlsx"),
    sheet: "ATKT",
    dataStartRow: 6,

    columns: {
      studentId: null,
      name: 1,
      rollNo: 3,
      grNo: 2,
      grandTotal: 14,
      remarks: 15,
      prn: 4,
    },

    subjects: assignSubjectCols(BA_LLB_SEM4_SUBJECTS, 5),
    limits: THEORY_LIMITS_25_75,
    practical: null,
  },
};

// ─── Lookup Helpers ────────────────────────────────────────────────────────

export function getConfig(configId) {
  return EXAM_CONFIGS[configId] || null;
}

export function getAllConfigIds() {
  return Object.keys(EXAM_CONFIGS);
}

export function getAllConfigs() {
  return Object.values(EXAM_CONFIGS);
}

export function listConfigs() {
  return Object.entries(EXAM_CONFIGS).map(([id, cfg]) => ({
    id,
    label: cfg.label,
    programme: cfg.programme,
    semester: cfg.semester,
    semesterNumber: cfg.semesterNumber,
    year: cfg.year,
    examMonth: cfg.examMonth,
    examType: cfg.examType,
  }));
}

export default EXAM_CONFIGS;
