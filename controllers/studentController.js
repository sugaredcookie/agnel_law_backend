import studentModel from "../models/studentModel.js";
import Application from "../models/applicationModel.js";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import JWT_SECRET from "../config/jwtConfig.js";
import crypto from "crypto";
import {
  formattedDate,
  newUserStudentPasswordEmailWithLoginDetails,
  newUserStudentRegisterEmailWithLoginDetails,
  transporter,
  birthdayWishesEmail,
} from "../NodeMailer.js";
import batchModel from "../models/batchesModel.js";
import batchGroupModel from "../models/batchGroupModel.js";
import subjectModel from "../models/subjectModel.js";
import fs from "fs";
import path from "path";
import Note from "../models/noteModel.js";
import {
  getJob,
  updateJob,
  getAllActiveJobs,
  getJobStats,
} from "../utils/jobManager.js";
import idCardService from "../services/idCardService.js";
import admissionService from "../services/admissionService.js";
import studentArchiveService from "../services/studentArchiveService.js";
import User from "../models/userModel.js";
import ArchivedStudent from "../models/archivedStudentModel.js";
import ElectiveSession from "../models/electiveSessionModel.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import {
  createWorkbook,
  createStandardWorksheet,
  sendExcelResponse,
  getNestedValue,
} from "../utils/excelHelper.js";

const __dirname = path.resolve();

export const downloadAllStudents = async (req, res) => {
  try {
    const { program, batch, searchType, searchText, filterType, noBatch, caste } =
      req.query;
    let filters = { status: "active" };

    if (noBatch === "true") {
      filters["academicDetails.batch.id"] = { $exists: false };
    }

    if (filterType && filterType !== "Active Students") {
      filters.status = filterType.toLowerCase();
    }
    if (program) {
      filters["academicDetails.program"] = program;
    }
    if (batch) {
      filters["academicDetails.batch.name"] = batch;
    }
    if (caste) {
      filters["studentDetails.caste"] = new RegExp(`^${caste}$`, "i");
    }
    if (searchText && searchType) {
      const searchRegex = new RegExp(searchText, "i");
      switch (searchType) {
        case "Student Name":
          filters.$or = [
            { "studentDetails.firstName": searchRegex },
            { "studentDetails.lastName": searchRegex },
          ];
          break;
        case "Register No":
          filters["academicDetails.registerNumber"] = searchRegex;
          break;
        case "Roll No":
          filters["academicDetails.rollNumber"] = searchText.trim().replace(/\D/g, "");
          break;
      }
    }

    const students = await Student.find(filters).lean();

    const headers = [
      { label: "First Name", key: "firstName", width: 20 },
      { label: "Middle Name", key: "middleName", width: 20 },
      { label: "Last Name", key: "lastName", width: 20 },
      { label: "Email", key: "email", width: 30 },
      { label: "Student Phone", key: "phone", width: 15 },
      { label: "Program", key: "program", width: 15 },
      { label: "Batch", key: "batch", width: 15 },
      { label: "Roll Number", key: "rollNumber", width: 15 },
      { label: "PRN Number", key: "prnNumber", width: 20 },
      { label: "ABC ID", key: "abcId", width: 20 },
      { label: "GR Number", key: "grNumber", width: 15 },
      { label: "CAP Application ID", key: "capApplicationId", width: 20 },
      { label: "Aadhar Number", key: "aadhar", width: 18 },
      { label: "Status", key: "status", width: 12 },
      { label: "Date of Birth", key: "dob", width: 15 },
      { label: "Blood Group", key: "bloodGroup", width: 12 },
      { label: "Caste", key: "caste", width: 15 },
      { label: "Caste Category", key: "casteCategory", width: 15 },
      { label: "Address", key: "address", width: 30 },
    ];

    const data = students.map((student) => ({
      firstName: getNestedValue(student, "studentDetails.firstName") || "",
      middleName: getNestedValue(student, "studentDetails.middleName") || "",
      lastName: getNestedValue(student, "studentDetails.lastName") || "",
      email: getNestedValue(student, "studentDetails.emailAddress") || "",
      phone:
        getNestedValue(student, "studentDetails.studentMobileNumber") || "",
      program: getNestedValue(student, "academicDetails.program") || "",
      batch: getNestedValue(student, "academicDetails.batch.name") || "",
      rollNumber: getNestedValue(student, "academicDetails.rollNumber") || "",
      prnNumber: getNestedValue(student, "studentDetails.prnNumber") || "",
      abcId: getNestedValue(student, "studentDetails.abcNumber") || "",
      grNumber: getNestedValue(student, "studentDetails.grNumber") || "",
      capApplicationId: getNestedValue(student, "studentDetails.capApplicationId") || "",
      aadhar: getNestedValue(student, "studentDetails.aadharCardNumber") || "",
      status: student.status || "",
      dob: getNestedValue(student, "studentDetails.dateOfBirth") || "",
      bloodGroup: getNestedValue(student, "studentDetails.bloodGroup") || "",
      address: getNestedValue(student, "studentDetails.address") || "",
      caste: getNestedValue(student, "studentDetails.caste") || "",
      casteCategory: getNestedValue(student, "studentDetails.casteCategory") || "",
    }));

    const workbook = createWorkbook();
    createStandardWorksheet(workbook, "Students", headers, data);

    await sendExcelResponse(res, workbook, "students.xlsx");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateStudentsFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return res
        .status(400)
        .json({ message: "No worksheet found in the file" });
    }

    const results = [];
    const headers = [];

    worksheet.getRow(1).eachCell((cell) => {
      headers.push(cell.value);
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        if (Object.keys(rowData).length > 0) {
          results.push(rowData);
        }
      }
    });

    const stats = { created: 0, updated: 0, failed: 0 };

    for (const row of results) {
      try {
        const email = row["Email"] || row["email"];
        const rollNumber = row["Roll Number"] || row["rollNumber"];

        if (!email && !rollNumber) {
          stats.failed++;
          continue;
        }

        const query = {};
        if (email) query["studentDetails.emailAddress"] = email;
        if (rollNumber) query["academicDetails.rollNumber"] = rollNumber;

        const existingStudent = await Student.findOne(query);

        const studentData = {
          "studentDetails.firstName":
            row["First Name"] || row["firstName"] || "",
          "studentDetails.lastName": row["Last Name"] || row["lastName"] || "",
          "studentDetails.emailAddress": email || "",
          "studentDetails.gender":
            row["Gender"] || row["gender"] || "",
          "studentDetails.studentMobileNumber":
            row["Student Phone"] || row["phone"] || "",
          "studentDetails.aadharCardNumber":
            row["Aadhar Number"] || row["aadhar"] || "",
          "studentDetails.dateOfBirth":
            row["Date of Birth"] || row["dob"] || "",
          "studentDetails.bloodGroup":
            row["Blood Group"] || row["bloodGroup"] || "",
          "studentDetails.address": row["Address"] || row["address"] || "",
          "academicDetails.program": row["Program"] || row["program"] || "",
          "academicDetails.rollNumber": rollNumber || "",
          status: row["Status"] || row["status"] || "active",
        };

        if (row["Batch"] || row["batch"]) {
          const batchName = row["Batch"] || row["batch"];
          const batch = await batchModel.findOne({ batchName });
          if (batch) {
            studentData["academicDetails.batch"] = {
              name: batch.batchName,
              id: batch._id,
            };
          }
        }

        if (existingStudent) {
          await Student.findByIdAndUpdate(existingStudent._id, {
            $set: studentData,
          });
          stats.updated++;
        } else {
          const password = crypto.randomBytes(6).toString("hex");
          const hashedPassword = await bcrypt.hash(password, 10);

          const newStudent = new Student({
            ...Object.keys(studentData).reduce((acc, key) => {
              const keys = key.split(".");
              let current = acc;
              for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) current[keys[i]] = {};
                current = current[keys[i]];
              }
              current[keys[keys.length - 1]] = studentData[key];
              return acc;
            }, {}),
            password: hashedPassword,
            studentId: uuidv4(),
          });

          await newStudent.save();
          stats.created++;
        }
      } catch (error) {
        console.error("Error processing row:", error);
        stats.failed++;
      }
    }

    res.json({
      message: `Processed ${results.length} records`,
      stats,
    });
  } catch (error) {
    console.error("Error in updateStudentsFromExcel:", error);
    res.status(500).json({ error: error.message });
  }
};

export const uploadStudentPhotoAndSign = async (req, res) => {
  try {
    const { id } = req.params;
    const { photo, sign } = req.files;

    let updateData = {};

    if (photo) {
      const photoResult = await uploadToCloudinary(photo[0]);
      updateData["studentDetails.studentImage"] = photoResult.url;
    }

    if (sign) {
      const signResult = await uploadToCloudinary(sign[0]);
      updateData["studentDetails.studentSign"] = signResult.url;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const student = await Student.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true },
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json({ message: "Files uploaded successfully", student });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const generatePassword = () => {
  return crypto.randomBytes(6).toString("hex");
};

import Student from "../models/studentModel.js";

export const getCourseDuration = (programName) => {
  const durationMap = {
    LLB: "3",
    LLM: "2",
    BALLB: "5",
  };

  const normalizedProgram = programName.toUpperCase().replace(/\s+/g, "");
  return durationMap[normalizedProgram] || "00";
};

export const generateRollNumber = async (lastName, programName, batchName) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const duration = getCourseDuration(programName);
  const rollNumberPrefix = `${year}${duration}`;
  const batchPrefix = batchName.split("-")[0];

  const lastStudent = await Student.findOne({
    "academicDetails.rollNumber": {
      $regex: `^${rollNumberPrefix}`,
      $options: "i",
    },
    "academicDetails.batch.name": {
      $regex: `^${batchPrefix}`,
      $options: "i",
    },
  })
    .sort({ "academicDetails.rollNumber": -1 })
    .limit(1);

  let sequence = 1;
  if (lastStudent && lastStudent.academicDetails.rollNumber) {
    const lastRollNumber = lastStudent.academicDetails.rollNumber;
    const lastSequence = parseInt(
      lastRollNumber.slice(rollNumberPrefix.length),
      10,
    );
    sequence = lastSequence + 1;
  }

  const sequenceStr = sequence.toString().padStart(3, "0");

  return `${rollNumberPrefix}${sequenceStr}`;
};

const findImage = (directory, rollNumber) => {
  const extensions = [".jpg", ".jpeg", ".png", ".webp"];
  for (const ext of extensions) {
    const filename = `${rollNumber}${ext}`;
    const filepath = path.join(directory, filename);
    if (fs.existsSync(filepath)) {
      return filepath;
    }
  }
  return null;
};

const getImageAsBase64 = async (rollNumber, type) => {
  const photoDir = path.join(__dirname, "uploads/collected_photos");
  const signDir = path.join(__dirname, "uploads/collected_signs");
  const fallbackPath = path.join(
    __dirname,
    "uploads/images/fallback-image.png",
  );
  const dir = type === "photo" ? photoDir : signDir;

  let imagePath = findImage(dir, rollNumber);
  let imageUrl;

  if (!imagePath) {
    const student = await Student.findOne({
      "academicDetails.rollNumber": rollNumber,
    });
    if (student) {
      if (type === "photo" && student.studentDetails.studentImage) {
        imageUrl = student.studentDetails.studentImage;
      } else if (type === "sign" && student.studentDetails.studentSign) {
        imageUrl = student.studentDetails.studentSign;
      }
    }
  }

  try {
    let imageBuffer;
    let mimeType = "image/png";

    if (imagePath) {
      imageBuffer = await fs.promises.readFile(imagePath);
      const extension = path.extname(imagePath).slice(1).toLowerCase();
      mimeType = `image/${extension === "jpg" ? "jpeg" : extension}`;
    } else if (imageUrl) {
      const response = await fetch(imageUrl);
      if (!response.ok)
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      imageBuffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.startsWith("image/")) {
        mimeType = contentType;
      }
    } else {
      imageBuffer = await fs.promises.readFile(fallbackPath);
    }
    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    console.error(`Error getting image for ${rollNumber}:`, error);

    const imageBuffer = await fs.promises.readFile(fallbackPath);
    return `data:image/png;base64,${imageBuffer.toString("base64")}`;
  }
};

export const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findById(id)
      .select("-password")
      .populate("certificates.verifiedBy", "name email");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({ student });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateStudentCertificateStatus = async (req, res) => {
  try {
    const { studentId, certificateId } = req.params;
    const { status, remark } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const certificate = student.certificates.id(certificateId);
    if (!certificate) {
      return res.status(404).json({ message: "Certificate not found" });
    }

    certificate.status = status;
    certificate.remark = remark || "";
    if (status === "verified") {
      certificate.verifiedAt = new Date();
      certificate.verifiedBy = req.user?.id;
    }

    await student.save();
    res.json({ message: "Certificate status updated", certificate });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getStudentPhoto = async (req, res) => {
  try {
    const { rollNumber } = req.params;
    const photoDir = path.join(__dirname, "uploads/collected_photos");
    const fallbackPath = path.join(
      __dirname,
      "uploads/images/fallback-image.png",
    );
    const imagePath = findImage(photoDir, rollNumber);

    if (imagePath) {
      return res.sendFile(imagePath);
    }

    const student = await Student.findOne({
      "academicDetails.rollNumber": rollNumber,
    });

    if (student?.studentDetails?.studentImage) {
      const imageUrl = student.studentDetails.studentImage;

      if (imageUrl.startsWith("http")) {
        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const imageBuffer = Buffer.from(await response.arrayBuffer());
            const contentType =
              response.headers.get("content-type") || "image/png";
            res.set("Content-Type", contentType);
            return res.send(imageBuffer);
          }
        } catch (fetchError) {
          console.error(`Error fetching image from URL: ${fetchError.message}`);
        }
      }
    }

    res.sendFile(fallbackPath);
  } catch (error) {
    console.error(`Error in getStudentPhoto: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
};

export const getStudentSign = async (req, res) => {
  try {
    const { rollNumber } = req.params;
    const signDir = path.join(__dirname, "uploads/collected_signs");
    const fallbackPath = path.join(
      __dirname,
      "uploads/images/fallback-image.png",
    );
    const imagePath = findImage(signDir, rollNumber);

    if (imagePath) {
      return res.sendFile(imagePath);
    }

    const student = await Student.findOne({
      "academicDetails.rollNumber": rollNumber,
    });

    if (student?.studentDetails?.studentSign) {
      const signUrl = student.studentDetails.studentSign;

      if (signUrl.startsWith("http")) {
        try {
          const response = await fetch(signUrl);
          if (response.ok) {
            const imageBuffer = Buffer.from(await response.arrayBuffer());
            const contentType =
              response.headers.get("content-type") || "image/png";
            res.set("Content-Type", contentType);
            return res.send(imageBuffer);
          }
        } catch (fetchError) {
          console.error(
            `Error fetching signature from URL: ${fetchError.message}`,
          );
        }
      }
    }

    res.sendFile(fallbackPath);
  } catch (error) {
    console.error(`Error in getStudentSign: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
};

export const getAllStudents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { program, batch, searchType, searchText, filterType, noBatch, caste } =
      req.query;
    let filters = { status: "active" };

    if (noBatch === "true") {
      filters["academicDetails.batch.id"] = { $exists: false };
    }

    if (filterType && filterType !== "Active Students") {
      filters.status = filterType.toLowerCase();
    }
    if (program) {
      filters["academicDetails.program"] = program;
    }
    if (batch) {
      filters["academicDetails.batch.name"] = batch;
    }
    if (caste) {
      filters["studentDetails.caste"] = new RegExp(`^${caste}$`, "i");
    }
    if (searchText && searchType) {
      const searchRegex = new RegExp(searchText, "i");
      switch (searchType) {
        case "Student Name":
          filters.$or = [
            { "studentDetails.firstName": searchRegex },
            { "studentDetails.lastName": searchRegex },
          ];
          break;
        case "Register No":
          filters["academicDetails.registerNumber"] = searchRegex;
          break;
        case "Roll No":
          filters["academicDetails.rollNumber"] = searchText.trim().replace(/\D/g, "");
          break;
      }
    }

    const studentsPipeline = [
      { $match: filters },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          status: 1,
          loginStudentId: 1,
          "studentDetails.firstName": 1,
          "studentDetails.middleName": 1,
          "studentDetails.lastName": 1,
          "studentDetails.emailAddress": 1,
          "studentDetails.studentMobileNumber": 1,
          "studentDetails.dateOfBirth": 1,
          "studentDetails.studentImage": 1,
          "studentDetails.studentSign": 1,
          "studentDetails.bloodGroup": 1,
          "studentDetails.address": 1,
          "academicDetails.program": 1,
          "academicDetails.batch": 1,
          "academicDetails.registerNumber": 1,
          "academicDetails.rollNumber": 1,
          certificates: {
            $filter: {
              input: "$certificates",
              as: "cert",
              cond: {
                $in: ["$$cert.type", ["candidatePhoto", "candidateSignature"]],
              },
            },
          },
        },
      },
    ];

    const students = await Student.aggregate(studentsPipeline);
    const totalResult = await Student.aggregate([
      { $match: filters },
      { $count: "total" },
    ]);
    const totalStudents = totalResult.length > 0 ? totalResult[0].total : 0;

    for (const student of students) {
      // Priority 1: Check studentDetails fields first
      let photoUrl = student.studentDetails.studentImage;
      let signUrl = student.studentDetails.studentSign;

      // Priority 2: Check certificates array (only if not found in studentDetails)
      if (!photoUrl) {
        photoUrl = student.certificates?.find(
          (c) => c.type === "candidatePhoto",
        )?.fileUrl;
      }
      if (!signUrl) {
        signUrl = student.certificates?.find(
          (c) => c.type === "candidateSignature",
        )?.fileUrl;
      }

      // Priority 3: Check application form (only if still not found)
      if (!photoUrl || !signUrl) {
        const query = mongoose.Types.ObjectId.isValid(student.loginStudentId)
          ? { loginStudentId: student.loginStudentId }
          : {
              "studentDetails.emailAddress":
                student.studentDetails.emailAddress,
            };

        const application = await Application.findOne(query).lean();

        if (application && application.certificates) {
          if (!photoUrl) {
            photoUrl = application.certificates.find(
              (c) => c.type === "candidatePhoto",
            )?.fileUrl;
          }
          if (!signUrl) {
            signUrl = application.certificates.find(
              (c) => c.type === "candidateSignature",
            )?.fileUrl;
          }
        }
      }

      // Priority 4: Fallback to backend endpoint (only if still not found)
      const backendBaseUrl = "https://lms.raphaedu.com/backend";

      if (!photoUrl) {
        photoUrl = `${backendBaseUrl}/api/students/student-photo/${student.academicDetails.rollNumber}`;
      }
      if (!signUrl) {
        signUrl = `${backendBaseUrl}/api/students/student-sign/${student.academicDetails.rollNumber}`;
      }

      student.studentDetails.studentImage = photoUrl;
      student.studentDetails.studentSign = signUrl;
    }

    res.status(200).json({
      students,
      totalStudents,
      currentPage: page,
      totalPages: Math.ceil(totalStudents / limit),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateStudentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const updatePayload = req.body;

    const student = await Student.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res
      .status(200)
      .json({ message: "Student details updated successfully", student });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const resetStudentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { email: manualEmail, type } = req.body;
    const student = await Student.findById(id);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    let targetEmail = manualEmail;

    if (!targetEmail) {
      const user = await User.findById(student.loginStudentId);
      if (user && user.email) {
        targetEmail = user.email;
      } else if (student.studentDetails.emailAddress) {
        targetEmail = student.studentDetails.emailAddress;
      }
    }

    if (!targetEmail) {
      return res.status(400).json({
        message:
          "No email address found for this student. Please provide one manually.",
      });
    }

    const newPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateData = { password: hashedPassword };
    if (targetEmail && student.studentDetails.emailAddress !== targetEmail) {
      updateData["studentDetails.emailAddress"] = targetEmail;
    }

    await Student.findByIdAndUpdate(id, { $set: updateData });

    const emailHtml =
      type === "register"
        ? newUserStudentRegisterEmailWithLoginDetails(
            student.studentDetails.firstName,
            targetEmail,
            newPassword,
            formattedDate,
          )
        : newUserStudentPasswordEmailWithLoginDetails(
            student.studentDetails.firstName,
            targetEmail,
            newPassword,
          );

    await transporter.sendMail({
      from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
      to: targetEmail,
      subject:
        type === "register"
          ? "Welcome! Your Account Details"
          : "Your Password Has Been Reset",
      html: emailHtml,
    });

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const processIdCardGeneration_LEGACY = async (jobId, studentIds) => {
  console.log(
    "Legacy processIdCardGeneration called - use idCardService instead",
  );
};

export const startIdCardGenerationJob = async (req, res) => {
  console.log("--- Scalable ID card generation job STARTED ---");
  const { studentIds } = req.body;

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ message: "Student IDs are required" });
  }

  if (studentIds.length > 1000) {
    return res.status(400).json({
      message: "Too many students requested. Maximum 1000 students per batch.",
    });
  }

  try {
    if (!idCardService.isHealthy()) {
      await idCardService.initialize();
    }

    const jobId = await idCardService.generateIdCards(studentIds, {
      requestedBy: req.user?.id || "system",
      clientInfo: {
        userAgent: req.get("User-Agent"),
        ip: req.ip,
      },
    });

    console.log(
      `Scalable ID card generation job ${jobId} queued for ${studentIds.length} students`,
    );

    res.status(202).json({
      jobId,
      message: `ID card generation queued for ${studentIds.length} students`,
      estimatedProcessingTime: `${Math.ceil(studentIds.length / 20)} minutes`,
      queueStats: idCardService.getQueueStats(),
    });
  } catch (error) {
    console.error("Error starting ID card generation job:", error);
    res.status(500).json({
      message: "Failed to start ID card generation job",
      error: error.message,
    });
  }
};

export const getIdCardJobStatus = async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (job) {
    const response = {
      ...job,
      queueStats: idCardService.isHealthy()
        ? idCardService.getQueueStats()
        : null,
      systemHealth: {
        serviceHealthy: idCardService.isHealthy(),
        timestamp: new Date().toISOString(),
      },
    };

    res.json(response);
  } else {
    res.status(404).json({ message: "Job not found" });
  }
};

export const downloadIdCardZip = async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (job && job.status === "completed" && job.result) {
    try {
      if (!fs.existsSync(job.result)) {
        return res.status(404).json({
          message: "File not found on server. It may have been cleaned up.",
        });
      }

      const fileName = `ID_Cards_${new Date().toISOString().split("T")[0]}_${jobId.slice(0, 8)}.zip`;

      res.download(job.result, fileName, (err) => {
        if (err) {
          console.error("Error sending file:", err);
          if (!res.headersSent) {
            res.status(500).json({ message: "Error downloading file" });
          }
        } else {
          console.log(`File downloaded successfully: ${fileName}`);

          setTimeout(() => {
            try {
              if (fs.existsSync(job.result)) {
                fs.unlinkSync(job.result);
                console.log(`Cleaned up file: ${job.result}`);
              }
            } catch (cleanupError) {
              console.error("Error cleaning up file:", cleanupError);
            }
          }, 5000);
        }
      });
    } catch (error) {
      console.error("Error in downloadIdCardZip:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  } else if (job && job.status === "failed") {
    res.status(400).json({
      message: "Job failed",
      error: job.error,
      metadata: job.metadata,
    });
  } else if (job && job.status !== "completed") {
    res.status(202).json({
      message: "Job still processing",
      status: job.status,
      progress: job.progress,
      metadata: job.metadata,
    });
  } else {
    res.status(404).json({ message: "Job not found" });
  }
};

export const createStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const existingStudent = await Student.findOne({
      "studentDetails.aadharCardNumber":
        application.studentDetails.aadharCardNumber,
      status: "active",
    });

    if (existingStudent) {
      return res.status(400).json({
        message: "A student with this Aadhar card number already exists",
      });
    }

    const user = await User.findById(application.loginStudentId);
    if (!user) {
      return res
        .status(404)
        .json({ message: "User account not found for this application." });
    }

    const sections = await batchModel.find({
      batchName: { $regex: `^${req.body.batchName}-` },
    });
    if (sections.length > 0) {
      return res.status(400).json({
        message:
          "This batch has multiple sections. Please use the bulk admission feature to assign students automatically.",
      });
    }

    const uniqueId = uuidv4();
    let password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (application.paymentStatus === "unpaid") {
      return res.status(400).json({ message: "Payment not successful" });
    }

    const rollNumber = await generateRollNumber(
      application.studentDetails.lastName,
      application.course,
      req.body.batchName,
    );

    const studentDetailsWithCaps = {
      ...application.studentDetails,
      firstName: application.studentDetails.firstName.toUpperCase(),
      middleName: application.studentDetails.middleName?.toUpperCase() || "",
      lastName: application.studentDetails.lastName.toUpperCase(),
      address: application.studentDetails.address?.toUpperCase() || "",
      emailAddress: user.email,
      gender: application.studentDetails.gender || user.gender || "",
    };

    const newStudent = new Student({
      studentDetails: studentDetailsWithCaps,
      familyBackground: application.familyBackground,
      certificates: application.certificates,
      loginStudentId: application.loginStudentId,
      academicDetails: {
        program: application.course,
        batch: {
          id: req.body.batchId,
          name: req.body.batchName,
        },
        registerNumber: application.applicationNumber,
        rollNumber: rollNumber,
        subjects: [],
        yearOfJoining: new Date().getFullYear(),
      },
      status: "active",
      password: hashedPassword,
      studentId: uniqueId,
    });

    const savedStudent = await newStudent.save();
    try {
      const info = await transporter.sendMail({
        from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
        to: user.email,
        subject: "Hey, Student Register ...",
        text: "New Student Register",
        html: newUserStudentRegisterEmailWithLoginDetails(
          savedStudent.studentDetails.firstName,
          user.email,
          password,
          formattedDate,
        ),
      });
      application.formStatusFromAdmin = "Student Admitted";
      await application.save();
      res.status(201).json({
        message: "Student created successfully!",
        student: savedStudent,
      });
    } catch (emailError) {
      if (savedStudent && savedStudent._id) {
        await Student.findByIdAndDelete(savedStudent._id);
      }
      console.error("Failed to send admission email:", emailError);
      return res.status(502).json({
        message:
          "Student admission failed because the confirmation email could not be sent. The student was not saved. Please check email service and try again.",
        error: emailError.message,
      });
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
};

// Create student directly by admin (without application)
export const createStudentByAdmin = async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      gender,
      dateOfBirth,
      studentMobileNumber,
      emailAddress,
      program,
      batchId,
      batchName,
      rollNumber: providedRollNumber,
      // Optional fields
      bloodGroup,
      birthPlace,
      motherTongue,
      casteCategory,
      caste,
      aadharCardNumber,
      religion,
      prnNumber,
      abcNumber,
      grNumber,
      capApplicationId,
      address,
      registerNumber,
      enrollmentDate,
      fatherName,
      fatherEmail,
      fatherOccupation,
      fatherMobileNo,
      motherName,
      motherEmail,
      motherOccupation,
      motherMobileNo,
      familyAnnualIncome,
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !program || !batchId || !batchName) {
      return res.status(400).json({
        message: "Missing required fields: firstName, lastName, program, batchId, and batchName are required",
      });
    }

    // Check for duplicate aadhar if provided
    if (aadharCardNumber) {
      const existingStudent = await Student.findOne({
        "studentDetails.aadharCardNumber": aadharCardNumber,
        status: "active",
      });

      if (existingStudent) {
        return res.status(400).json({
          message: "A student with this Aadhar card number already exists",
        });
      }
    }

    // Check for sections
    const sections = await batchModel.find({
      batchName: { $regex: `^${batchName}-` },
    });
    if (sections.length > 0) {
      return res.status(400).json({
        message: "This batch has multiple sections. Please select a specific section.",
      });
    }

    const uniqueId = uuidv4();
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    // Use provided rollNumber if given, otherwise auto-generate
    const rollNumber = providedRollNumber || await generateRollNumber(lastName, program, batchName);

    const studentDetailsWithCaps = {
      firstName: firstName.toUpperCase(),
      middleName: middleName?.toUpperCase() || "",
      lastName: lastName.toUpperCase(),
      gender: gender || "",
      dateOfBirth: dateOfBirth || "",
      bloodGroup: bloodGroup || "",
      birthPlace: birthPlace?.toUpperCase() || "",
      motherTongue: motherTongue || "",
      casteCategory: casteCategory || "",
      caste: caste || "",
      aadharCardNumber: aadharCardNumber || "",
      religion: religion || "",
      studentMobileNumber: studentMobileNumber || "",
      emailAddress: emailAddress || "",
      prnNumber: prnNumber || "",
      abcNumber: abcNumber || "",
      grNumber: grNumber || "",
      capApplicationId: capApplicationId || "",
      address: address?.toUpperCase() || "",
    };

    // Handle photo and signature uploads to Cloudinary
    if (req.files?.photo) {
      const photoResult = await uploadToCloudinary(req.files.photo[0]);
      studentDetailsWithCaps.studentImage = photoResult.url;
    }

    if (req.files?.sign) {
      const signResult = await uploadToCloudinary(req.files.sign[0]);
      studentDetailsWithCaps.studentSign = signResult.url;
    }

    const familyBackgroundData = {
      fatherName: fatherName?.toUpperCase() || "",
      fatherEmail: fatherEmail || "",
      fatherOccupation: fatherOccupation || "",
      fatherMobileNo: fatherMobileNo || "",
      motherName: motherName?.toUpperCase() || "",
      motherEmail: motherEmail || "",
      motherOccupation: motherOccupation || "",
      motherMobileNo: motherMobileNo || "",
      familyAnnualIncome: familyAnnualIncome || "",
    };

    const newStudent = new Student({
      studentDetails: studentDetailsWithCaps,
      familyBackground: familyBackgroundData,
      certificates: [],
      academicDetails: {
        program: program,
        batch: {
          id: batchId,
          name: batchName,
        },
        registerNumber: registerNumber || "",
        rollNumber: rollNumber,
        subjects: [],
        enrollmentDate: enrollmentDate || "",
        yearOfJoining: new Date().getFullYear(),
      },
      status: "active",
      password: hashedPassword,
      studentId: uniqueId,
    });

    const savedStudent = await newStudent.save();

    // Send email with login details if email is provided
    if (emailAddress) {
      try {
        await transporter.sendMail({
          from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
          to: emailAddress,
          subject: "Student Registration - Login Details",
          text: "Your student account has been created",
          html: newUserStudentRegisterEmailWithLoginDetails(
            savedStudent.studentDetails.firstName,
            emailAddress,
            password,
            formattedDate,
          ),
        });
      } catch (emailError) {
        console.error("Failed to send registration email:", emailError);
        // Continue without failing - student is already created
      }
    }

    res.status(201).json({
      message: "Student created successfully!",
      student: savedStudent,
      loginDetails: {
        rollNumber: rollNumber,
        temporaryPassword: password,
        email: emailAddress || "Not provided",
      },
    });
  } catch (error) {
    console.error("Error creating student by admin:", error);
    res.status(500).json({ error: error.message });
  }
};

export const admitMultipleStudents = async (req, res) => {
  const { applicationIds, baseBatchName } = req.body;
  if (!applicationIds || !baseBatchName) {
    return res
      .status(400)
      .json({ message: "Missing required fields for bulk admission." });
  }

  try {
    const jobId = admissionService.startAdmissionJob(
      applicationIds,
      baseBatchName,
      req.user?.id || "system",
    );
    res.status(202).json({
      jobId,
      message: `Bulk admission job started for ${applicationIds.length} students.`,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to start bulk admission job.",
      error: error.message,
    });
  }
};

export const getAdmissionJobStatus = async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);
  if (job) {
    res.json(job);
  } else {
    res.status(404).json({ message: "Job not found" });
  }
};

export const getAllAdmissionJobs = async (req, res) => {
  const allJobs = getAllActiveJobs();
  const admissionJobs = allJobs.filter(
    (job) => job.metadata.type === "bulk-admission",
  );
  res.json(admissionJobs);
};

export const getRandomRollNumbers = async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 3;

    const students = await Student.aggregate([
      {
        $match: {
          status: "active",
          "academicDetails.rollNumber": { $exists: true, $ne: "" },
        },
      },
      { $sample: { size: count } },
      { $project: { _id: 0, rollNumber: "$academicDetails.rollNumber" } },
    ]);

    const rollNumbers = students
      .map((s) => s.rollNumber)
      .filter((r) => r && r.trim() !== "");
    res.json({ rollNumbers });
  } catch (error) {
    res.status(500).json({ error: "Could not fetch roll numbers." });
  }
};

export const getStudentsByBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const students = await Student.find({
      "academicDetails.batch.id": batchId,
      status: "active",
    }).sort({ "academicDetails.rollNumber": 1 });
    res.status(200).json({ students });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getStudentsBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { batchId } = req.query;

    let batchIds;

    if (batchId) {
      // If specific batchId provided, use only that batch
      batchIds = [batchId];
    } else {
      // Otherwise, find all batches with this subject
      const batches = await batchModel.find({ subjects: subjectId });
      if (!batches || batches.length === 0) {
        return res
          .status(404)
          .json({ message: "No batches found for this subject." });
      }
      batchIds = batches.map((b) => b._id);
    }

    const students = await studentModel
      .find({ "academicDetails.batch.id": { $in: batchIds }, status: "active" })
      .select(
        "studentDetails.firstName studentDetails.lastName academicDetails.rollNumber academicDetails.subjects",
      )
      .populate({
        path: "academicDetails.subjects.subject",
        model: "Subject",
        select: "markingScheme",
      })
      .sort({ "academicDetails.rollNumber": 1 });

    res.status(200).json({ students });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const downloadMarksTemplate = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { batchId } = req.query;

    const subject = await subjectModel.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    let batchIds;
    if (batchId) {
      // If specific batchId provided, use only that batch
      batchIds = [batchId];
    } else {
      // Otherwise, find all batches with this subject
      const batches = await batchModel.find({ subjects: subjectId });
      if (!batches || batches.length === 0) {
        return res.status(404).json({ message: "No batches for this subject" });
      }
      batchIds = batches.map((b) => b._id);
    }

    const students = await studentModel
      .find({ "academicDetails.batch.id": { $in: batchIds }, status: "active" })
      .select(
        "studentDetails.firstName studentDetails.lastName academicDetails.rollNumber academicDetails.subjects",
      )
      .populate("academicDetails.subjects.subject", "name")
      .sort({ "academicDetails.rollNumber": 1 });

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Internal Marks Entry");

    // Find internal scheme and its breakdown
    const internalScheme = subject.markingScheme.find(
      (scheme) => scheme.name.toLowerCase() === "internal",
    );

    if (!internalScheme) {
      return res.status(400).json({
        message: "No internal marking scheme found for this subject",
      });
    }

    // Check if breakdown has valid values (not null/undefined/0)
    const hasValidBreakdown = internalScheme.breakdown?.length > 0 && 
      internalScheme.breakdown.some((item) => item.value != null && item.value > 0);
    
    // Use valid breakdown items or single Internal field
    const internalFields = hasValidBreakdown 
      ? internalScheme.breakdown.filter((item) => item.value != null && item.value > 0)
      : [{ name: "Internal", value: internalScheme.value }];

    // Create headers based on internal breakdown only
    const headers = [
      { header: "Roll No", key: "rollNo", width: 15 },
      { header: "Full Name", key: "fullName", width: 30 },
    ];

    // Add internal columns (breakdown items or single Internal)
    internalFields.forEach((item) => {
      headers.push({
        header: `${item.name} (Max: ${item.value})`,
        key: item.name,
        width: 20,
      });
    });

    // Add Total Internal column
    const totalInternalMax = internalFields.reduce(
      (sum, item) => sum + item.value,
      0,
    );
    headers.push({
      header: `Total Internal (Max: ${totalInternalMax})`,
      key: "totalInternal",
      width: 20,
    });

    worksheet.columns = headers;

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    worksheet.getRow(1).font = { color: { argb: "FFFFFFFF" }, bold: true };

    // Add student data
    let rowIndex = 2;
    students.forEach((student) => {
      const subjectData = student.academicDetails.subjects.find(
        (s) => s.subject && s.subject._id.toString() === subjectId,
      );

      const row = {
        rollNo: student.academicDetails.rollNumber,
        fullName: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
      };

      // Add marks for each internal field
      internalFields.forEach((item) => {
        const mark = subjectData?.marks.find((m) => m.schemeName === item.name);
        row[item.name] = mark ? mark.obtainedMarks : "";
      });

      worksheet.addRow(row);

      // Add formula for Total Internal column
      const startCol = 3;
      const endCol = startCol + internalFields.length - 1;
      const totalCell = worksheet.getCell(rowIndex, endCol + 1);
      totalCell.value = {
        formula: `SUM(${worksheet.getColumn(startCol).letter}${rowIndex}:${worksheet.getColumn(endCol).letter}${rowIndex})`,
      };

      rowIndex++;
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=marks-template-${subject.subjectCode}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const uploadMarks = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { batchId } = req.query;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const subject = await subjectModel.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    // Find internal scheme
    const internalScheme = subject.markingScheme.find(
      (scheme) => scheme.name.toLowerCase() === "internal",
    );

    if (!internalScheme) {
      return res.status(400).json({
        message: "No internal marking scheme found for this subject",
      });
    }

    // Check if breakdown has valid values (not null/undefined/0)
    const hasValidBreakdown = internalScheme.breakdown?.length > 0 && 
      internalScheme.breakdown.some((item) => item.value != null && item.value > 0);
    
    // Use valid breakdown items or single Internal field
    const internalFields = hasValidBreakdown 
      ? internalScheme.breakdown.filter((item) => item.value != null && item.value > 0)
      : [{ name: "Internal", value: internalScheme.value }];

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return res
        .status(400)
        .json({ message: "No worksheet found in the file" });
    }

    const rowsData = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        rowsData.push({
          rollNo: row.getCell(1).value,
          cells: row.values,
        });
      }
    });

    let updatedCount = 0;
    let failedCount = 0;

    for (const rowData of rowsData) {
      try {
        const rollNo = rowData.rollNo;
        if (!rollNo) continue;

        const query = {
          "academicDetails.rollNumber": rollNo,
          status: "active",
        };

        // If batchId provided, filter by batch as well
        if (batchId) {
          query["academicDetails.batch.id"] = batchId;
        }

        const student = await studentModel.findOne(query);

        if (student) {
          const marksToUpdate = [];

          // Process internal fields (breakdown items or single Internal, skip Total Internal column)
          internalFields.forEach((item, index) => {
            const markValue = rowData.cells[index + 3]; // +3 because columns are: rollNo, fullName, then marks
            if (
              markValue !== undefined &&
              markValue !== null &&
              markValue !== ""
            ) {
              marksToUpdate.push({
                schemeName: item.name,
                obtainedMarks: Number(markValue),
              });
            }
          });

          if (marksToUpdate.length > 0) {
            const subjectIndex = student.academicDetails.subjects.findIndex(
              (s) => s.subject && s.subject.toString() === subjectId,
            );

            if (subjectIndex > -1) {
              const marks =
                student.academicDetails.subjects[subjectIndex].marks;

              marksToUpdate.forEach((newMark) => {
                const existingMarkIndex = marks.findIndex(
                  (m) => m.schemeName === newMark.schemeName,
                );

                if (existingMarkIndex > -1) {
                  marks[existingMarkIndex].obtainedMarks =
                    newMark.obtainedMarks;
                } else {
                  marks.push(newMark);
                }
              });
            } else {
              student.academicDetails.subjects.push({
                subject: subjectId,
                marks: marksToUpdate,
              });
            }
            await student.save();
            updatedCount++;
          }
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(
          `Error processing row for roll no ${rowData.rollNo}:`,
          error,
        );
        failedCount++;
      }
    }

    res.status(200).json({
      message: "Marks upload completed",
      updated: updatedCount,
      failed: failedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const loginStudent = async (req, res) => {
  const { email, password } = req.body;

  try {
    let student = await Student.findOne({
      "studentDetails.emailAddress": email,
    });
    let isArchived = false;

    if (!student) {
      const archived = await ArchivedStudent.findOne({
        "studentDetails.emailAddress": email,
        "permissions.canLogin": true,
      });
      if (archived) {
        student = archived;
        isArchived = true;
      }
    }

    if (!student) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    const token = jwt.sign(
      { studentId: student._id, ...(isArchived && { isArchived: true }) },
      JWT_SECRET,
      { expiresIn: "12h" },
    );
    res.status(200).json({
      token,
      isAdmin: false,
      isArchived,
      data: {
        _id: student._id,
        studentDetails: {
          firstName: student.studentDetails.firstName,
          middleName: student.studentDetails.middleName,
          lastName: student.studentDetails.lastName,
          studentMobileNumber: student.studentDetails.studentMobileNumber,
          emailAddress: student.studentDetails.emailAddress,
        },
        academicDetails: {
          program: isArchived ? student.academicDetails.program : student.academicDetails.program,
          batch: student.academicDetails.batch,
          rollNumber: student.academicDetails.rollNumber,
        },
        ...(isArchived && { permissions: student.permissions }),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllStudentsForABatch = async (req, res) => {
  try {
    const { batchName, subjectId } = req.query;
    const students = await Student.find({
      "academicDetails.batch.name": batchName,
      status: "active",
    })
      .populate("academicDetails.subjects.subject")
      .sort({ "academicDetails.rollNumber": 1 });

    const formattedStudents = students.map((student) => {
      let subjectData = null;
      if (subjectId) {
        subjectData = student.academicDetails.subjects.find((s) => {
          if (!s.subject) return false;
          const subjectIdStr = s.subject._id
            ? s.subject._id.toString()
            : s.subject.toString();
          return subjectIdStr === subjectId;
        });
      }

      return {
        _id: student._id,
        studentDetails: student.studentDetails,
        academicDetails: {
          rollNumber: student.academicDetails.rollNumber,
          batch: student.academicDetails.batch,
        },
        marks: subjectData ? subjectData.marks : [],
      };
    });
    res.status(200).json({ students: formattedStudents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateAStudentMarks = async (req, res) => {
  try {
    const { studentId, subjectId, marks } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(studentId) ||
      !mongoose.Types.ObjectId.isValid(subjectId)
    ) {
      return res
        .status(400)
        .json({ message: "Invalid studentId or subjectId" });
    }

    const student = await studentModel.findOne({
      _id: studentId,
      status: "active",
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found or inactive" });
    }

    const subject = await subjectModel.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const subjectIndex = student.academicDetails.subjects.findIndex(
      (subjectItem) =>
        subjectItem.subject &&
        subjectItem.subject.toString() === subjectId.toString(),
    );

    const newMarksData = marks.map((mark) => ({
      schemeName: mark.schemeName,
      obtainedMarks: Number(mark.obtainedMarks),
    }));

    if (subjectIndex === -1) {
      student.academicDetails.subjects.push({
        subject: subjectId,
        marks: newMarksData,
      });
    } else {
      const existingMarks =
        student.academicDetails.subjects[subjectIndex].marks;
      const updatedMarks = [...existingMarks];

      const oldInternalMark = existingMarks.find(
        (m) => m.schemeName.toLowerCase() === "internal",
      );

      if (oldInternalMark && oldInternalMark.obtainedMarks > 0) {
        const internalComponents = subject.markingScheme.filter(
          (scheme) => scheme.name.toLowerCase() !== "external",
        );

        if (internalComponents.length > 0) {
          const distributedMarks =
            oldInternalMark.obtainedMarks / internalComponents.length;

          internalComponents.forEach((component) => {
            const existingComponentMark = updatedMarks.find(
              (m) => m.schemeName === component.name,
            );

            if (!existingComponentMark) {
              updatedMarks.push({
                schemeName: component.name,
                obtainedMarks: distributedMarks,
              });
            }
          });

          const internalIndex = updatedMarks.findIndex(
            (m) => m.schemeName.toLowerCase() === "internal",
          );
          if (internalIndex > -1) {
            updatedMarks.splice(internalIndex, 1);
          }
        }
      }

      newMarksData.forEach((newMark) => {
        const existingMarkIndex = updatedMarks.findIndex(
          (em) => em.schemeName === newMark.schemeName,
        );
        if (existingMarkIndex > -1) {
          updatedMarks[existingMarkIndex] = newMark;
        } else {
          updatedMarks.push(newMark);
        }
      });
      student.academicDetails.subjects[subjectIndex].marks = updatedMarks;
    }

    await student.save();

    return res.status(200).json({ message: "Marks updated successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

export const getMyMarks = async (req, res) => {
  try {
    const studentId = req.user.studentId;

    if (req.user.isArchived) {
      const archived = await ArchivedStudent.findById(studentId);
      if (!archived || !archived.permissions?.canViewResults)
        return res.status(403).json({ message: "You do not have permission to view results." });
      return res.status(200).json({ marks: [] });
    }

    const student = await Student.findById(studentId)
      .populate({
        path: "academicDetails.subjects.subject",
        model: "Subject",
      })
      .populate({
        path: "academicDetails.batch.id",
        model: "Batch",
      });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (
      !student.academicDetails.batch.id ||
      !student.academicDetails.batch.id.marksVisible
    ) {
      return res.status(403).json({ message: "Marks are not yet available." });
    }

    const marks = student.academicDetails.subjects
      .map((subjectData) => {
        const subject = subjectData.subject;
        if (!subject) return null;

        const totalObtained = subjectData.marks.reduce(
          (sum, mark) => sum + (Number(mark.obtainedMarks) || 0),
          0,
        );
        const totalMaximum = subject.markingScheme.reduce(
          (sum, scheme) => sum + (Number(scheme.value) || 0),
          0,
        );

        return {
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          marks: subjectData.marks,
          totalObtained,
          totalMaximum,
        };
      })
      .filter(Boolean);

    res.status(200).json({ marks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getMyNotes = async (req, res) => {
  try {
    const studentId = req.user.studentId;

    if (req.user.isArchived) {
      const archived = await ArchivedStudent.findById(studentId);
      if (!archived || !archived.permissions?.canViewNotes)
        return res.status(403).json({ message: "You do not have permission to view notes." });
      const batchId = archived.academicDetails?.batch?.id;
      if (!batchId) return res.status(404).json({ message: "Batch not found." });
      const batch = await batchModel.findById(batchId).populate("subjects");
      if (!batch || !batch.subjects?.length)
        return res.status(404).json({ message: "Batch subjects not found." });
      const subjects = batch.subjects;
      const notesResults = await Promise.all(
        subjects.map((s) => Note.find({ "batch.id": batchId, "subject.id": s._id }).populate("faculty", "facultyName")),
      );
      const notesBySubject = subjects.reduce((acc, subject, i) => {
        acc[subject.subjectName] = notesResults[i];
        return acc;
      }, {});
      return res.status(200).json({ subjects, notes: notesBySubject });
    }

    const student = await studentModel.findById(studentId);
    if (!student || !student.academicDetails?.batch?.id) {
      return res.status(404).json({ message: "Student or batch not found." });
    }

    const batchId = student.academicDetails.batch.id;

    // Get the batch to find all subjects assigned to it
    const batch = await batchModel.findById(batchId).populate("subjects");
    if (!batch || !batch.subjects || batch.subjects.length === 0) {
      return res.status(404).json({ message: "Batch subjects not found." });
    }

    // Get all subjects from the batch
    const subjects = batch.subjects;
    const subjectIds = subjects.map((s) => s._id);

    // Fetch all notes for these subjects in this batch
    const notesPromises = subjectIds.map((subjectId) =>
      Note.find({
        "batch.id": batchId,
        "subject.id": subjectId,
      }).populate("faculty", "facultyName"),
    );

    const notesResults = await Promise.all(notesPromises);

    // Group notes by subject
    const notesBySubject = subjects.reduce((acc, subject, index) => {
      acc[subject.subjectName] = notesResults[index];
      return acc;
    }, {});

    res.status(200).json({ subjects, notes: notesBySubject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const forgotStudentPassword = async (req, res) => {
  const { email } = req.body;
  const newPassword = generatePassword();
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  try {
    let student = await studentModel.findOne({
      "studentDetails.emailAddress": email,
    });
    if (!student) {
      student = await ArchivedStudent.findOne({
        "studentDetails.emailAddress": email,
        "permissions.canResetPassword": true,
      });
    }
    if (!student) {
      return res.status(400).json({ message: "Student not found" });
    }
    student.password = hashedPassword;
    await student.save();

    await transporter.sendMail({
      from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: "Password Reset - Agnel School of Law",
      text: `Your new password is: ${newPassword}`,
      html: `<p>Your new password is: <b>${newPassword}</b></p>`,
    });
    res.json({ message: "New password sent to your email." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

//------------------------------------------------------------

export const sendBirthdayWishesToStudents = async () => {
  try {
    const today = new Date();
    const month = (today.getMonth() + 1).toString().padStart(2, "0");
    const day = today.getDate().toString().padStart(2, "0");
    const datePattern = `-${month}-${day}`;

    const students = await Student.find({
      status: "active",
      "studentDetails.dateOfBirth": { $regex: datePattern + "$" },
    });

    for (const student of students) {
      await transporter.sendMail({
        from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
        to: student.studentDetails.emailAddress,
        subject: "Happy Birthday! 🎉",
        text: "Happy Birthday!",
        html: birthdayWishesEmail(
          student.studentDetails.firstName,
          formattedDate,
        ),
      });
    }

    return {
      success: true,
      message: `Birthday wishes sent to ${students.length} students`,
      recipients: students.map((s) => s.studentDetails.firstName),
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
};

export const bulkUpdateMarksFromExcel = async (req, res) => {
  try {
    const { subjectId } = req.params;
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const subject = await subjectModel.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    // Find internal scheme and external scheme
    const internalScheme = subject.markingScheme.find(
      (scheme) => scheme.name.toLowerCase() === "internal",
    );
    const externalScheme = subject.markingScheme.find(
      (scheme) => scheme.name.toLowerCase() === "external",
    );

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return res
        .status(400)
        .json({ message: "No worksheet found in the file" });
    }

    const rowsData = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        rowsData.push({
          rollNo: row.getCell(1).value,
          cells: row.values,
        });
      }
    });

    let updatedCount = 0;
    let failedCount = 0;

    for (const rowData of rowsData) {
      try {
        const rollNo = rowData.rollNo;
        if (!rollNo) continue;

        const student = await Student.findOne({
          "academicDetails.rollNumber": rollNo,
          status: "active",
        });

        if (student) {
          const marksToUpdate = [];
          let columnIndex = 3; // Start after Roll No and Full Name

          // Check if breakdown has valid values (not null/undefined/0)
          const hasValidBreakdown = internalScheme?.breakdown?.length > 0 && 
            internalScheme.breakdown.some((item) => item.value != null && item.value > 0);
          
          // Use valid breakdown items or single Internal field
          const internalFields = hasValidBreakdown 
            ? internalScheme.breakdown.filter((item) => item.value != null && item.value > 0)
            : (internalScheme?.value ? [{ name: "Internal", value: internalScheme.value }] : []);

          // Process internal fields
          if (internalFields.length > 0) {
            internalFields.forEach((item) => {
              const markValue = rowData.cells[columnIndex];
              if (
                markValue !== undefined &&
                markValue !== null &&
                markValue !== ""
              ) {
                marksToUpdate.push({
                  schemeName: item.name,
                  obtainedMarks: Number(markValue),
                });
              }
              columnIndex++;
            });
          }

          // Skip Total Internal column (it's a calculated field)
          if (internalFields.length > 0) {
            columnIndex++;
          }

          // Process external mark
          if (externalScheme) {
            const externalValue = rowData.cells[columnIndex];
            if (
              externalValue !== undefined &&
              externalValue !== null &&
              externalValue !== ""
            ) {
              marksToUpdate.push({
                schemeName: "External",
                obtainedMarks: Number(externalValue),
              });
            }
          }

          if (marksToUpdate.length > 0) {
            const subjectIndex = student.academicDetails.subjects.findIndex(
              (s) => s.subject && s.subject.toString() === subjectId,
            );

            if (subjectIndex > -1) {
              const marks =
                student.academicDetails.subjects[subjectIndex].marks;

              marksToUpdate.forEach((newMark) => {
                const existingMarkIndex = marks.findIndex(
                  (m) => m.schemeName === newMark.schemeName,
                );

                if (existingMarkIndex > -1) {
                  marks[existingMarkIndex].obtainedMarks =
                    newMark.obtainedMarks;
                } else {
                  marks.push(newMark);
                }
              });
            } else {
              student.academicDetails.subjects.push({
                subject: subjectId,
                marks: marksToUpdate,
              });
            }
            await student.save();
            updatedCount++;
          }
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(
          `Error processing row for roll no ${rowData.rollNo}:`,
          error,
        );
        failedCount++;
      }
    }

    res.status(200).json({
      message: "Marks upload completed",
      updated: updatedCount,
      failed: failedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const cancelStudentAdmission = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { note } = req.body;

    const archivedStudent = await studentArchiveService.archiveStudent(
      studentId,
      "cancelled",
      {
        note: note || "Admission cancelled",
        archivedBy: req.user?.id || null,
        updateApplication: true,
      },
    );

    res.status(200).json({
      success: true,
      message: "Student admission cancelled and archived successfully",
      archivedStudent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error cancelling student admission",
      error: error.message,
    });
  }
};

// Get all archived students with pagination and filters
export const getArchivedStudents = async (req, res) => {
  try {
    const { page, limit, reason, program, batch, searchText } = req.query;

    const result = await studentArchiveService.getArchivedStudents({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      reason,
      program,
      batch,
      searchText,
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Restore archived student back to active
export const restoreArchivedStudent = async (req, res) => {
  try {
    const { archivedStudentId } = req.params;
    const { restoreStatus } = req.body;

    const restoredStudent = await studentArchiveService.restoreStudent(
      archivedStudentId,
      {
        restoredBy: req.user?.id || null,
        restoreStatus: restoreStatus || "active",
      },
    );

    res.status(200).json({
      success: true,
      message: "Student restored successfully",
      student: restoredStudent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error restoring student",
      error: error.message,
    });
  }
};

// Get archive statistics
export const getArchiveStats = async (req, res) => {
  try {
    const stats = await studentArchiveService.getArchiveStats();
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Archive student with custom reason (for graduated, transferred, etc.)
export const archiveStudentWithReason = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reason, note } = req.body;

    if (!reason || !["inactive", "graduated", "cancelled", "transferred", "other"].includes(reason)) {
      return res.status(400).json({ message: "Valid archive reason is required" });
    }

    const archivedStudent = await studentArchiveService.archiveStudent(
      studentId,
      reason,
      {
        note: note || "",
        archivedBy: req.user?.id || null,
        updateApplication: reason === "cancelled",
      },
    );

    res.status(200).json({
      success: true,
      message: `Student archived successfully with reason: ${reason}`,
      archivedStudent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error archiving student",
      error: error.message,
    });
  }
};

// Get single archived student details
export const getArchivedStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await ArchivedStudent.findById(id)
      .populate("archivedBy", "name email");

    if (!student) {
      return res.status(404).json({ message: "Archived student not found" });
    }

    res.json({ student });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getArchivedPermissions = async (req, res) => {
  try {
    const student = await ArchivedStudent.findById(req.params.id).select("permissions studentDetails.firstName studentDetails.lastName");
    if (!student) return res.status(404).json({ message: "Archived student not found" });
    res.json({ permissions: student.permissions || {}, student: { firstName: student.studentDetails?.firstName, lastName: student.studentDetails?.lastName } });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateArchivedPermissions = async (req, res) => {
  try {
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== "object")
      return res.status(400).json({ message: "permissions object is required" });

    const allowed = ["canLogin", "canResetPassword", "canViewResults", "canViewNotes", "canSelectElectives"];
    const update = {};
    for (const key of allowed) {
      if (key in permissions) update[`permissions.${key}`] = !!permissions[key];
    }

    const student = await ArchivedStudent.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!student) return res.status(404).json({ message: "Archived student not found" });
    res.json({ message: "Permissions updated", permissions: student.permissions });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const bulkUpdateArchivedPermissions = async (req, res) => {
  try {
    const { permissions, filter } = req.body;
    if (!permissions || typeof permissions !== "object")
      return res.status(400).json({ message: "permissions object is required" });

    const allowed = ["canLogin", "canResetPassword", "canViewResults", "canViewNotes", "canSelectElectives"];
    const update = {};
    for (const key of allowed) {
      if (key in permissions) update[`permissions.${key}`] = !!permissions[key];
    }

    const query = {};
    if (filter?.reason) query.archiveReason = filter.reason;
    if (filter?.batchId) query["academicDetails.batch.id"] = filter.batchId;
    if (filter?.studentIds?.length) query._id = { $in: filter.studentIds };

    const result = await ArchivedStudent.updateMany(query, { $set: update });
    res.json({ message: "Bulk permissions updated", modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const downloadMarksExcelTemplate = async (req, res) => {
  try {
    const { batchId, subjectId } = req.params;

    const students = await Student.find({
      "academicDetails.batch.id": batchId,
      status: "active",
    }).select(
      "studentDetails.firstName studentDetails.lastName academicDetails.rollNumber academicDetails.subjects",
    ).sort({ "academicDetails.rollNumber": 1 });

    const subject = await subjectModel.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Marks Entry");

    // Find internal scheme and external scheme
    const internalScheme = subject.markingScheme.find(
      (scheme) => scheme.name.toLowerCase() === "internal",
    );
    const externalScheme = subject.markingScheme.find(
      (scheme) => scheme.name.toLowerCase() === "external",
    );

    // Create headers
    const headers = [
      { header: "Roll No", key: "rollNo", width: 15 },
      { header: "Full Name", key: "fullName", width: 30 },
    ];

    // Check if breakdown has valid values (not null/undefined/0)
    const hasValidBreakdown = internalScheme?.breakdown?.length > 0 && 
      internalScheme.breakdown.some((item) => item.value != null && item.value > 0);
    
    // Use valid breakdown items or single Internal field
    const internalFields = hasValidBreakdown 
      ? internalScheme.breakdown.filter((item) => item.value != null && item.value > 0)
      : (internalScheme?.value ? [{ name: "Internal", value: internalScheme.value }] : []);

    // Add internal columns if available
    if (internalFields.length > 0) {
      internalFields.forEach((item) => {
        headers.push({
          header: `${item.name} (Max: ${item.value})`,
          key: item.name,
          width: 20,
        });
      });
    }

    // Add Total Internal column if internal scheme exists
    if (internalFields.length > 0) {
      const totalInternalMax = internalFields.reduce(
        (sum, item) => sum + (item.value || 0),
        0,
      );
      headers.push({
        header: `Total Internal (Max: ${totalInternalMax})`,
        key: "totalInternal",
        width: 20,
      });
    }

    // Add external column if available
    if (externalScheme) {
      headers.push({
        header: `External (Max: ${externalScheme.value})`,
        key: "External",
        width: 20,
      });
    }

    worksheet.columns = headers;

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    worksheet.getRow(1).font = { color: { argb: "FFFFFFFF" }, bold: true };

    // Add student data
    let rowIndex = 2;
    students.forEach((student) => {
      const subjectData = student.academicDetails.subjects.find(
        (s) => s.subject && s.subject.toString() === subjectId,
      );

      const row = {
        rollNo: student.academicDetails.rollNumber,
        fullName: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
      };

      // Add marks for internal fields
      if (internalFields.length > 0) {
        internalFields.forEach((item) => {
          const mark = subjectData?.marks.find(
            (m) => m.schemeName === item.name,
          );
          row[item.name] = mark ? mark.obtainedMarks : "";
        });
      }

      // Add external mark
      if (externalScheme) {
        const externalMark = subjectData?.marks.find(
          (m) => m.schemeName === "External",
        );
        row["External"] = externalMark ? externalMark.obtainedMarks : "";
      }

      worksheet.addRow(row);

      // Add formula for Total Internal column (before External)
      if (internalFields.length > 0) {
        const startCol = 3;
        const endCol = startCol + internalFields.length - 1;
        const totalCol = endCol + 1;
        const totalCell = worksheet.getCell(rowIndex, totalCol);
        totalCell.value = {
          formula: `SUM(${worksheet.getColumn(startCol).letter}${rowIndex}:${worksheet.getColumn(endCol).letter}${rowIndex})`,
        };
      }

      rowIndex++;
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=marks-template-${subject.subjectCode}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const changeStudentPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const studentId = req.user.studentId;

    // Find the student by ID
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, student.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash new password and save
    const salt = await bcrypt.genSalt(10);
    student.password = await bcrypt.hash(newPassword, salt);
    await student.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getIdCardSystemHealth = async (req, res) => {
  try {
    const systemHealth = {
      serviceHealthy: idCardService.isHealthy(),
      queueStats: idCardService.isHealthy()
        ? idCardService.getQueueStats()
        : null,
      jobStats: getJobStats(),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };

    res.json(systemHealth);
  } catch (error) {
    res.status(500).json({
      message: "Error getting system health",
      error: error.message,
    });
  }
};

export const getAllIdCardJobs = async (req, res) => {
  try {
    const { status, limit = 20 } = req.query;
    let jobs = getAllActiveJobs();

    if (status) {
      jobs = jobs.filter((job) => job.status === status);
    }

    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    jobs = jobs.slice(0, parseInt(limit));

    res.json({
      jobs,
      total: jobs.length,
      systemStats: idCardService.isHealthy()
        ? idCardService.getQueueStats()
        : null,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error getting jobs",
      error: error.message,
    });
  }
};

export const cancelIdCardJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getJob(jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.status === "completed") {
      return res.status(400).json({ message: "Cannot cancel completed job" });
    }

    if (job.status === "failed") {
      return res.status(400).json({ message: "Job already failed" });
    }

    updateJob(jobId, {
      status: "cancelled",
      error: "Job cancelled by user",
      progress: job.progress,
    });

    res.json({
      message: "Job cancellation requested",
      jobId,
      note: "The job will be cancelled when the current chunk completes processing",
    });
  } catch (error) {
    res.status(500).json({
      message: "Error cancelling job",
      error: error.message,
    });
  }
};

export const bulkGenerateIdCards = async (req, res) => {
  try {
    const {
      batchIds,
      programs,
      yearOfJoining,
      maxStudents = 500,
      priority = "normal",
    } = req.body;

    let studentQuery = { status: "active" };

    if (batchIds && batchIds.length > 0) {
      studentQuery["academicDetails.batch.id"] = { $in: batchIds };
    }

    if (programs && programs.length > 0) {
      studentQuery["academicDetails.program"] = { $in: programs };
    }

    if (yearOfJoining) {
      studentQuery["academicDetails.yearOfJoining"] = yearOfJoining;
    }

    const students = await Student.find(studentQuery)
      .limit(maxStudents)
      .select(
        "_id studentDetails.firstName studentDetails.lastName academicDetails.rollNumber",
      );

    if (students.length === 0) {
      return res
        .status(400)
        .json({ message: "No students found matching criteria" });
    }

    const studentIds = students.map((s) => s._id.toString());

    if (!idCardService.isHealthy()) {
      await idCardService.initialize();
    }

    const jobId = await idCardService.generateIdCards(studentIds, {
      requestedBy: req.user?.id || "system",
      priority,
      bulkGeneration: true,
      filters: { batchIds, programs, yearOfJoining },
      clientInfo: {
        userAgent: req.get("User-Agent"),
        ip: req.ip,
      },
    });

    res.status(202).json({
      jobId,
      message: `Bulk ID card generation queued for ${students.length} students`,
      studentsCount: students.length,
      estimatedProcessingTime: `${Math.ceil(students.length / 20)} minutes`,
      filters: { batchIds, programs, yearOfJoining },
      queueStats: idCardService.getQueueStats(),
    });
  } catch (error) {
    console.error("Error in bulk ID card generation:", error);
    res.status(500).json({
      message: "Failed to start bulk ID card generation",
      error: error.message,
    });
  }
};

// Get student profile (self)
export const getMyProfile = async (req, res) => {
  try {
    const studentId = req.user.studentId;

    if (req.user.isArchived) {
      const archived = await ArchivedStudent.findById(studentId);
      if (!archived) return res.status(404).json({ message: "Student not found" });
      return res.status(200).json({
        studentDetails: archived.studentDetails,
        familyBackground: archived.familyBackground,
        academicDetails: archived.academicDetails,
        selectedElectives: [],
        status: "archived",
        certificates: archived.certificates || [],
        isArchived: true,
        permissions: archived.permissions,
      });
    }

    const student = await studentModel
      .findById(studentId)
      .populate({
        path: "academicDetails.batch.id",
        model: "Batch",
        populate: {
          path: "subjects",
          model: "Subject",
        },
      })
      .populate({
        path: "selectedElectives.subject",
        model: "Subject",
      });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json({
      studentDetails: student.studentDetails,
      familyBackground: student.familyBackground,
      academicDetails: {
        program: student.academicDetails.program,
        batch: student.academicDetails.batch,
        rollNumber: student.academicDetails.rollNumber,
        registerNumber: student.academicDetails.registerNumber,
        enrollmentDate: student.academicDetails.enrollmentDate,
        yearOfJoining: student.academicDetails.yearOfJoining,
      },
      selectedElectives: student.selectedElectives || [],
      status: student.status,
      certificates: student.certificates || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get available electives for the logged-in student's batch
export const getMyElectives = async (req, res) => {
  try {
    const studentId = req.user.studentId;

    if (req.user.isArchived) {
      const archived = await ArchivedStudent.findById(studentId);
      if (!archived || !archived.permissions?.canSelectElectives)
        return res.status(403).json({ message: "You do not have permission to select electives." });
    }

    const student = req.user.isArchived
      ? await ArchivedStudent.findById(studentId)
      : await studentModel.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const batchId = student.academicDetails?.batch?.id;
    if (!batchId) {
      return res.status(400).json({ message: "No batch assigned" });
    }

    const batch = await batchModel
      .findById(batchId)
      .populate("subjects");
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const batchGroup = await batchGroupModel.findOne({ batches: batchId });
    if (!batchGroup) {
      return res.status(400).json({ message: "Batch is not part of any batch group" });
    }

    const session = await ElectiveSession.findOne({
      batchGroup: batchGroup._id,
      status: { $in: ["open", "closed", "locked"] },
    }).sort({ createdAt: -1 });

    const isOpen = session?.status === "open";
    const isStudentLocked = session?.lockedStudents?.some((ls) => ls.toString() === studentId);
    const now = new Date();
    const isPastDeadline = session?.closeAt && now > new Date(session.closeAt);
    const selectionOpen = isOpen && !isStudentLocked && !isPastDeadline;

    const electivePool = batch.subjects.filter((s) => s.isElective);

    const maxElectives = session?.maxSelectionsPerStudent || batch.maxElectives || 0;

    let selectionCounts = {};
    if (session) {
      const groupBatchIds = batchGroup.batches.map((b) => b.toString());
      const allStudents = await studentModel.find({
        "academicDetails.batch.id": { $in: groupBatchIds },
        status: "active",
        "selectedElectives.0": { $exists: true },
      }).select("selectedElectives");
      for (const s of allStudents) {
        for (const e of s.selectedElectives) {
          const sid = e.subject.toString();
          selectionCounts[sid] = (selectionCounts[sid] || 0) + 1;
        }
      }
    }

    res.status(200).json({
      batch: {
        _id: batch._id,
        batchName: batch.batchName,
        program: batch.program,
      },
      batchGroup: {
        _id: batchGroup._id,
        groupName: batchGroup.groupName,
      },
      maxElectives,
      electives: electivePool.map((s) => ({
        _id: s._id,
        subjectName: s.subjectName,
        subjectCode: s.subjectCode,
        selectionCount: selectionCounts[s._id.toString()] || 0,
        ...(session?.capacityPerSubject > 0 && { capacity: session.capacityPerSubject }),
      })),
      selectedElectives: (student.selectedElectives || []).map((e) =>
        e.subject.toString()
      ),
      session: session
        ? {
            _id: session._id,
            name: session.name,
            status: session.status,
            selectionOpen,
            allowReselection: session.allowReselection,
            closeAt: session.closeAt,
            isStudentLocked,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Submit elective selection
export const submitElectiveSelection = async (req, res) => {
  try {
    const studentId = req.user.studentId;
    const { subjectIds } = req.body;

    if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Please select at least one elective" });
    }

    if (req.user.isArchived) {
      const archived = await ArchivedStudent.findById(studentId);
      if (!archived || !archived.permissions?.canSelectElectives)
        return res.status(403).json({ message: "You do not have permission to select electives." });
    }

    const student = req.user.isArchived
      ? await ArchivedStudent.findById(studentId)
      : await studentModel.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const batchId = student.academicDetails?.batch?.id;
    if (!batchId) {
      return res.status(400).json({ message: "No batch assigned" });
    }

    const batchGroup = await batchGroupModel.findOne({ batches: batchId });

    const session = batchGroup
      ? await ElectiveSession.findOne({
          batchGroup: batchGroup._id,
          status: "open",
        }).sort({ createdAt: -1 })
      : null;

    if (session) {
      const now = new Date();
      if (session.closeAt && now > new Date(session.closeAt))
        return res.status(400).json({ message: "Selection deadline has passed" });
      if (session.lockedStudents?.some((ls) => ls.toString() === studentId))
        return res.status(403).json({ message: "Your selection has been locked by the admin" });
      if (!session.allowReselection && student.selectedElectives?.length > 0)
        return res.status(400).json({ message: "Reselection is not allowed for this session" });

      if (session.capacityPerSubject > 0) {
        const groupBatchIds = batchGroup.batches.map((b) => b.toString());
        const allStudents = await studentModel.find({
          "academicDetails.batch.id": { $in: groupBatchIds },
          status: "active",
          _id: { $ne: studentId },
          "selectedElectives.0": { $exists: true },
        }).select("selectedElectives");
        const counts = {};
        for (const s of allStudents) {
          for (const e of s.selectedElectives) counts[e.subject.toString()] = (counts[e.subject.toString()] || 0) + 1;
        }
        for (const id of subjectIds) {
          if ((counts[id] || 0) >= session.capacityPerSubject)
            return res.status(400).json({ message: `Elective is at capacity`, subjectId: id });
        }
      }
    }

    const batch = await batchModel
      .findById(batchId)
      .populate("subjects");
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const validElectiveIds = batch.subjects
      .filter((s) => s.isElective)
      .map((s) => s._id.toString());

    const invalidIds = subjectIds.filter(
      (id) => !validElectiveIds.includes(id)
    );
    if (invalidIds.length > 0) {
      return res
        .status(400)
        .json({ message: "Invalid elective selection", invalidIds });
    }

    const maxElectives = session?.maxSelectionsPerStudent || batch.maxElectives || 0;
    if (maxElectives > 0 && subjectIds.length > maxElectives) {
      return res.status(400).json({
        message: `You can select at most ${maxElectives} elective(s)`,
        maxElectives,
      });
    }

    student.selectedElectives = subjectIds.map((id) => ({
      subject: id,
      selectedAt: new Date(),
    }));

    await student.save();

    res.status(200).json({
      message: "Elective selection saved successfully",
      selectedElectives: student.selectedElectives,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
