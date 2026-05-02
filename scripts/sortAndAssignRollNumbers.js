import mongoose from "mongoose";
import "dotenv/config";

import Student from "../models/studentModel.js";
import Batch from "../models/batchesModel.js";
import { getCourseDuration } from "../controllers/studentController.js";

const connectDB = async () => {
  try {
    if (!process.env.MONGO_DB_URI) {
      console.error("ERROR: MONGO_DB_URI is not defined in your .env file.");
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_DB_URI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

const sortAndAssignRollNumbers = async () => {
  try {
    await connectDB();

    const RESET_SEQUENCE = true;

    const batchesToUpdate = ["FYBA-LLB-A", "FYBA-LLB-B"];
    console.log(
      `Fetching students from batches: ${batchesToUpdate.join(", ")}`,
    );

    const students = await Student.find({
      "academicDetails.batch.name": { $in: batchesToUpdate },
      status: "active",
    }).lean();

    console.log(`Found ${students.length} students.`);

    students.sort((a, b) => {
      const lastNameA = a.studentDetails.lastName || "";
      const lastNameB = b.studentDetails.lastName || "";
      return lastNameA.localeCompare(lastNameB);
    });

    console.log("Students sorted by last name.");

    if (students.length > 0) {
      const batchA = await Batch.findOne({ batchName: "FYBA-LLB-A" }).lean();
      const batchB = await Batch.findOne({ batchName: "FYBA-LLB-B" }).lean();

      if (!batchA || !batchB) {
        console.error("Could not find one or both batches.");
        return;
      }

      const half = Math.ceil(students.length / 2);
      const studentsForA = students.slice(0, half);
      const studentsForB = students.slice(half);

      console.log(
        `Assigning ${studentsForA.length} students to FYBA-LLB-A and ${studentsForB.length} to FYBA-LLB-B.`,
      );

      const programName = students[0].academicDetails.program;
      const year = new Date().getFullYear().toString().slice(-2);
      const duration = getCourseDuration(programName);

      let startingSequence = 1;

      if (!RESET_SEQUENCE) {
        const lastStudent = await Student.findOne({
          "academicDetails.rollNumber": {
            $regex: `^${year}${duration}`,
            $options: "i",
          },
        })
          .sort({ "academicDetails.rollNumber": -1 })
          .limit(1);

        if (lastStudent && lastStudent.academicDetails.rollNumber) {
          const lastRollNumber = lastStudent.academicDetails.rollNumber;
          const lastSequence = parseInt(lastRollNumber.slice(4), 10);
          startingSequence = lastSequence + 1;
        }
      }

      for (let i = 0; i < studentsForA.length; i++) {
        const student = studentsForA[i];
        const sequence = (startingSequence + i).toString().padStart(3, "0");
        const newRollNumber = `${year}${duration}${sequence}`;

        console.log(
          `Updating ${student.studentDetails.firstName} ${student.studentDetails.lastName} (ID: ${student._id}) to batch FYBA-LLB-A with new roll number ${newRollNumber}`,
        );

        await Student.updateOne(
          { _id: student._id },
          {
            $set: {
              "academicDetails.rollNumber": newRollNumber.toString(),
              "academicDetails.batch": {
                id: batchA._id,
                name: batchA.batchName,
              },
            },
          },
        );
      }

      for (let i = 0; i < studentsForB.length; i++) {
        const student = studentsForB[i];
        const sequence = (startingSequence + studentsForA.length + i)
          .toString()
          .padStart(3, "0");
        const newRollNumber = `${year}${duration}${sequence}`;

        console.log(
          `Updating ${student.studentDetails.firstName} ${student.studentDetails.lastName} (ID: ${student._id}) to batch FYBA-LLB-B with new roll number ${newRollNumber}`,
        );

        await Student.updateOne(
          { _id: student._id },
          {
            $set: {
              "academicDetails.rollNumber": newRollNumber.toString(),
              "academicDetails.batch": {
                id: batchB._id,
                name: batchB.batchName,
              },
            },
          },
        );
      }
    }

    console.log(
      "\nAll students have been updated with new batches and roll numbers.",
    );
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Database disconnected");
  }
};

sortAndAssignRollNumbers();
