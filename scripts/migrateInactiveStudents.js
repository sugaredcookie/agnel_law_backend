import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Student from "../models/studentModel.js";
import ArchivedStudent from "../models/archivedStudentModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI = process.env.MONGO_DB_URI;

if (!MONGODB_URI) {
  console.error("MONGO_DB_URI not found in .env file");
  process.exit(1);
}

// Migration script to move inactive students to ArchivedStudent collection
const migrateInactiveStudents = async () => {
  try {
    console.log("INACTIVE STUDENTS MIGRATION");
    console.log("=".repeat(70));
    console.log("This script will migrate all inactive and graduated students");
    console.log("from the Student collection to the ArchivedStudent collection");
    console.log("=".repeat(70) + "\n");

    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB\n");

    // Get counts before migration
    const totalStudents = await Student.countDocuments({});
    const activeStudents = await Student.countDocuments({ status: "active" });
    const inactiveStudents = await Student.countDocuments({ status: "inactive" });
    const graduatedStudents = await Student.countDocuments({ status: "graduated" });
    const existingArchived = await ArchivedStudent.countDocuments({});

    console.log("Current Database State:");
    console.log(`   Total Students: ${totalStudents}`);
    console.log(`   Active: ${activeStudents}`);
    console.log(`   Inactive: ${inactiveStudents}`);
    console.log(`   Graduated: ${graduatedStudents}`);
    console.log(`   Already Archived: ${existingArchived}`);
    console.log("");

    const toMigrate = inactiveStudents + graduatedStudents;
    if (toMigrate === 0) {
      console.log("No inactive or graduated students to migrate!");
      await mongoose.disconnect();
      return;
    }

    console.log(`Students to migrate: ${toMigrate}`);
    console.log("=".repeat(70) + "\n");

    // Find all inactive and graduated students
    const studentsToArchive = await Student.find({
      status: { $in: ["inactive", "graduated"] },
    });

    const stats = {
      total: studentsToArchive.length,
      migrated: 0,
      skipped: 0,
      errors: 0,
      byReason: {
        inactive: { total: 0, migrated: 0 },
        graduated: { total: 0, migrated: 0 },
      },
    };

    console.log("Starting migration...\n");

    for (let i = 0; i < studentsToArchive.length; i++) {
      const student = studentsToArchive[i];
      const archiveReason = student.status === "graduated" ? "graduated" : "inactive";

      stats.byReason[archiveReason].total++;

      try {
        // Check if already archived (by original student ID or roll number)
        const existingArchive = await ArchivedStudent.findOne({
          $or: [
            { originalStudentId: student._id },
            { "academicDetails.rollNumber": student.academicDetails?.rollNumber },
          ],
        });

        if (existingArchive) {
          console.log(`Skipping ${student.academicDetails?.rollNumber || student._id} - already archived`);
          stats.skipped++;
          continue;
        }

        // Create archived student record
        const archivedStudentData = {
          originalStudentId: student._id,
          archiveReason: archiveReason,
          archiveNote: `Migrated from legacy ${student.status} status`,
          archivedAt: new Date(),
          archivedBy: null, // System migration

          // Copy all student data
          studentDetails: student.studentDetails,
          familyBackground: student.familyBackground,
          originalStatus: student.status,
          academicDetails: student.academicDetails,
          certificates: student.certificates,
          studentId: student.studentId,
          loginStudentId: student.loginStudentId,
          password: student.password,
          originalCreatedAt: student.createdAt,
          originalUpdatedAt: student.updatedAt,
        };

        const archivedStudent = new ArchivedStudent(archivedStudentData);
        await archivedStudent.save();

        // Delete from active students collection
        await Student.findByIdAndDelete(student._id);

        stats.migrated++;
        stats.byReason[archiveReason].migrated++;

        if ((i + 1) % 50 === 0 || i === studentsToArchive.length - 1) {
          console.log(`Progress: ${i + 1}/${studentsToArchive.length} students processed...`);
        }
      } catch (error) {
        stats.errors++;
        console.error(`Error migrating student ${student._id}: ${error.message}`);
      }
    }

    // Final report
    console.log("\n" + "=".repeat(70));
    console.log("MIGRATION COMPLETE");
    console.log("=".repeat(70));
    console.log(`\nOverall Statistics:`);
    console.log(`   Total Processed: ${stats.total}`);
    console.log(`   Migrated: ${stats.migrated}`);
    console.log(`   Skipped (already archived): ${stats.skipped}`);
    console.log(`   Errors: ${stats.errors}`);

    console.log(`\nBy Reason:`);
    console.log(`   Inactive: ${stats.byReason.inactive.migrated}/${stats.byReason.inactive.total}`);
    console.log(`   Graduated: ${stats.byReason.graduated.migrated}/${stats.byReason.graduated.total}`);

    // Verification
    const finalArchivedCount = await ArchivedStudent.countDocuments({});
    const finalStudentCount = await Student.countDocuments({});
    const finalActiveCount = await Student.countDocuments({ status: "active" });

    console.log(`\nDatabase Verification:`);
    console.log(`   Students remaining: ${finalStudentCount}`);
    console.log(`   Active students: ${finalActiveCount}`);
    console.log(`   Total archived: ${finalArchivedCount}`);

    if (stats.errors === 0) {
      console.log("\nMigration completed successfully!");
    } else {
      console.log("\nMigration completed with some errors - review above");
    }

    console.log("\n" + "=".repeat(70));

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB\n");
  } catch (error) {
    console.error("\nFatal error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the migration
migrateInactiveStudents();
