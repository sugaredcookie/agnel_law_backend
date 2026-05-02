import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
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

// Script to check PRN numbers (must be 16 digits)
const checkPrnNumbers = async () => {
  try {
    console.log("PRN NUMBER VALIDATION CHECK");
    console.log("=".repeat(70));
    console.log("This script checks how many students have valid 16-digit PRN numbers");
    console.log("=".repeat(70) + "\n");

    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB\n");

    const totalStudents = await Student.countDocuments({});
    console.log(`Total Students: ${totalStudents}\n`);

    // Get all students with their PRN info
    const students = await Student.find(
      {},
      {
        "studentDetails.prnNumber": 1,
        "studentDetails.firstName": 1,
        "studentDetails.lastName": 1,
        "academicDetails.rollNumber": 1,
        "academicDetails.batch.name": 1,
        status: 1,
      }
    );

    const stats = {
      validPrn: [],
      invalidPrn: [],
      noPrn: [],
    };

    for (const student of students) {
      const prn = student.studentDetails?.prnNumber;
      const studentInfo = {
        id: student._id,
        name: `${student.studentDetails?.firstName || ""} ${student.studentDetails?.lastName || ""}`.trim(),
        rollNumber: student.academicDetails?.rollNumber || "N/A",
        batch: student.academicDetails?.batch?.name || "N/A",
        status: student.status,
        prn: prn || "N/A",
      };

      if (!prn || prn.trim() === "") {
        stats.noPrn.push(studentInfo);
      } else if (/^\d{16}$/.test(prn.trim())) {
        stats.validPrn.push(studentInfo);
      } else {
        stats.invalidPrn.push(studentInfo);
      }
    }

    // Summary
    console.log("=".repeat(70));
    console.log("SUMMARY");
    console.log("=".repeat(70));
    console.log(`   Students with valid 16-digit PRN: ${stats.validPrn.length}`);
    console.log(`   Students with invalid PRN format: ${stats.invalidPrn.length}`);
    console.log(`   Students without PRN: ${stats.noPrn.length}`);
    console.log("");

    // Show invalid PRN details
    if (stats.invalidPrn.length > 0) {
      console.log("=".repeat(70));
      console.log("STUDENTS WITH INVALID PRN FORMAT");
      console.log("=".repeat(70));
      stats.invalidPrn.forEach((s, i) => {
        console.log(`${i + 1}. ${s.name} | Roll: ${s.rollNumber} | Batch: ${s.batch} | PRN: "${s.prn}" (${s.prn.length} chars)`);
      });
      console.log("");
    }

    // Show students without PRN
    if (stats.noPrn.length > 0) {
      console.log("=".repeat(70));
      console.log("STUDENTS WITHOUT PRN NUMBER");
      console.log("=".repeat(70));
      
      // Group by batch for better visibility
      const byBatch = {};
      stats.noPrn.forEach((s) => {
        const batch = s.batch || "Unknown";
        if (!byBatch[batch]) byBatch[batch] = [];
        byBatch[batch].push(s);
      });

      for (const [batch, students] of Object.entries(byBatch)) {
        console.log(`\n--- ${batch} (${students.length} students) ---`);
        students.forEach((s, i) => {
          console.log(`   ${i + 1}. ${s.name} | Roll: ${s.rollNumber} | Status: ${s.status}`);
        });
      }
      console.log("");
    }

    // Final stats
    console.log("=".repeat(70));
    console.log("FINAL STATISTICS");
    console.log("=".repeat(70));
    const validPercentage = ((stats.validPrn.length / totalStudents) * 100).toFixed(2);
    const missingPercentage = (((stats.noPrn.length + stats.invalidPrn.length) / totalStudents) * 100).toFixed(2);
    
    console.log(`   Valid PRN: ${stats.validPrn.length}/${totalStudents} (${validPercentage}%)`);
    console.log(`   Missing/Invalid PRN: ${stats.noPrn.length + stats.invalidPrn.length}/${totalStudents} (${missingPercentage}%)`);
    console.log("=".repeat(70));

    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB");
  } catch (error) {
    console.error("\nFatal error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

checkPrnNumbers();
