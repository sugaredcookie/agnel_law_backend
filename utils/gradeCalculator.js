export const calculateGrade = (percentage) => {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  return "F";
};

export const calculateRemarks = (cgpa) => {
  if (cgpa >= 9) return "Outstanding Performance";
  if (cgpa >= 8) return "Excellent Performance";
  if (cgpa >= 7) return "Very Good Performance";
  if (cgpa >= 6) return "Good Performance";
  if (cgpa >= 5) return "Average Performance";
  return "Need Improvement";
};

function getFinalGradeLocal(sgpa) {
  if (sgpa === null) return "F";
  if (sgpa >= 9.5) return "O";
  if (sgpa >= 8.5) return "A+";
  if (sgpa >= 7.5) return "A";
  if (sgpa >= 6.5) return "B+";
  if (sgpa >= 5.5) return "B";
  if (sgpa >= 4.5) return "C";
  if (sgpa >= 4.0) return "D";
  return "F";
}

/**
 * Strip empty elective subjects from student records.
 * When a student was manually added and optional/elective subject fields were
 * left blank, they may have been recorded as all-zeros (internal=0, external=0,
 * total=0). These phantom subjects should not appear in results at all.
 * Also recalculates student-level totals after stripping.
 */
export function stripEmptyElectives(students, configDoc) {
  const electiveCodes = new Set(
    (configDoc.subjects || [])
      .filter((s) => s.elective)
      .map((s) => Number(s.code))
  );
  if (electiveCodes.size === 0) return;

  for (const student of students) {
    const before = student.subjects?.length || 0;
    if (!student.subjects) continue;

    student.subjects = student.subjects.filter((s) => {
      if (!electiveCodes.has(Number(s.code))) return true; // keep non-electives
      // Keep if student actually has marks or is absent
      const hasMarks =
        (typeof s.internal === "number" && s.internal > 0) ||
        (typeof s.external === "number" && s.external > 0) ||
        (typeof s.total === "number" && s.total > 0);
      const isAbsent = s.isAbsent || s.internalAbsent || s.externalAbsent;
      return hasMarks || isAbsent;
    });

    // Recalculate totals if subjects were removed
    if (student.subjects.length !== before) {
      let totalMarksObt = 0, totalCG = 0, totalCredits = 0, totalEarned = 0;
      for (const s of student.subjects) {
        totalMarksObt += typeof s.total === "number" ? s.total : 0;
        totalCG += s.cg || 0;
        totalCredits += s.credit || 0;
        totalEarned += s.earned || 0;
      }
      if (student.practical) {
        totalMarksObt += student.practical.total || 0;
        totalCG += student.practical.cg || 0;
        totalCredits += student.practical.credit || 0;
        totalEarned += student.practical.earned || 0;
      }
      student.totalMarksObt = totalMarksObt;
      student.totalCG = totalCG;
      student.totalCredits = totalCredits;
      student.totalEarned = totalEarned;
      student.sgpa = totalCredits > 0 ? parseFloat((totalCG / totalCredits).toFixed(2)) : null;
      student.finalGrade = getFinalGradeLocal(student.sgpa);
      student.allPassed = student.subjects.every((s) => s.passed) &&
        (student.practical ? student.practical.passed : true);
      const hasAbsent = student.subjects.some((s) => s.isAbsent);
      student.remark = hasAbsent ? "ABSENT" : student.allPassed ? "SUCCESSFUL" : "UNSUCCESSFUL";
    }
  }
}
