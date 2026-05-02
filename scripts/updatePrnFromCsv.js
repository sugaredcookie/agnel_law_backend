import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Student from "../models/studentModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI = process.env.MONGO_DB_URI;

if (!MONGODB_URI) {
  console.error("MONGO_DB_URI not found in .env file");
  process.exit(1);
}

// Script to update PRN numbers from CSV file
const updatePrnFromCsv = async () => {
  try {
    console.log("UPDATE PRN NUMBERS FROM CSV");
    console.log("=".repeat(70));
    console.log("This script updates student PRN numbers from temp/valid.csv");
    console.log("=".repeat(70) + "\n");

    // Read CSV file
    const csvPath = path.join(__dirname, "..", "temp", "valid.csv");
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const lines = csvContent.trim().split("\n");

    // Parse CSV (tab-separated)
    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const [prn, rollNo] = lines[i].split("\t").map((s) => s.trim());
      if (rollNo && prn && /^\d{16}$/.test(prn)) {
        records.push({ prn, rollNo });
      }
    }

    console.log(`Parsed ${records.length} valid records from CSV\n`);

    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB\n");

    // Get initial stats
    const totalStudents = await Student.countDocuments({});
    const studentsWithValidPrn = await Student.countDocuments({
      "studentDetails.prnNumber": { $regex: /^\d{16}$/ },
    });
    const studentsWithoutValidPrn = totalStudents - studentsWithValidPrn;

    console.log("BEFORE UPDATE:");
    console.log(`   Total Students: ${totalStudents}`);
    console.log(`   With valid PRN: ${studentsWithValidPrn}`);
    console.log(`   Without valid PRN: ${studentsWithoutValidPrn}`);
    console.log("");

    const stats = {
      updated: 0,
      alreadyMatch: 0,
      prnReplaced: 0,
      notFound: 0,
      errors: 0,
    };

    const notFoundRolls = [];
    const updatedStudents = [];
    const replacedPrnRecords = [];

    console.log("Processing records...\n");

    for (const record of records) {
      try {
        const student = await Student.findOne({
          "academicDetails.rollNumber": record.rollNo,
        });

        if (!student) {
          stats.notFound++;
          notFoundRolls.push(record.rollNo);
          continue;
        }

        const currentPrn = student.studentDetails?.prnNumber;

        // If already has valid PRN, check if it matches
        if (currentPrn && /^\d{16}$/.test(currentPrn)) {
          if (currentPrn === record.prn) {
            stats.alreadyMatch++;
            continue;
          }
          // PRN mismatch - update and log old one for backup
          await Student.updateOne(
            { _id: student._id },
            { $set: { "studentDetails.prnNumber": record.prn } }
          );
          stats.prnReplaced++;
          replacedPrnRecords.push({
            rollNo: record.rollNo,
            newPrn: record.prn,
            oldPrn: currentPrn,
          });
          continue;
        }

        // No valid PRN - set it
        await Student.updateOne(
          { _id: student._id },
          { $set: { "studentDetails.prnNumber": record.prn } }
        );

        stats.updated++;
        updatedStudents.push({
          rollNo: record.rollNo,
          name: `${student.studentDetails?.firstName || ""} ${student.studentDetails?.lastName || ""}`.trim(),
          oldPrn: currentPrn || "N/A",
          newPrn: record.prn,
        });
      } catch (error) {
        stats.errors++;
        console.error(`Error processing ${record.rollNo}: ${error.message}`);
      }
    }

    // Write backup CSV for replaced PRNs
    if (replacedPrnRecords.length > 0) {
      const backupCsvPath = path.join(__dirname, "..", "temp", "replaced_prns.csv");
      const backupLines = ["RollNo\tNewPRN\tOldPRN"];
      for (const r of replacedPrnRecords) {
        backupLines.push(`${r.rollNo}\t${r.newPrn}\t${r.oldPrn}`);
      }
      fs.writeFileSync(backupCsvPath, backupLines.join("\n"), "utf-8");
      console.log(`Backup CSV written to temp/replaced_prns.csv (${replacedPrnRecords.length} records)\n`);
    }

    // Get final stats
    const finalStudentsWithValidPrn = await Student.countDocuments({
      "studentDetails.prnNumber": { $regex: /^\d{16}$/ },
    });
    const finalStudentsWithoutValidPrn = totalStudents - finalStudentsWithValidPrn;

    console.log("=".repeat(70));
    console.log("RESULTS");
    console.log("=".repeat(70));
    console.log(`   Updated (no PRN before): ${stats.updated}`);
    console.log(`   PRN replaced (mismatch): ${stats.prnReplaced}`);
    console.log(`   Already matching PRN: ${stats.alreadyMatch}`);
    console.log(`   Roll numbers not found: ${stats.notFound}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log("");

    if (notFoundRolls.length > 0 && notFoundRolls.length <= 20) {
      console.log("Roll numbers not found in DB:");
      notFoundRolls.forEach((r) => console.log(`   - ${r}`));
      console.log("");
    } else if (notFoundRolls.length > 20) {
      console.log(`Roll numbers not found (showing first 20 of ${notFoundRolls.length}):`);
      notFoundRolls.slice(0, 20).forEach((r) => console.log(`   - ${r}`));
      console.log("");
    }

    console.log("=".repeat(70));
    console.log("AFTER UPDATE:");
    console.log("=".repeat(70));
    console.log(`   Total Students: ${totalStudents}`);
    console.log(`   With valid PRN: ${finalStudentsWithValidPrn}`);
    console.log(`   Without valid PRN: ${finalStudentsWithoutValidPrn}`);
    console.log("");

    const beforePercentage = ((studentsWithValidPrn / totalStudents) * 100).toFixed(2);
    const afterPercentage = ((finalStudentsWithValidPrn / totalStudents) * 100).toFixed(2);
    const improvementPercentage = (afterPercentage - beforePercentage).toFixed(2);

    console.log("=".repeat(70));
    console.log("IMPROVEMENT SUMMARY");
    console.log("=".repeat(70));
    console.log(`   Before: ${studentsWithValidPrn}/${totalStudents} (${beforePercentage}%) had valid PRN`);
    console.log(`   After:  ${finalStudentsWithValidPrn}/${totalStudents} (${afterPercentage}%) have valid PRN`);
    console.log(`   Fixed:  +${stats.updated} students (+${improvementPercentage}%)`);
    console.log("=".repeat(70));

    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB");
  } catch (error) {
    console.error("\nFatal error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

updatePrnFromCsv();
