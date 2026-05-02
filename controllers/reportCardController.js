import ReportCard from "../models/reportCardModel.js";
import Student from "../models/studentModel.js";
import subjectModel from "../models/subjectModel.js";
import gradeSchemeModel from "../models/gradeSchemeModel.js";
import { calculateGrade, calculateRemarks } from "../utils/gradeCalculator.js";

export const calculateSgpa = async (req, res) => {
  try {
    const { studentId } = req.params;

    const enforcePassFail = true;

    const student = await Student.findById(studentId).populate(
      "academicDetails.subjects.subject",
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const gradeScheme = await gradeSchemeModel.findOne({
      program: student.academicDetails.program,
    });

    if (!gradeScheme) {
      return res
        .status(400)
        .json({ message: "Grade scheme not found for this student's program" });
    }

    let totalCredits = 0;
    let totalGradePoints = 0;
    const subjectBreakdown = [];

    for (const subjectData of student.academicDetails.subjects) {
      const subject = subjectData.subject;
      if (!subject) continue;

      let totalObtained = subjectData.marks.reduce(
        (sum, mark) => sum + (Number(mark.obtainedMarks) || 0),
        0,
      );

      const internalComponents = subject.markingScheme.filter(
        (scheme) => scheme.name.toLowerCase() !== "external",
      );
      const externalScheme = subject.markingScheme.find(
        (scheme) => scheme.name.toLowerCase() === "external",
      );

      const internalMarks = internalComponents.reduce((sum, component) => {
        const mark = subjectData.marks.find(
          (m) => m.schemeName === component.name,
        );
        return sum + (Number(mark?.obtainedMarks) || 0);
      }, 0);

      const externalMarkData = subjectData.marks.find(
        (m) =>
          m.schemeName.toLowerCase() === "external" ||
          m.schemeName === externalScheme?.name,
      );

      let gradePoint = 0;
      let passed = true;

      if (enforcePassFail && externalMarkData) {
        const totalInternalMax = internalComponents.reduce(
          (sum, comp) => sum + (Number(comp.value) || 0),
          0,
        );
        const minInternalPass = totalInternalMax * 0.4;

        let externalMarks = Number(externalMarkData.obtainedMarks) || 0;
        const externalMax = Number(externalScheme?.value) || 0;
        const minExternalPass = externalMax * 0.4;
        let graceMarks = 0;

        if (
          externalMarks >= minExternalPass - 5 &&
          externalMarks < minExternalPass
        ) {
          graceMarks = minExternalPass - externalMarks;
          externalMarks += graceMarks;
          totalObtained += graceMarks;
        }

        if (
          internalMarks < minInternalPass ||
          externalMarks < minExternalPass
        ) {
          passed = false;
        }
      }

      const totalMaximum = subject.markingScheme.reduce(
        (sum, scheme) => sum + (Number(scheme.value) || 0),
        0,
      );
      const percentage =
        totalMaximum > 0 ? (totalObtained / totalMaximum) * 100 : 0;

      if (passed) {
        for (const grade of gradeScheme.grades) {
          if (percentage >= grade.rangeFrom && percentage <= grade.rangeTo) {
            gradePoint = parseFloat(grade.gradePoint) || 0;
            break;
          }
        }
      }

      const credits = parseFloat(subject.credits) || 0;
      totalCredits += credits;
      totalGradePoints += credits * gradePoint;

      subjectBreakdown.push({
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        credits,
        percentage: percentage.toFixed(2),
        gradePoint,
      });
    }

    const sgpa = totalCredits > 0 ? totalGradePoints / totalCredits : 0;

    res.status(200).json({
      sgpa: sgpa.toFixed(2),
      totalCredits,
      studentDetails: {
        name: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
        rollNumber: student.academicDetails.rollNumber,
        program: student.academicDetails.program,
      },
      subjectBreakdown,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const generateReportCard = async (req, res) => {
  try {
    const { studentId, semester, academicYear } = req.body;

    const student = await Student.findById(studentId).populate(
      "academicDetails.subjects.subject",
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (
      !student.academicDetails.subjects ||
      student.academicDetails.subjects.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "No subjects found for the student" });
    }

    const subjects = await Promise.all(
      student.academicDetails.subjects.map(async (subjectData) => {
        const subject = subjectData.subject;
        if (!subject) {
          return null;
        }
        const originalSubject = await subjectModel.findById(subject);
        if (!originalSubject) {
          return null;
        }
        const subjectMarks = {
          subject: subjectData._id,
          subjectName: originalSubject.subjectName || "Unknown Subject",
          subjectCode: originalSubject.subjectCode || "N/A",
          marks: [],
          totalObtained: 0,
          totalMaximum: 0,
        };

        subjectData.marks.forEach((mark) => {
          const schemeData = originalSubject.markingScheme?.find(
            (s) => s.name === mark.schemeName,
          );
          if (schemeData && mark.obtainedMarks !== undefined) {
            subjectMarks.marks.push({
              schemeName: mark.schemeName,
              obtainedMarks: Number(mark.obtainedMarks) || 0,
              maximumMarks: Number(schemeData.value) || 0,
            });
            subjectMarks.totalObtained += Number(mark.obtainedMarks) || 0;
            subjectMarks.totalMaximum += Number(schemeData.value) || 0;
          }
        });

        const percentage =
          subjectMarks.totalMaximum > 0
            ? (subjectMarks.totalObtained / subjectMarks.totalMaximum) * 100
            : 0;
        subjectMarks.grade = calculateGrade(percentage);

        return subjectMarks;
      }),
    );

    const validSubjects = subjects.filter((subject) => subject !== null);

    if (validSubjects.length === 0) {
      return res
        .status(400)
        .json({ message: "No valid subjects to generate report card" });
    }

    const totalObtained = validSubjects.reduce(
      (sum, subject) => sum + (subject.totalObtained || 0),
      0,
    );
    const totalMaximum = validSubjects.reduce(
      (sum, subject) => sum + (subject.totalMaximum || 0),
      0,
    );

    const percentage =
      totalMaximum > 0 ? (totalObtained / totalMaximum) * 100 : 0;
    const cgpa = percentage / 10;
    const studentName =
      student.studentDetails.firstName +
      " " +
      (student.studentDetails.middleName
        ? student.studentDetails.middleName + " "
        : "") +
      student.studentDetails.lastName;

    const reportCard = await ReportCard.create({
      student: {
        id: student._id,
        name: studentName,
        rollNumber: student.academicDetails.rollNumber,
        batch: student.academicDetails.batch.name || "N/A",
      },
      semester,
      academicYear,
      subjects: validSubjects,
      totalMarks: totalObtained || 0,
      percentage: Number(percentage.toFixed(2)) || 0,
      cgpa: Number(cgpa.toFixed(2)) || 0,
      remarks: calculateRemarks(cgpa),
    });

    res.status(201).json(reportCard);
  } catch (error) {
    console.error("Report Card Generation Error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getStudentReportCards = async (req, res) => {
  try {
    const { studentId } = req.params;
    const reportCards = await ReportCard.find({
      "student.id": studentId,
    });
    res.status(200).json(reportCards);
  } catch (error) {
    console.error("Error fetching report cards:", error);
    res.status(500).json({ message: error.message });
  }
};
