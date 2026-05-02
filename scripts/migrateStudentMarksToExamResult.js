/**
 * Migration Script: Student Model Internal Marks → ExamResult
 *
 * Migrates internal marks from Student.academicDetails.subjects[].marks
 * into ExamResult documents, matched via RegularExamEnrollment records.
 *
 * Usage:
 *   node --experimental-vm-modules scripts/migrateStudentMarksToExamResult.js           # dry-run
 *   node --experimental-vm-modules scripts/migrateStudentMarksToExamResult.js --apply   # actual migration
 *
 * What it does:
 * 1. Finds all RegularExamEnrollments with linked subjects (subjectId != null)
 * 2. For each enrollment, looks up the student's marks on the Student model
 * 3. Resolves maxMarks from the Subject's markingScheme
 * 4. Creates or updates ExamResult documents with internal marks only
 * 5. Produces a detailed report with counts and skipped items
 *
 * Safety:
 * - Default mode is DRY-RUN (no DB writes, just logs what would happen)
 * - Pass --apply to actually write to DB
 * - Never overwrites existing ExamResult — only creates if missing
 * - Detailed logging of every skip, create, and error
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ─── Config ────────────────────────────────────────────────────
const DRY_RUN = !process.argv.includes("--apply");
const BATCH_SIZE = 200; // process enrollments in chunks

// ─── Models (inline to avoid import side-effects) ──────────────
// We import the models so Mongoose registers them, but we query via
// the model references to keep things clean.

import Student from "../models/studentModel.js";
import Subject from "../models/subjectModel.js";
import ExamResult from "../models/examResultModel.js";
import RegularExamEnrollment from "../models/regularExamEnrollmentModel.js";
import RegularExamSession from "../models/regularExamSessionModel.js";

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Extract internal components from a subject's markingScheme.
 * Mirrors the logic in examResultController.js getInternalComponents().
 */
function getInternalComponents(subject) {
  const internalScheme = subject?.markingScheme?.find(
    (s) => s.name?.toLowerCase() === "internal"
  );
  if (!internalScheme) return [];

  const validBreakdown = internalScheme.breakdown?.filter(
    (item) => item.value != null && item.value > 0
  );

  if (validBreakdown && validBreakdown.length > 0) {
    return validBreakdown.map((item) => ({
      name: item.name,
      maxMarks: item.value,
    }));
  }

  if (internalScheme.value != null) {
    return [{ name: "Internal", maxMarks: internalScheme.value }];
  }

  return [];
}

/**
 * Build MarkEntry array from student's legacy marks + subject's markingScheme.
 * Only includes internal components.
 */
function buildInternalMarkEntries(studentMarks, internalComponents) {
  if (!studentMarks || studentMarks.length === 0 || internalComponents.length === 0) {
    return [];
  }

  const marksMap = new Map(
    studentMarks.map((m) => [m.schemeName, m.obtainedMarks])
  );

  const entries = [];

  for (const comp of internalComponents) {
    const obtained = marksMap.get(comp.name);
    if (obtained == null) continue; // no mark for this component, skip

    entries.push({
      schemeName: comp.name,
      obtainedMarks: Number(obtained) || 0,
      maxMarks: comp.maxMarks,
    });
  }

  return entries;
}

// ─── Report tracking ───────────────────────────────────────────

const report = {
  sessionsProcessed: 0,
  enrollmentsScanned: 0,
  subjectsScanned: 0,
  created: 0,
  skippedAlreadyExists: 0,
  skippedNoStudentMarks: 0,
  skippedNoInternalComponents: 0,
  skippedSubjectNotLinked: 0,
  skippedSubjectNotFound: 0,
  skippedStudentNotFound: 0,
  skippedNoMarksToMigrate: 0,
  errors: [],
};

// ─── Main ──────────────────────────────────────────────────────

async function migrate() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Student Model → ExamResult Migration");
  console.log(`  Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY (writing to DB)"}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Connect
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_DB_URI);
  console.log("Connected.\n");

  // 1. Get all regular exam sessions
  const sessions = await RegularExamSession.find({}).lean();
  console.log(`Found ${sessions.length} regular exam sessions.\n`);

  // Pre-load all subjects into a map for fast lookup
  const allSubjects = await Subject.find({}).select("subjectName subjectCode markingScheme").lean();
  const subjectMap = new Map(allSubjects.map((s) => [s._id.toString(), s]));
  console.log(`Loaded ${allSubjects.length} subjects into memory.\n`);

  // 2. Process each session
  for (const session of sessions) {
    report.sessionsProcessed++;
    console.log(`\n──── Session: ${session.title} (${session.academicYear} - ${session.term}) ────`);

    // Get all enrollments for this session
    const totalEnrollments = await RegularExamEnrollment.countDocuments({
      examSessionId: session._id,
    });
    console.log(`  Enrollments: ${totalEnrollments}`);

    let processed = 0;

    // Process in batches to limit memory
    while (processed < totalEnrollments) {
      const enrollments = await RegularExamEnrollment.find({
        examSessionId: session._id,
      })
        .skip(processed)
        .limit(BATCH_SIZE)
        .lean();

      if (enrollments.length === 0) break;

      // Collect all student IDs in this batch for bulk fetch
      const studentIds = [...new Set(enrollments.map((e) => e.studentId.toString()))];
      const students = await Student.find({
        _id: { $in: studentIds },
      })
        .select("academicDetails.subjects name rollNumber")
        .populate("academicDetails.subjects.subject", "subjectName subjectCode markingScheme")
        .lean();

      const studentMap = new Map(students.map((s) => [s._id.toString(), s]));

      // Collect all existing ExamResults for this session to avoid per-doc queries
      const subjectIdsInBatch = new Set();
      for (const enr of enrollments) {
        for (const subj of enr.subjects || []) {
          if (subj.subjectId) subjectIdsInBatch.add(subj.subjectId.toString());
        }
      }

      const existingResults = await ExamResult.find({
        examSessionId: session._id,
        studentId: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) },
        subjectId: { $in: [...subjectIdsInBatch].map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select("studentId subjectId")
        .lean();

      // Build a set of "studentId-subjectId" keys for fast existence check
      const existingKeys = new Set(
        existingResults.map((r) => `${r.studentId.toString()}-${r.subjectId.toString()}`)
      );

      // Process each enrollment
      for (const enrollment of enrollments) {
        report.enrollmentsScanned++;
        const studentId = enrollment.studentId.toString();
        const student = studentMap.get(studentId);

        if (!student) {
          report.skippedStudentNotFound++;
          continue;
        }

        // Build a lookup of student's marks per subjectId
        const studentSubjectMarks = new Map();
        for (const subEntry of student.academicDetails?.subjects || []) {
          const subId = subEntry.subject?._id?.toString() || subEntry.subject?.toString();
          if (subId && subEntry.marks && subEntry.marks.length > 0) {
            studentSubjectMarks.set(subId, subEntry.marks);
          }
        }

        // Process each linked subject in the enrollment
        for (const enrolledSubject of enrollment.subjects || []) {
          report.subjectsScanned++;

          if (!enrolledSubject.subjectId) {
            report.skippedSubjectNotLinked++;
            continue;
          }

          const subjectId = enrolledSubject.subjectId.toString();
          const resultKey = `${studentId}-${subjectId}`;

          // Skip if ExamResult already exists
          if (existingKeys.has(resultKey)) {
            report.skippedAlreadyExists++;
            continue;
          }

          // Get subject details
          const subject = subjectMap.get(subjectId);
          if (!subject) {
            report.skippedSubjectNotFound++;
            continue;
          }

          // Get internal components from marking scheme
          const internalComponents = getInternalComponents(subject);
          if (internalComponents.length === 0) {
            report.skippedNoInternalComponents++;
            continue;
          }

          // Get student's legacy marks for this subject
          const legacyMarks = studentSubjectMarks.get(subjectId);
          if (!legacyMarks || legacyMarks.length === 0) {
            report.skippedNoStudentMarks++;
            continue;
          }

          // Build internal mark entries with maxMarks
          const markEntries = buildInternalMarkEntries(legacyMarks, internalComponents);
          if (markEntries.length === 0) {
            report.skippedNoMarksToMigrate++;
            continue;
          }

          // Build the ExamResult document
          const examResultDoc = {
            studentId: new mongoose.Types.ObjectId(studentId),
            subjectId: new mongoose.Types.ObjectId(subjectId),
            examSessionId: session._id,
            examSessionType: "RegularExamSession",
            examType: "regular",
            attemptNumber: 1,
            academicYear: session.academicYear,
            term: session.term,
            studentSnapshot: {
              rollNumber: enrollment.rollNumber || student.rollNumber || "",
              name: enrollment.studentName || student.name || "",
              batch: enrollment.batch || "",
              course: enrollment.course || "",
              pattern: enrollment.pattern || "",
            },
            marks: markEntries,
            status: "draft",
            enteredBy: null, // migration — no specific user
            enteredByType: "User",
            remarks: "Migrated from Student model",
          };

          if (DRY_RUN) {
            console.log(
              `  [DRY-RUN] Would create ExamResult: ` +
              `student=${enrollment.rollNumber || studentId}, ` +
              `subject=${subject.subjectName} (${subject.subjectCode || ""}), ` +
              `marks=[${markEntries.map((m) => `${m.schemeName}:${m.obtainedMarks}/${m.maxMarks}`).join(", ")}]`
            );
            report.created++;
          } else {
            try {
              const newResult = new ExamResult(examResultDoc);
              await newResult.save(); // triggers pre-save hook for totals/pass/fail
              report.created++;
            } catch (err) {
              // Handle duplicate key (race condition or stale cache)
              if (err.code === 11000) {
                report.skippedAlreadyExists++;
              } else {
                report.errors.push({
                  studentId,
                  subjectId,
                  sessionId: session._id.toString(),
                  error: err.message,
                });
                console.error(
                  `  [ERROR] student=${enrollment.rollNumber}, subject=${subject.subjectName}: ${err.message}`
                );
              }
            }
          }
        }
      }

      processed += enrollments.length;
      console.log(`  Processed ${processed}/${totalEnrollments} enrollments...`);
    }
  }

  // ─── Final Report ─────────────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════");
  console.log("  MIGRATION REPORT");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Mode:                        ${DRY_RUN ? "DRY-RUN" : "APPLIED"}`);
  console.log(`  Sessions processed:          ${report.sessionsProcessed}`);
  console.log(`  Enrollments scanned:         ${report.enrollmentsScanned}`);
  console.log(`  Subject slots scanned:       ${report.subjectsScanned}`);
  console.log("  ─────────────────────────────────────────────────────");
  console.log(`  ExamResults ${DRY_RUN ? "would create" : "created"}:    ${report.created}`);
  console.log(`  Skipped (already exists):    ${report.skippedAlreadyExists}`);
  console.log(`  Skipped (no student marks):  ${report.skippedNoStudentMarks}`);
  console.log(`  Skipped (no internal scheme):${report.skippedNoInternalComponents}`);
  console.log(`  Skipped (subject not linked):${report.skippedSubjectNotLinked}`);
  console.log(`  Skipped (subject not found): ${report.skippedSubjectNotFound}`);
  console.log(`  Skipped (student not found): ${report.skippedStudentNotFound}`);
  console.log(`  Skipped (no marks to write): ${report.skippedNoMarksToMigrate}`);
  console.log(`  Errors:                      ${report.errors.length}`);

  if (report.errors.length > 0) {
    console.log("\n  Error details:");
    for (const err of report.errors) {
      console.log(`    student=${err.studentId}, subject=${err.subjectId}, session=${err.sessionId}: ${err.error}`);
    }
  }

  console.log("═══════════════════════════════════════════════════════\n");

  if (DRY_RUN && report.created > 0) {
    console.log(`Run with --apply to actually create ${report.created} ExamResult documents.\n`);
  }
}

// ─── Run ───────────────────────────────────────────────────────

migrate()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
