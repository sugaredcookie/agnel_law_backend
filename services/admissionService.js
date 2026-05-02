import { v4 as uuidv4 } from "uuid";
import { createJob, updateJob } from "../utils/jobManager.js";
import Application from "../models/applicationModel.js";
import Student from "../models/studentModel.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateRollNumber } from "../controllers/studentController.js";
import {
  formattedDate,
  newUserStudentRegisterEmailWithLoginDetails,
  transporter,
} from "../NodeMailer.js";
import batchModel from "../models/batchesModel.js";
import User from "../models/userModel.js";

const admissionQueue = [];
let isProcessing = false;

const generatePassword = () => {
  return crypto.randomBytes(6).toString("hex");
};

const processQueue = async () => {
  if (isProcessing || admissionQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const { jobId, applicationIds, baseBatchName, requestedBy } =
    admissionQueue.shift();

  try {
    updateJob(jobId, { status: "in_progress" });

    let targetBatches = [];
    const singleBatch = await batchModel.findOne({ batchName: baseBatchName });

    if (singleBatch) {
      targetBatches.push(singleBatch);
    } else {
      targetBatches = await batchModel
        .find({ batchName: { $regex: `^${baseBatchName}-` } })
        .sort({ batchName: 1 });
    }

    if (targetBatches.length === 0) {
      throw new Error(`No batches or sections found for "${baseBatchName}".`);
    }

    const applications = await Application.find({
      _id: { $in: applicationIds },
    }).sort({ "studentDetails.lastName": 1 });

    const studentsPerSection = Math.floor(
      applications.length / targetBatches.length,
    );
    let remainder = applications.length % targetBatches.length;
    const assignments = new Map();
    let studentIndex = 0;

    for (const batch of targetBatches) {
      const sectionSize = studentsPerSection + (remainder > 0 ? 1 : 0);
      assignments.set(
        batch._id.toString(),
        applications.slice(studentIndex, studentIndex + sectionSize),
      );
      studentIndex += sectionSize;
      if (remainder > 0) {
        remainder--;
      }
    }

    let results = [];
    let successCount = 0;
    let failureCount = 0;
    let processedCount = 0;

    for (const [batchId, assignedApps] of assignments.entries()) {
      const batch = targetBatches.find((b) => b._id.toString() === batchId);
      for (const application of assignedApps) {
        let savedStudent;
        try {
          if (application.formStatusFromAdmin === "Student Admitted") {
            results.push({
              applicationId: application._id,
              status: "skipped",
              reason: "Student already admitted.",
            });
            continue;
          }

          const user = await User.findById(application.loginStudentId);
          if (!user) {
            throw new Error("User account not found for this application.");
          }

          const existingStudent = await Student.findOne({
            "studentDetails.aadharCardNumber":
              application.studentDetails.aadharCardNumber,
            status: "active",
          });

          if (existingStudent) {
            throw new Error(
              "A student with this Aadhar card number already exists.",
            );
          }

          const studentDetailsWithCaps = {
            ...application.studentDetails,
            firstName: application.studentDetails.firstName.toUpperCase(),
            middleName:
              application.studentDetails.middleName?.toUpperCase() || "",
            lastName: application.studentDetails.lastName.toUpperCase(),
            address: application.studentDetails.address?.toUpperCase() || "",
            emailAddress: user.email,
            gender: application.studentDetails.gender || user.gender || "",
          };

          const rollNumber = await generateRollNumber(
            studentDetailsWithCaps.lastName,
            application.course,
            batch.batchName,
          );
          const password = generatePassword();
          const hashedPassword = await bcrypt.hash(password, 10);

          const newStudent = new Student({
            ...application.toObject(),
            studentDetails: studentDetailsWithCaps,
            academicDetails: {
              program: application.course,
              batch: { id: batch._id, name: batch.batchName },
              registerNumber: application.applicationNumber,
              rollNumber,
              subjects: [],
              yearOfJoining: new Date().getFullYear(),
            },
            password: hashedPassword,
            studentId: uuidv4(),
          });
          savedStudent = await newStudent.save();

          await transporter.sendMail({
            from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
            to: user.email,
            subject: "Hey, Student Register ...",
            html: newUserStudentRegisterEmailWithLoginDetails(
              savedStudent.studentDetails.firstName,
              user.email,
              password,
              formattedDate,
            ),
          });

          application.formStatusFromAdmin = "Student Admitted";
          await application.save();

          results.push({ applicationId: application._id, status: "success" });
          successCount++;
        } catch (error) {
          if (savedStudent && savedStudent._id) {
            await Student.findByIdAndDelete(savedStudent._id);
          }
          results.push({
            applicationId: application._id,
            status: "failed",
            reason: error.message,
          });
          failureCount++;
        } finally {
          processedCount++;
          updateJob(jobId, {
            progress: (processedCount / applications.length) * 100,
            metadata: {
              processedStudents: processedCount,
              successCount,
              failureCount,
            },
          });
        }
      }
    }
    updateJob(jobId, { status: "completed", result: results, progress: 100 });
  } catch (error) {
    updateJob(jobId, { status: "failed", error: error.message });
  } finally {
    isProcessing = false;
    processQueue();
  }
};

const startAdmissionJob = (applicationIds, baseBatchName, requestedBy) => {
  const jobId = uuidv4();
  createJob(jobId, {
    type: "bulk-admission",
    totalStudents: applicationIds.length,
    requestedBy,
    baseBatchName,
  });
  admissionQueue.push({ jobId, applicationIds, baseBatchName, requestedBy });
  processQueue();
  return jobId;
};

export default {
  startAdmissionJob,
};
