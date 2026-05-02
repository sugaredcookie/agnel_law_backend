import RegularExamSession from "../models/regularExamSessionModel.js";
import RegularExamSubjectConfig from "../models/regularExamSubjectConfigModel.js";
import RegularExamEnrollment from "../models/regularExamEnrollmentModel.js";
import Student from "../models/studentModel.js";
import Application from "../models/applicationModel.js";
import Subject from "../models/subjectModel.js";
import mongoose from "mongoose";
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import archiver from "archiver";
import {
  createWorkbook,
  createStandardWorksheet,
  sendExcelResponse,
  formatExcelDate,
} from "../utils/excelHelper.js";
import { createJob, updateJob, getJob } from "../utils/jobManager.js";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== HELPER FUNCTIONS ====================

const loadImageAsBase64 = async (imagePath) => {
  try {
    const imageBuffer = await fs.promises.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    console.error(`Error loading image ${imagePath}:`, error);
    return "";
  }
};

const urlToBase64 = async (url, fallback = "") => {
  if (!url) return fallback;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "image/png";
    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  } catch (error) {
    console.error(`Error converting URL to base64 for ${url}:`, error);
    return fallback;
  }
};

const getStudentImageUrl = async (student, type) => {
  let url =
    student.certificates?.find((c) => c.type === type)?.fileUrl ||
    student.studentDetails[
      type === "candidatePhoto" ? "studentImage" : "studentSign"
    ];

  if (!url) {
    const query = mongoose.Types.ObjectId.isValid(student.loginStudentId)
      ? { loginStudentId: student.loginStudentId }
      : {
          "studentDetails.emailAddress": student.studentDetails.emailAddress,
        };
    const application = await Application.findOne(query).lean();
    if (application && application.certificates) {
      url =
        application.certificates.find((c) => c.type === type)?.fileUrl || "";
    }
  }
  return url;
};

const getExamDateForSubject = async (
  subjectLabel,
  examSessionId,
  course,
  batch,
  pattern,
) => {
  try {
    const config = await RegularExamSubjectConfig.findOne({
      examSessionId,
      course,
      batch,
      pattern,
    }).lean();

    if (!config) return "NOT_FOUND";

    const subject = config.subjects.find(
      (s) => s.label === subjectLabel && s.type === "subject",
    );

    return subject?.examDate || "NOT_FOUND";
  } catch (error) {
    console.error("Error fetching exam date:", error);
    return "NOT_FOUND";
  }
};

const generateHallTicketHTML = (data) => {
  const {
    studentName,
    motherName,
    batch,
    rollNumber,
    hallTicketNumber,
    course,
    pattern,
    academicYear,
    term,
    subjects,
    agnelLogoBase64,
    headOfExamSignBase64,
    principalSignBase64,
    studentPhotoBase64,
  } = data;

  const subjectRows = subjects
    .map(
      (subject) => `
    <tr>
      <td style="border: 1px solid #000; padding: 8px;">${subject.label}</td>
      <td style="border: 1px solid #000; padding: 8px;">Regular Examination</td>
      <td style="border: 1px solid #000; padding: 8px;">${subject.examDate || ""}</td>
      <td style="border: 1px solid #000; padding: 8px;">${subject.examTime || "10:30 AM to 01:00 PM"}</td>
      <td style="border: 1px solid #000; padding: 8px; width: 100px;"></td>
      <td style="border: 1px solid #000; padding: 8px; width: 100px;"></td>
    </tr>
  `,
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Hall Ticket - ${studentName}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        @page {
          size: A4;
          margin: 15mm;
        }
        
        body {
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          color: #000;
        }
        
        .container {
          width: 100%;
          max-width: 210mm;
          margin: 0 auto;
          padding: 10px;
        }
        
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 15px;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
        }
        
        .header-left {
          width: 80px;
        }
        
        .header-left img {
          width: 80px;
          height: auto;
        }
        
        .header-center {
          flex: 1;
          text-align: center;
          padding: 0 20px;
        }
        
        .header-center h1 {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 3px;
        }
        
        .header-center h2 {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 3px;
        }
        
        .header-center p {
          font-size: 11px;
          margin-bottom: 2px;
        }
        
        .header-right {
          width: 120px;
          height: 140px;
          border: 2px solid #000;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .header-right img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        
        .info-table td {
          border: 1px solid #000;
          padding: 8px;
          font-size: 12px;
        }
        
        .info-table td:first-child {
          font-weight: bold;
          width: 15%;
        }
        
        .info-table td:nth-child(2) {
          width: 35%;
        }
        
        .info-table td:nth-child(3) {
          font-weight: bold;
          width: 15%;
        }
        
        .info-table td:nth-child(4) {
          width: 35%;
        }
        
        .exam-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        
        .exam-table th {
          border: 1px solid #000;
          padding: 8px;
          background-color: #f0f0f0;
          font-weight: bold;
          text-align: center;
          font-size: 11px;
        }
        
        .exam-table td {
          border: 1px solid #000;
          padding: 8px;
          font-size: 11px;
        }
        
        .notes {
          margin-bottom: 20px;
        }
        
        .notes h3 {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        
        .notes ol {
          margin-left: 20px;
        }
        
        .notes li {
          margin-bottom: 4px;
          font-size: 11px;
        }
        
        .signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
        }
        
        .signature-block {
          text-align: center;
          width: 200px;
        }
        
        .signature-block img {
          width: 120px;
          height: 50px;
          margin-bottom: 5px;
        }
        
        .signature-block p {
          font-weight: bold;
          font-size: 12px;
          border-top: 1px solid #000;
          padding-top: 5px;
          margin-top: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            ${agnelLogoBase64 ? `<img src="${agnelLogoBase64}" alt="College Logo">` : ""}
          </div>
          <div class="header-center">
            <h3>Agnel Charities</h3>
            <h1>Agnel School of Law</h1>
            <p>Agnel Technical Education Complex, Sector 9A, Vashi, Navi Mumbai 400 703</p>
          </div>
          <div class="header-right">
            ${studentPhotoBase64 ? `<img src="${studentPhotoBase64}" alt="Student Photo">` : "<!-- Empty box for student photo -->"}
          </div>
        </div>
        
        <!-- Student Information -->
        <table class="info-table">
          <tr>
            <td><strong>Student Name</strong></td>
            <td>${studentName}</td>
            <td><strong>Mother Name</strong></td>
            <td>${motherName || ""}</td>
          </tr>
          <tr>
            <td><strong>Class</strong></td>
            <td>${batch} (${course} - ${pattern})</td>
            <td><strong>Exam Seat No</strong></td>
            <td>${rollNumber}</td>
          </tr>
          <tr>
            <td><strong>Hall Ticket</strong></td>
            <td>${hallTicketNumber}</td>
            <td><strong>Exam</strong></td>
            <td>${term} (AY ${academicYear})</td>
          </tr>
        </table>
        
        <!-- Exam Schedule -->
        <table class="exam-table">
          <thead>
            <tr>
              <th>Subject Name</th>
              <th>Exam Type</th>
              <th>Date</th>
              <th>Timing</th>
              <th>Sign of<br>Student</th>
              <th>Sign of<br>Supervisor</th>
            </tr>
          </thead>
          <tbody>
            ${subjectRows}
          </tbody>
        </table>
        
        <!-- Notes -->
        <div class="notes">
          <h3>Note :</h3>
          <ol>
            <li>Students are requested to remain present in the examination hall 20 minutes prior to the exam start and shall not be allowed inside the examination hall after 30 minutes.</li>
            <li>Students are not allowed to carry any personal belongings and electronic devices inside the examination hall.</li>
            <li>Student are not allowed to carry any written material / or any written matter related to the exam on their body.</li>
            <li>Students should be in dress code and carry their college ID card and Hall ticket.</li>
            <li>Students should not write anything on the Hall ticket.</li>
            <li>Students will not be allowed to write on the question paper.</li>
            <li>Use of whitener for correction in the answer sheet is not allowed.</li>
            <li>Students shall not be allowed to leave the examination hall during the last 30 minutes of the examination.</li>
            <li>The college will not be held responsible for any loss or theft during examinations. Students are advised to take care of their personal belongings.</li>
          </ol>
        </div>
        
        <!-- Signatures -->
        <div class="signatures">
          <div class="signature-block">
            ${headOfExamSignBase64 ? `<img src="${headOfExamSignBase64}" alt="Head of Examination Signature">` : '<div style="height: 50px;"></div>'}
            <p>HEAD OF EXAMINATION</p>
          </div>
          <div class="signature-block">
            ${principalSignBase64 ? `<img src="${principalSignBase64}" alt="Principal Signature">` : '<div style="height: 50px;"></div>'}
            <p>PRINCIPAL</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ==================== EXAM SESSION MANAGEMENT ====================

export const createExamSession = async (req, res) => {
  try {
    const {
      title,
      academicYear,
      term,
      examType,
      examStartDate,
      examEndDate,
      description,
    } = req.body;

    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await RegularExamSession.create({
      title,
      academicYear,
      term,
      examType,
      examStartDate,
      examEndDate,
      description,
      createdBy: userId,
      status: "draft",
    });

    res.status(201).json({
      message: "Exam session created successfully",
      session,
    });
  } catch (error) {
    console.error("Create exam session error:", error);
    res.status(500).json({
      message: error.message || "Failed to create exam session",
    });
  }
};

export const getAllExamSessions = async (req, res) => {
  try {
    const { status, academicYear, isActive } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (academicYear) filters.academicYear = academicYear;
    if (isActive !== undefined) filters.isActive = isActive === "true";

    const sessions = await RegularExamSession.find(filters)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ sessions });
  } catch (error) {
    console.error("Fetch exam sessions error:", error);
    res.status(500).json({ message: "Failed to fetch exam sessions" });
  }
};

export const getExamSessionById = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await RegularExamSession.findById(id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    res.status(200).json({ session });
  } catch (error) {
    console.error("Fetch exam session error:", error);
    res.status(500).json({ message: "Failed to fetch exam session" });
  }
};

export const updateExamSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const session = await RegularExamSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res
        .status(400)
        .json({ message: "Cannot update a closed exam session" });
    }

    const updates = { ...req.body, updatedBy: userId };
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.createdBy;

    const updatedSession = await RegularExamSession.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true },
    );

    res.status(200).json({
      message: "Exam session updated successfully",
      session: updatedSession,
    });
  } catch (error) {
    console.error("Update exam session error:", error);
    res.status(500).json({
      message: error.message || "Failed to update exam session",
    });
  }
};

export const deleteExamSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await RegularExamSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    const enrollmentCount = await RegularExamEnrollment.countDocuments({
      examSessionId: id,
    });
    if (enrollmentCount > 0) {
      return res.status(400).json({
        message: `Cannot delete exam session with ${enrollmentCount} existing enrollment(s). Please close it instead.`,
      });
    }

    await RegularExamSubjectConfig.deleteMany({ examSessionId: id });
    await RegularExamSession.findByIdAndDelete(id);

    res.status(200).json({
      message: "Exam session and related configurations deleted successfully",
    });
  } catch (error) {
    console.error("Delete exam session error:", error);
    res.status(500).json({ message: "Failed to delete exam session" });
  }
};

export const activateExamSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const session = await RegularExamSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    const configs = await RegularExamSubjectConfig.find({
      examSessionId: id,
      isActive: true,
    });

    if (configs.length === 0) {
      return res.status(400).json({
        message: "Cannot activate exam session without subject configurations",
      });
    }

    // Check for batch overlap with other active sessions
    const otherActiveSessions = await RegularExamSession.find({
      isActive: true,
      _id: { $ne: id },
    });

    let overlapWarnings = [];
    if (otherActiveSessions.length > 0) {
      // Get batches configured for this session
      const thisBatches = new Set();
      configs.forEach((config) => {
        thisBatches.add(config.batch);
        if (config.actualBatches && config.actualBatches.length > 0) {
          config.actualBatches.forEach((b) => thisBatches.add(b));
        }
      });

      // Check each other active session for overlap
      for (const otherSession of otherActiveSessions) {
        const otherConfigs = await RegularExamSubjectConfig.find({
          examSessionId: otherSession._id,
          isActive: true,
        });

        const otherBatches = new Set();
        otherConfigs.forEach((config) => {
          otherBatches.add(config.batch);
          if (config.actualBatches && config.actualBatches.length > 0) {
            config.actualBatches.forEach((b) => otherBatches.add(b));
          }
        });

        // Find overlapping batches
        const overlap = [...thisBatches].filter((b) => otherBatches.has(b));
        if (overlap.length > 0) {
          overlapWarnings.push({
            sessionTitle: otherSession.title,
            sessionId: otherSession._id,
            overlappingBatches: overlap,
          });
        }
      }
    }

    // Activate the session
    session.isActive = true;
    session.status = "active";
    session.updatedBy = userId;
    await session.save();

    // Build response message
    let message = "Exam session activated successfully. You can now trigger auto-enrollment.";
    if (overlapWarnings.length > 0) {
      const batchList = [...new Set(overlapWarnings.flatMap((w) => w.overlappingBatches))].join(", ");
      message += ` WARNING: Batch overlap detected with ${overlapWarnings.length} other active session(s) for batches: ${batchList}. Students in these batches may be enrolled in multiple sessions.`;
    }

    res.status(200).json({
      message,
      session,
      overlapWarnings: overlapWarnings.length > 0 ? overlapWarnings : undefined,
    });
  } catch (error) {
    console.error("Activate exam session error:", error);
    res.status(500).json({ message: "Failed to activate exam session" });
  }
};

export const deactivateExamSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const session = await RegularExamSession.findByIdAndUpdate(
      id,
      { isActive: false, status: "draft", updatedBy: userId },
      { new: true },
    );

    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    res.status(200).json({
      message: "Exam session deactivated successfully",
      session,
    });
  } catch (error) {
    console.error("Deactivate exam session error:", error);
    res.status(500).json({ message: "Failed to deactivate exam session" });
  }
};

export const closeExamSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const session = await RegularExamSession.findByIdAndUpdate(
      id,
      { status: "closed", isActive: false, updatedBy: userId },
      { new: true },
    );

    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    res.status(200).json({
      message: "Exam session closed successfully",
      session,
    });
  } catch (error) {
    console.error("Close exam session error:", error);
    res.status(500).json({ message: "Failed to close exam session" });
  }
};

export const getActiveExamSession = async (req, res) => {
  try {
    // Return all active sessions (multiple sessions can be active for different batches)
    const sessions = await RegularExamSession.find({ isActive: true })
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    if (sessions.length === 0) {
      return res.status(404).json({
        message: "No active exam session found",
        hasActive: false,
        sessions: [],
      });
    }

    // Return both for backward compatibility (session = first one, sessions = all)
    res.status(200).json({ 
      session: sessions[0], 
      sessions, 
      hasActive: true,
      activeCount: sessions.length 
    });
  } catch (error) {
    console.error("Fetch active exam session error:", error);
    res.status(500).json({ message: "Failed to fetch active exam session" });
  }
};

// ==================== SUBJECT CONFIGURATION ====================

export const createSubjectConfig = async (req, res) => {
  try {
    const { examSessionId, course, batch, batchLabel, pattern, subjects, actualBatches } =
      req.body;

    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await RegularExamSession.findById(examSessionId);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res.status(400).json({
        message: "Cannot add subjects to a closed exam session",
      });
    }

    const existing = await RegularExamSubjectConfig.findOne({
      examSessionId,
      course,
      batch,
      pattern,
    });

    if (existing) {
      return res.status(400).json({
        message: "Subject configuration already exists for this combination",
      });
    }

    const config = await RegularExamSubjectConfig.create({
      examSessionId,
      course,
      batch,
      batchLabel,
      pattern,
      subjects,
      actualBatches: actualBatches || [],
      createdBy: userId,
    });

    res.status(201).json({
      message: "Subject configuration created successfully",
      config,
    });
  } catch (error) {
    console.error("Create subject config error:", error);
    res.status(500).json({
      message: error.message || "Failed to create subject configuration",
    });
  }
};

export const getSubjectConfigs = async (req, res) => {
  try {
    const { examSessionId, course, batch, pattern, isActive } = req.query;

    const filters = {};
    if (examSessionId) filters.examSessionId = examSessionId;
    if (course) filters.course = course;
    if (batch) filters.batch = batch;
    if (pattern) filters.pattern = pattern;
    if (isActive !== undefined) filters.isActive = isActive === "true";

    const configs = await RegularExamSubjectConfig.find(filters)
      .populate("examSessionId", "title academicYear term status")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ configs });
  } catch (error) {
    console.error("Fetch subject configs error:", error);
    res.status(500).json({ message: "Failed to fetch subject configurations" });
  }
};

export const getSubjectConfigById = async (req, res) => {
  try {
    const { id } = req.params;

    const config = await RegularExamSubjectConfig.findById(id)
      .populate("examSessionId", "title academicYear term status")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!config) {
      return res
        .status(404)
        .json({ message: "Subject configuration not found" });
    }

    res.status(200).json({ config });
  } catch (error) {
    console.error("Fetch subject config error:", error);
    res.status(500).json({ message: "Failed to fetch subject configuration" });
  }
};

export const updateSubjectConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const config =
      await RegularExamSubjectConfig.findById(id).populate("examSessionId");
    if (!config) {
      return res
        .status(404)
        .json({ message: "Subject configuration not found" });
    }

    if (config.examSessionId.status === "closed") {
      return res.status(400).json({
        message: "Cannot update configuration for a closed exam session",
      });
    }

    const updates = { ...req.body, updatedBy: userId };
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.createdBy;
    delete updates.examSessionId;

    const updatedConfig = await RegularExamSubjectConfig.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true },
    ).populate("examSessionId", "title academicYear term status");

    res.status(200).json({
      message: "Subject configuration updated successfully",
      config: updatedConfig,
    });
  } catch (error) {
    console.error("Update subject config error:", error);
    res.status(500).json({
      message: error.message || "Failed to update subject configuration",
    });
  }
};

export const deleteSubjectConfig = async (req, res) => {
  try {
    const { id } = req.params;

    const config = await RegularExamSubjectConfig.findById(id);
    if (!config) {
      return res
        .status(404)
        .json({ message: "Subject configuration not found" });
    }

    const enrollmentCount = await RegularExamEnrollment.countDocuments({
      examSessionId: config.examSessionId,
      course: config.course,
      batch: config.batch,
      pattern: config.pattern,
    });

    if (enrollmentCount > 0) {
      return res.status(400).json({
        message: `Cannot delete configuration with ${enrollmentCount} existing enrollment(s). Please deactivate it instead.`,
      });
    }

    await RegularExamSubjectConfig.findByIdAndDelete(id);

    res.status(200).json({
      message: "Subject configuration deleted successfully",
    });
  } catch (error) {
    console.error("Delete subject config error:", error);
    res.status(500).json({ message: "Failed to delete subject configuration" });
  }
};

export const bulkCreateSubjectConfigs = async (req, res) => {
  try {
    const { examSessionId, configurations } = req.body;
    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await RegularExamSession.findById(examSessionId);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res.status(400).json({
        message: "Cannot add subjects to a closed exam session",
      });
    }

    if (!Array.isArray(configurations) || configurations.length === 0) {
      return res.status(400).json({ message: "No configurations provided" });
    }

    const configsToCreate = configurations.map((config) => ({
      ...config,
      examSessionId,
      createdBy: userId,
    }));

    const created = await RegularExamSubjectConfig.insertMany(
      configsToCreate,
      {
        ordered: false,
      },
    );

    res.status(201).json({
      message: `${created.length} subject configuration(s) created successfully`,
      configs: created,
    });
  } catch (error) {
    console.error("Bulk create subject configs error:", error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Some configurations already exist",
        error: error.message,
      });
    }
    res.status(500).json({
      message: error.message || "Failed to create subject configurations",
    });
  }
};

// ==================== AUTO-ENROLLMENT ====================

export const autoEnrollStudents = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await RegularExamSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res.status(400).json({
        message: "Cannot enroll students in a closed exam session",
      });
    }

    const configs = await RegularExamSubjectConfig.find({
      examSessionId: sessionId,
      isActive: true,
    });

    if (configs.length === 0) {
      return res.status(400).json({
        message: "No subject configurations found for this session",
      });
    }

    let enrolledCount = 0;
    let skippedCount = 0;
    let alreadyInOtherSessionCount = 0;
    let errors = [];

    // Get all OTHER active sessions to check for overlap
    const otherActiveSessions = await RegularExamSession.find({
      isActive: true,
      _id: { $ne: sessionId },
    });
    const otherActiveSessionIds = otherActiveSessions.map((s) => s._id);

    // Get the highest existing hall ticket number to prevent duplicates
    const lastEnrollment = await RegularExamEnrollment.findOne({}, { hallTicketNumber: 1 })
      .sort({ hallTicketNumber: -1 })
      .lean();
    let ticketCounter = 0;
    if (lastEnrollment?.hallTicketNumber) {
      const match = lastEnrollment.hallTicketNumber.match(/(\d+)$/);
      if (match) ticketCounter = parseInt(match[1], 10);
    }

    for (const config of configs) {
      try {
        console.log(`Config actualBatches field:`, config.actualBatches);
        console.log(`Config actualBatches length:`, config.actualBatches?.length);
        
        // Find students matching this batch (support both single batch and actualBatches array)
        const batchesToMatch = config.actualBatches && config.actualBatches.length > 0 
          ? config.actualBatches 
          : [config.batch];

        console.log(`Processing config for ${config.course} - ${config.batch}, matching batches:`, batchesToMatch);

        // Debug: Show what batch names actually exist in database
        const allBatchNames = await Student.distinct("academicDetails.batch.name");
        console.log(`All batch names in database:`, allBatchNames);

        const students = await Student.find({
          "academicDetails.batch.name": { $in: batchesToMatch },
          status: "active", // Only enroll active students
        });

        console.log(`Found ${students.length} students for batches:`, batchesToMatch);
        
        if (students.length === 0) {
          // Debug: Check if query issue or data issue
          const anyStudents = await Student.countDocuments();
          console.log(`Total students in database: ${anyStudents}`);
          console.warn(`No students found for batches: ${batchesToMatch.join(", ")}`);
        }

        for (const student of students) {
          try {
            // Check if already enrolled in THIS session
            const existingInThisSession = await RegularExamEnrollment.findOne({
              examSessionId: sessionId,
              studentId: student._id,
            });

            if (existingInThisSession) {
              skippedCount++;
              console.log(`Skipping already enrolled student: ${student.academicDetails?.rollNumber}`);
              continue;
            }

            // Check if enrolled in another ACTIVE session (warning, not blocking)
            const existingInOtherActiveSession = await RegularExamEnrollment.findOne({
              examSessionId: { $in: otherActiveSessionIds },
              studentId: student._id,
            });

            if (existingInOtherActiveSession) {
              alreadyInOtherSessionCount++;
              console.log(`Student ${student.academicDetails?.rollNumber} already enrolled in another active session, enrolling anyway`);
            }

            // Validate required student fields
            if (!student.studentDetails?.firstName || !student.academicDetails?.rollNumber) {
              errors.push({
                student: student.academicDetails?.rollNumber || student._id.toString(),
                error: "Missing required student details (firstName or rollNumber)",
              });
              continue;
            }

            // Generate hall ticket number
            ticketCounter++;
            const yearPart = session.academicYear.replace("-", "");
            const hallTicketNumber = `REG${yearPart}/${String(ticketCounter).padStart(4, "0")}`;

            // Create enrollment
            await RegularExamEnrollment.create({
              examSessionId: sessionId,
              studentId: student._id,
              studentName: `${student.studentDetails.firstName} ${student.studentDetails.lastName || ""}`.trim(),
              rollNumber: student.academicDetails.rollNumber,
              contactNumber: student.contactDetails?.mobileNumber || "",
              course: config.course,
              batch: config.batch,
              batchLabel: config.batchLabel,
              pattern: config.pattern,
              subjects: config.subjects,
              hallTicketNumber,
              hallTicketGenerated: true,
              hallTicketGeneratedAt: new Date(),
              enrollmentStatus: "enrolled",
              enrolledBy: userId,
              enrolledAt: new Date(),
            });

            enrolledCount++;
            console.log(`Enrolled student: ${student.academicDetails.rollNumber} - ${hallTicketNumber}`);
          } catch (studentError) {
            console.error(`Error enrolling student ${student.academicDetails?.rollNumber}:`, studentError);
            errors.push({
              student: student.academicDetails?.rollNumber || "Unknown",
              error: studentError.message,
            });
          }
        }
      } catch (configError) {
        console.error(`Error processing config ${config.course}-${config.batch}:`, configError);
        errors.push({
          config: `${config.course}-${config.batch}`,
          error: configError.message,
        });
      }
    }

    console.log(`Auto-enrollment summary: ${enrolledCount} enrolled, ${skippedCount} skipped, ${alreadyInOtherSessionCount} multi-session, ${errors.length} errors`);

    let message = `Auto-enrollment completed: ${enrolledCount} enrolled, ${skippedCount} skipped`;
    if (alreadyInOtherSessionCount > 0) {
      message += `. Note: ${alreadyInOtherSessionCount} student(s) were already enrolled in another active session.`;
    }

    res.status(200).json({
      message,
      enrolledCount,
      skippedCount,
      alreadyInOtherSessionCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Auto-enrollment error:", error);
    res.status(500).json({
      message: error.message || "Failed to auto-enroll students",
    });
  }
};

// Remove enrollments for inactive students
export const removeInactiveEnrollments = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await RegularExamSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res.status(400).json({
        message: "Cannot modify enrollments in a closed exam session",
      });
    }

    // Get all enrollments for this session
    const enrollments = await RegularExamEnrollment.find({ examSessionId: sessionId });
    
    let removedCount = 0;
    const removedStudents = [];

    for (const enrollment of enrollments) {
      // Check if student is inactive
      const student = await Student.findById(enrollment.studentId);
      
      if (!student || student.status !== "active") {
        await RegularExamEnrollment.findByIdAndDelete(enrollment._id);
        removedCount++;
        removedStudents.push({
          rollNumber: enrollment.rollNumber,
          name: enrollment.studentName,
          status: student ? student.status : "not found",
        });
        console.log(`Removed inactive enrollment: ${enrollment.rollNumber} - ${enrollment.studentName}`);
      }
    }

    console.log(`Removed ${removedCount} inactive enrollments from session ${sessionId}`);

    res.status(200).json({
      message: removedCount > 0 
        ? `Removed ${removedCount} inactive student enrollment(s)` 
        : "No inactive students found in enrollments",
      removedCount,
      removedStudents: removedCount > 0 ? removedStudents : undefined,
    });
  } catch (error) {
    console.error("Remove inactive enrollments error:", error);
    res.status(500).json({
      message: error.message || "Failed to remove inactive enrollments",
    });
  }
};

// Refresh subjects for existing enrollments based on subject configs
export const refreshEnrollmentSubjects = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await RegularExamSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res.status(400).json({
        message: "Cannot modify enrollments in a closed exam session",
      });
    }

    // Get all subject configs for this session
    const configs = await RegularExamSubjectConfig.find({
      examSessionId: sessionId,
      isActive: true,
    });

    if (configs.length === 0) {
      return res.status(400).json({
        message: "No subject configurations found for this session",
      });
    }

    // Get all enrollments for this session
    const enrollments = await RegularExamEnrollment.find({ examSessionId: sessionId });
    
    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const enrollment of enrollments) {
      try {
        // Find matching config for this enrollment's batch
        // Match by config.batch (stored in enrollment) OR by batchLabel
        const matchingConfig = configs.find((config) => {
          return (config.batch === enrollment.batch || config.batchLabel === enrollment.batch || config.batchLabel === enrollment.batchLabel) 
            && config.course === enrollment.course;
        });

        if (!matchingConfig) {
          skippedCount++;
          console.log(`No matching config for enrollment: ${enrollment.rollNumber} (batch: ${enrollment.batch}, batchLabel: ${enrollment.batchLabel}, course: ${enrollment.course})`);
          console.log(`Available configs:`, configs.map(c => ({ batch: c.batch, batchLabel: c.batchLabel, course: c.course })));
          continue;
        }

        // Update subjects from config
        await RegularExamEnrollment.findByIdAndUpdate(enrollment._id, {
          subjects: matchingConfig.subjects,
          pattern: matchingConfig.pattern,
          batchLabel: matchingConfig.batchLabel,
        });

        updatedCount++;
        console.log(`Updated subjects for: ${enrollment.rollNumber}`);
      } catch (err) {
        errors.push({
          rollNumber: enrollment.rollNumber,
          error: err.message,
        });
      }
    }

    console.log(`Refreshed subjects: ${updatedCount} updated, ${skippedCount} skipped, ${errors.length} errors`);

    res.status(200).json({
      message: updatedCount > 0 
        ? `Updated subjects for ${updatedCount} enrollment(s)` 
        : "No enrollments were updated",
      updatedCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Refresh enrollment subjects error:", error);
    res.status(500).json({
      message: error.message || "Failed to refresh enrollment subjects",
    });
  }
};

// ==================== SYNC ENROLLMENTS (UNIFIED JOB) ====================

/**
 * Start a background job to sync enrollments:
 * 1. Remove inactive/graduated students
 * 2. Enroll missing active students
 * 3. Sync student data (name, rollNumber, contactNumber)
 * 4. Sync subject config data (subjects, pattern, batchLabel)
 */
export const startSyncEnrollments = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await RegularExamSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res.status(400).json({
        message: "Cannot sync enrollments in a closed exam session",
      });
    }

    // Create job
    const jobId = uuidv4();
    createJob(jobId, {
      type: "sync_enrollments",
      sessionId,
      message: "Starting enrollment sync...",
    });

    // Start background processing
    processSyncEnrollments(jobId, sessionId, userId);

    res.status(200).json({
      message: "Sync job started",
      jobId,
    });
  } catch (error) {
    console.error("Start sync enrollments error:", error);
    res.status(500).json({
      message: error.message || "Failed to start sync job",
    });
  }
};

// Background processor for sync enrollments
const processSyncEnrollments = async (jobId, sessionId, userId) => {
  try {
    updateJob(jobId, { status: "in_progress", progress: 0, metadata: { message: "Fetching session data..." } });

    const session = await RegularExamSession.findById(sessionId);
    if (!session) {
      updateJob(jobId, { status: "failed", error: "Exam session not found" });
      return;
    }

    const configs = await RegularExamSubjectConfig.find({
      examSessionId: sessionId,
      isActive: true,
    });

    const stats = {
      removedInactive: 0,
      enrolledMissing: 0,
      syncedStudentData: 0,
      syncedSubjectConfig: 0,
      errors: [],
    };

    // ===== STEP 1: Remove inactive/graduated students (10% progress) =====
    updateJob(jobId, { progress: 5, metadata: { message: "Removing inactive students..." } });

    const enrollments = await RegularExamEnrollment.find({ examSessionId: sessionId });
    
    for (const enrollment of enrollments) {
      const student = await Student.findById(enrollment.studentId);
      if (!student || student.status !== "active") {
        await RegularExamEnrollment.findByIdAndDelete(enrollment._id);
        stats.removedInactive++;
        console.log(`Sync: Removed inactive enrollment: ${enrollment.rollNumber}`);
      }
    }

    updateJob(jobId, { progress: 10, metadata: { message: `Removed ${stats.removedInactive} inactive enrollments` } });

    // ===== STEP 2: Enroll missing active students (10-40% progress) =====
    updateJob(jobId, { progress: 15, metadata: { message: "Enrolling missing students..." } });

    if (configs.length > 0) {
      const yearPart = session.academicYear.replace("-", "");
      const hallTicketPrefix = `REG${yearPart}/`;

      // Find the highest counter for this academic year's prefix
      const lastEnrollment = await RegularExamEnrollment.findOne(
        { hallTicketNumber: { $regex: `^${hallTicketPrefix}` } },
        { hallTicketNumber: 1 }
      ).sort({ hallTicketNumber: -1 }).lean();

      let ticketCounter = 0;
      if (lastEnrollment?.hallTicketNumber) {
        const match = lastEnrollment.hallTicketNumber.match(/(\d+)$/);
        if (match) ticketCounter = parseInt(match[1], 10);
      }

      for (const config of configs) {
        const batchesToMatch = config.actualBatches && config.actualBatches.length > 0
          ? config.actualBatches
          : [config.batch];

        const students = await Student.find({
          "academicDetails.batch.name": { $in: batchesToMatch },
          status: "active",
        });

        for (const student of students) {
          const existingEnrollment = await RegularExamEnrollment.findOne({
            examSessionId: sessionId,
            studentId: student._id,
          });

          if (!existingEnrollment) {
            if (!student.studentDetails?.firstName || !student.academicDetails?.rollNumber) {
              stats.errors.push({
                type: "enroll",
                student: student.academicDetails?.rollNumber || student._id.toString(),
                error: "Missing required student details",
              });
              continue;
            }

            // Retry loop to handle duplicate key collisions
            let enrolled = false;
            for (let attempt = 0; attempt < 5 && !enrolled; attempt++) {
              ticketCounter++;
              const hallTicketNumber = `${hallTicketPrefix}${String(ticketCounter).padStart(4, "0")}`;

              try {
                await RegularExamEnrollment.create({
                  examSessionId: sessionId,
                  studentId: student._id,
                  studentName: `${student.studentDetails.firstName} ${student.studentDetails.lastName || ""}`.trim(),
                  rollNumber: student.academicDetails.rollNumber,
                  contactNumber: student.studentDetails?.studentMobileNumber || "",
                  course: config.course,
                  batch: config.batch,
                  batchLabel: config.batchLabel,
                  pattern: config.pattern,
                  subjects: config.subjects,
                  hallTicketNumber,
                  hallTicketGenerated: true,
                  hallTicketGeneratedAt: new Date(),
                  enrollmentStatus: "enrolled",
                  enrolledBy: userId,
                  enrolledAt: new Date(),
                });
                enrolled = true;
                stats.enrolledMissing++;
                console.log(`Sync: Enrolled missing student: ${student.academicDetails.rollNumber}`);
              } catch (err) {
                if (err.code === 11000 && err.keyPattern?.hallTicketNumber) {
                  console.log(`Sync: Hall ticket ${hallTicketNumber} already exists, retrying...`);
                } else {
                  throw err;
                }
              }
            }

            if (!enrolled) {
              stats.errors.push({
                type: "enroll",
                student: student.academicDetails?.rollNumber || student._id.toString(),
                error: "Failed to generate unique hall ticket number after retries",
              });
            }
          }
        }
      }
    }

    updateJob(jobId, { progress: 40, metadata: { message: `Enrolled ${stats.enrolledMissing} missing students` } });

    // ===== STEP 3: Sync student data (40-70% progress) =====
    updateJob(jobId, { progress: 45, metadata: { message: "Syncing student data..." } });

    const allEnrollments = await RegularExamEnrollment.find({ examSessionId: sessionId });
    const totalEnrollments = allEnrollments.length;

    for (let i = 0; i < allEnrollments.length; i++) {
      const enrollment = allEnrollments[i];
      const student = await Student.findById(enrollment.studentId).lean();

      if (student) {
        const newName = `${student.studentDetails?.firstName || ""} ${student.studentDetails?.lastName || ""}`.trim();
        const newRollNumber = student.academicDetails?.rollNumber || enrollment.rollNumber;
        const newContactNumber = student.studentDetails?.studentMobileNumber || "";

        const needsUpdate =
          enrollment.studentName !== newName ||
          enrollment.rollNumber !== newRollNumber ||
          enrollment.contactNumber !== newContactNumber;

        if (needsUpdate) {
          await RegularExamEnrollment.findByIdAndUpdate(enrollment._id, {
            studentName: newName,
            rollNumber: newRollNumber,
            contactNumber: newContactNumber,
          });
          stats.syncedStudentData++;
          console.log(`Sync: Updated student data for: ${newRollNumber}`);
        }
      }

      // Update progress
      const progressInStep = Math.floor((i / totalEnrollments) * 25);
      updateJob(jobId, { progress: 45 + progressInStep });
    }

    updateJob(jobId, { progress: 70, metadata: { message: `Synced data for ${stats.syncedStudentData} students` } });

    // ===== STEP 4: Sync subject config data (70-95% progress) =====
    updateJob(jobId, { progress: 75, metadata: { message: "Syncing subject configurations..." } });

    for (let i = 0; i < allEnrollments.length; i++) {
      const enrollment = allEnrollments[i];

      const matchingConfig = configs.find((config) => {
        return (config.batch === enrollment.batch || config.batchLabel === enrollment.batch || config.batchLabel === enrollment.batchLabel)
          && config.course === enrollment.course;
      });

      if (matchingConfig) {
        const subjectsChanged = JSON.stringify(enrollment.subjects) !== JSON.stringify(matchingConfig.subjects);
        const patternChanged = enrollment.pattern !== matchingConfig.pattern;
        const batchLabelChanged = enrollment.batchLabel !== matchingConfig.batchLabel;

        if (subjectsChanged || patternChanged || batchLabelChanged) {
          await RegularExamEnrollment.findByIdAndUpdate(enrollment._id, {
            subjects: matchingConfig.subjects,
            pattern: matchingConfig.pattern,
            batchLabel: matchingConfig.batchLabel,
          });
          stats.syncedSubjectConfig++;
          console.log(`Sync: Updated subject config for: ${enrollment.rollNumber}`);
        }
      }

      // Update progress
      const progressInStep = Math.floor((i / totalEnrollments) * 20);
      updateJob(jobId, { progress: 75 + progressInStep });
    }

    updateJob(jobId, {
      status: "completed",
      progress: 100,
      metadata: {
        message: "Sync completed successfully",
        removedInactive: stats.removedInactive,
        enrolledMissing: stats.enrolledMissing,
        syncedStudentData: stats.syncedStudentData,
        syncedSubjectConfig: stats.syncedSubjectConfig,
        errors: stats.errors.length > 0 ? stats.errors : undefined,
      },
    });

    console.log(`Sync completed: removed=${stats.removedInactive}, enrolled=${stats.enrolledMissing}, studentData=${stats.syncedStudentData}, subjectConfig=${stats.syncedSubjectConfig}`);
  } catch (error) {
    console.error("Sync enrollments error:", error);
    updateJob(jobId, {
      status: "failed",
      error: error.message || "An unexpected error occurred during sync",
    });
  }
};

export const getSyncEnrollmentsStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getJob(jobId);

    if (!job) {
      return res.status(404).json({ message: "Job not found or expired" });
    }

    res.status(200).json(job);
  } catch (error) {
    console.error("Get sync status error:", error);
    res.status(500).json({ message: "Failed to get job status" });
  }
};

// ==================== ENROLLMENT MANAGEMENT ====================

export const getAllEnrollments = async (req, res) => {
  try {
    const { examSessionId, batch, course, enrollmentStatus } = req.query;

    const filters = {};
    if (examSessionId) filters.examSessionId = examSessionId;
    if (batch) filters.batch = batch;
    if (course) filters.course = course;
    if (enrollmentStatus) filters.enrollmentStatus = enrollmentStatus;

    const enrollments = await RegularExamEnrollment.find(filters)
      .populate("examSessionId", "title academicYear term examType")
      .populate("studentId", "studentDetails academicDetails")
      .sort({ rollNumber: 1 });

    res.status(200).json({ enrollments });
  } catch (error) {
    console.error("Fetch enrollments error:", error);
    res.status(500).json({ message: "Failed to fetch enrollments" });
  }
};

export const getEnrollmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const enrollment = await RegularExamEnrollment.findById(id)
      .populate("examSessionId", "title academicYear term examType")
      .populate("studentId", "studentDetails academicDetails");

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    res.status(200).json({ enrollment });
  } catch (error) {
    console.error("Fetch enrollment error:", error);
    res.status(500).json({ message: "Failed to fetch enrollment" });
  }
};

export const getMyEnrollment = async (req, res) => {
  try {
    const studentId = req.user?.id || req.user?.studentId;

    if (!studentId) {
      return res.status(401).json({ message: "Student not authenticated" });
    }

    // Get ALL active sessions (multiple can be active now)
    const activeSessions = await RegularExamSession.find({ isActive: true });

    if (activeSessions.length === 0) {
      return res.status(404).json({
        message: "No active exam session found",
        hasEnrollment: false,
        enrollments: [],
      });
    }

    const activeSessionIds = activeSessions.map((s) => s._id);

    // Find ALL enrollments for this student in active sessions
    const enrollments = await RegularExamEnrollment.find({
      examSessionId: { $in: activeSessionIds },
      studentId: studentId,
    }).populate("examSessionId", "title academicYear term examType examStartDate examEndDate description");

    if (enrollments.length === 0) {
      return res.status(404).json({
        message: "You are not enrolled in any active exam session",
        hasEnrollment: false,
        enrollments: [],
      });
    }

    // Return both for backward compatibility (enrollment = first, enrollments = all)
    res.status(200).json({ 
      enrollment: enrollments[0], 
      enrollments, 
      hasEnrollment: true,
      enrollmentCount: enrollments.length 
    });
  } catch (error) {
    console.error("Fetch my enrollment error:", error);
    res.status(500).json({ message: "Failed to fetch enrollment" });
  }
};

export const getUniqueBatchNames = async (req, res) => {
  try {
    const { examSessionId } = req.query;

    const filter = examSessionId ? { examSessionId } : {};

    const batches = await RegularExamEnrollment.distinct("batch", filter);

    res.status(200).json({ batches });
  } catch (error) {
    console.error("Fetch batch names error:", error);
    res.status(500).json({ message: "Failed to fetch batch names" });
  }
};

export const getAvailableBatches = async (req, res) => {
  try {
    const { course } = req.query;

    console.log("Fetching available batches for course:", course);

    const filter = {};
    if (course) {
      filter["academicDetails.program"] = course;
    }

    console.log("Query filter:", JSON.stringify(filter));

    const batches = await Student.distinct("academicDetails.batch.name", filter);

    console.log("Found batches from database:", batches);

    const filteredBatches = batches.filter(batch => batch && batch.trim() !== "");

    console.log("Filtered batches:", filteredBatches);

    res.status(200).json({ batches: filteredBatches });
  } catch (error) {
    console.error("Fetch available batches error:", error);
    res.status(500).json({ message: "Failed to fetch available batches", error: error.message });
  }
};

// Hall ticket download will be handled by a separate PDF generation service
// For now, we'll just return the enrollment data
export const downloadHallTicket = async (req, res) => {
  let browser = null;
  try {
    const { id } = req.params;

    const enrollment = await RegularExamEnrollment.findById(id)
      .populate("examSessionId")
      .populate("studentId");

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    const session = enrollment.examSessionId;

    // Fetch student details
    let motherName = "";
    let studentPhotoBase64 = "";

    if (enrollment.studentId) {
      const student = await Student
        .findById(enrollment.studentId)
        .select(
          "familyBackground.motherName studentDetails certificates loginStudentId academicDetails.rollNumber",
        )
        .lean();
      motherName = student?.familyBackground?.motherName || "";

      // Get student photo URL
      const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, "");

      const studentPhotoUrl =
        (await getStudentImageUrl(student, "candidatePhoto")) ||
        `${backendBaseUrl}/api/students/student-photo/${student?.academicDetails?.rollNumber || enrollment.rollNumber}`;

      // Load fallback image
      const uploadsPath = path.join(__dirname, "..", "uploads", "images");
      const fallbackImageBase64 = await loadImageAsBase64(
        path.join(uploadsPath, "fallback-image.png"),
      );

      // Convert student photo URL to base64
      studentPhotoBase64 = await urlToBase64(
        studentPhotoUrl,
        fallbackImageBase64,
      );
    }

    // Load images as base64
    const uploadsPath = path.join(__dirname, "..", "uploads", "images");
    const agnelLogoBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "agnel-logo.png"),
    );
    const headOfExamSignBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "headofexam.png"),
    );
    const principalSignBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "principal_sign.png"),
    );

    // Add exam dates to subjects
    const subjectsWithDates = await Promise.all(
      enrollment.subjects.map(async (subject) => ({
        ...subject.toObject(),
        examDate: await getExamDateForSubject(
          subject.label,
          enrollment.examSessionId._id,
          enrollment.course,
          enrollment.batch,
          enrollment.pattern,
        ),
      })),
    );

    // Prepare data for template
    const hallTicketData = {
      studentName: enrollment.studentName,
      motherName: motherName,
      batch: enrollment.batch,
      rollNumber: enrollment.rollNumber,
      hallTicketNumber: enrollment.hallTicketNumber,
      course: enrollment.course,
      pattern: enrollment.pattern,
      academicYear: session.academicYear,
      term: session.term,
      subjects: subjectsWithDates,
      agnelLogoBase64,
      headOfExamSignBase64,
      principalSignBase64,
      studentPhotoBase64,
    };

    // Generate HTML
    const htmlContent = generateHallTicketHTML(hallTicketData);

    // Launch puppeteer and generate PDF
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "15mm",
        right: "15mm",
        bottom: "15mm",
        left: "15mm",
      },
    });

    await browser.close();
    browser = null;

    // Send PDF as response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="HallTicket_${enrollment.hallTicketNumber}_${enrollment.studentName.replace(/\s+/g, "_")}.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating hall ticket:", error);
    if (browser) {
      await browser.close();
    }
    res.status(500).json({
      message: "Failed to generate hall ticket",
      error: error.message,
    });
  }
};

export const bulkDownloadHallTickets = async (req, res) => {
  let browser = null;
  try {
    const { examSessionId, batch, course, pattern } = req.query;

    const filters = {};
    if (examSessionId) filters.examSessionId = examSessionId;
    if (batch) filters.batch = batch;
    if (course) filters.course = course;
    if (pattern) filters.pattern = pattern;

    const enrollments = await RegularExamEnrollment.find(filters)
      .populate("examSessionId")
      .populate("studentId")
      .lean();

    if (enrollments.length === 0) {
      return res.status(404).json({ message: "No enrollments found for the selected criteria" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Regular_Exam_Hall_Tickets.zip",
    );

    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.pipe(res);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const uploadsPath = path.join(__dirname, "..", "uploads", "images");
    const agnelLogoBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "agnel-logo.png"),
    );
    const headOfExamSignBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "headofexam.png"),
    );
    const principalSignBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "principal_sign.png"),
    );
    const fallbackImageBase64 = await loadImageAsBase64(
      path.join(uploadsPath, "fallback-image.png"),
    );

    for (const enrollment of enrollments) {
      let motherName = "";
      let studentPhotoBase64 = "";

      if (enrollment.studentId) {
        const student = await Student
          .findById(enrollment.studentId)
          .select(
            "familyBackground.motherName studentDetails certificates loginStudentId academicDetails.rollNumber",
          )
          .lean();
        motherName = student?.familyBackground?.motherName || "";

        const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, "");
        const studentPhotoUrl =
          (await getStudentImageUrl(student, "candidatePhoto")) ||
          `${backendBaseUrl}/api/students/student-photo/${student?.academicDetails?.rollNumber || enrollment.rollNumber}`;

        studentPhotoBase64 = await urlToBase64(
          studentPhotoUrl,
          fallbackImageBase64,
        );
      }

      const subjectsWithDates = await Promise.all(
        enrollment.subjects.map(async (subject) => ({
          ...subject,
          examDate: await getExamDateForSubject(
            subject.label,
            enrollment.examSessionId._id,
            enrollment.course,
            enrollment.batch,
            enrollment.pattern,
          ),
        })),
      );

      const hallTicketData = {
        studentName: enrollment.studentName,
        motherName,
        batch: enrollment.batch,
        rollNumber: enrollment.rollNumber,
        hallTicketNumber: enrollment.hallTicketNumber,
        course: enrollment.course,
        pattern: enrollment.pattern,
        academicYear: enrollment.examSessionId.academicYear,
        term: enrollment.examSessionId.term,
        subjects: subjectsWithDates,
        agnelLogoBase64,
        headOfExamSignBase64,
        principalSignBase64,
        studentPhotoBase64,
      };

      const htmlContent = generateHallTicketHTML(hallTicketData);

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "15mm",
          right: "15mm",
          bottom: "15mm",
          left: "15mm",
        },
      });
      await page.close();

      archive.append(pdfBuffer, {
        name: `HallTicket_${enrollment.hallTicketNumber}_${enrollment.studentName.replace(/\s+/g, "_")}.pdf`,
      });
    }

    await browser.close();
    browser = null;
    await archive.finalize();
  } catch (error) {
    console.error("Error generating bulk hall tickets:", error);
    if (browser) {
      await browser.close();
    }
    if (!res.headersSent) {
      res.status(500).json({
        message: "Failed to generate bulk hall tickets",
        error: error.message,
      });
    }
  }
};

export const downloadEnrollmentsExcel = async (req, res) => {
  try {
    const { examSessionId, batch, course, pattern } = req.query;

    const filters = {};
    if (examSessionId) filters.examSessionId = examSessionId;
    if (batch) filters.batch = batch;
    if (course) filters.course = course;
    if (pattern) filters.pattern = pattern;

    const enrollments = await RegularExamEnrollment.find(filters)
      .populate("examSessionId", "title academicYear term examType")
      .populate("studentId", "studentDetails contactDetails")
      .lean();

    if (enrollments.length === 0) {
      return res.status(404).json({ message: "No enrollments found" });
    }

    const headers = [
      { label: "Hall Ticket Number", key: "hallTicketNumber", width: 20 },
      { label: "Student Name", key: "studentName", width: 25 },
      { label: "Roll Number", key: "rollNumber", width: 15 },
      { label: "Contact Number", key: "contactNumber", width: 15 },
      { label: "Course", key: "course", width: 15 },
      { label: "Batch", key: "batch", width: 15 },
      { label: "Pattern", key: "pattern", width: 12 },
      { label: "Subjects Count", key: "subjectsCount", width: 15 },
      { label: "Subjects", key: "subjects", width: 50 },
      { label: "Enrollment Status", key: "enrollmentStatus", width: 18 },
      { label: "Hall Ticket Generated", key: "hallTicketGenerated", width: 20 },
      { label: "Enrolled At", key: "enrolledAt", width: 20 },
      { label: "Exam Session", key: "examSession", width: 25 },
      { label: "Academic Year", key: "academicYear", width: 15 },
      { label: "Term", key: "term", width: 12 },
    ];

    const data = enrollments.map((enrollment) => ({
      hallTicketNumber: enrollment.hallTicketNumber || "",
      studentName: enrollment.studentName || "",
      rollNumber: enrollment.rollNumber || "",
      contactNumber: enrollment.contactNumber || "",
      course: enrollment.course || "",
      batch: enrollment.batch || "",
      pattern: enrollment.pattern || "",
      subjectsCount: enrollment.subjects?.length || 0,
      subjects: Array.isArray(enrollment.subjects)
        ? enrollment.subjects.map((s) => s.label || s).join(", ")
        : "",
      enrollmentStatus: enrollment.enrollmentStatus || "enrolled",
      hallTicketGenerated: enrollment.hallTicketGenerated ? "Yes" : "No",
      enrolledAt: formatExcelDate(enrollment.createdAt),
      examSession: enrollment.examSessionId?.title || "",
      academicYear: enrollment.examSessionId?.academicYear || "",
      term: enrollment.examSessionId?.term || "",
    }));

    const workbook = createWorkbook();
    createStandardWorksheet(workbook, "Regular Exam Enrollments", headers, data);

    await sendExcelResponse(
      res,
      workbook,
      `regular_exam_enrollments_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  } catch (error) {
    console.error("Error downloading enrollments Excel:", error);
    res
      .status(500)
      .json({ message: "Failed to download Excel", error: error.message });
  }
};

// ==================== BULK HALL TICKET JOB ====================

const processBulkHallTicketGeneration = async (jobId, filters, userId) => {
  let browser = null;
  try {
    updateJob(jobId, { status: "in_progress", progress: 0, metadata: { message: "Fetching enrollments..." } });

    const enrollments = await RegularExamEnrollment.find(filters)
      .populate("examSessionId")
      .populate("studentId")
      .lean();

    if (enrollments.length === 0) {
      updateJob(jobId, { 
        status: "failed", 
        error: "No enrollments found for the selected criteria",
        metadata: { failureReason: "no_data" }
      });
      return;
    }

    updateJob(jobId, { 
      metadata: { 
        totalStudents: enrollments.length, 
        processedStudents: 0,
        message: `Generating hall tickets for ${enrollments.length} students...` 
      } 
    });

    // Prepare assets once
    const uploadsPath = path.join(__dirname, "..", "uploads", "images");
    const agnelLogoBase64 = await loadImageAsBase64(path.join(uploadsPath, "agnel-logo.png"));
    const headOfExamSignBase64 = await loadImageAsBase64(path.join(uploadsPath, "headofexam.png"));
    const principalSignBase64 = await loadImageAsBase64(path.join(uploadsPath, "principal_sign.png"));
    const fallbackImageBase64 = await loadImageAsBase64(path.join(uploadsPath, "fallback-image.png"));

    // Initialize archive
    const zipFileName = `Regular_Exam_Hall_Tickets_${Date.now()}.zip`;
    const zipFilePath = path.join(__dirname, "..", "temp", zipFileName);
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, "..", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    let processedCount = 0;

    for (const enrollment of enrollments) {
      try {
        let motherName = "";
        let studentPhotoBase64 = "";

        if (enrollment.studentId) {
          const student = await Student
            .findById(enrollment.studentId)
            .select("familyBackground.motherName studentDetails certificates loginStudentId academicDetails.rollNumber")
            .lean();
          motherName = student?.familyBackground?.motherName || "";

          const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, "");
          const studentPhotoUrl = (await getStudentImageUrl(student, "candidatePhoto")) ||
            `${backendBaseUrl}/api/students/student-photo/${student?.academicDetails?.rollNumber || enrollment.rollNumber}`;

          studentPhotoBase64 = await urlToBase64(studentPhotoUrl, fallbackImageBase64);
        }

        const subjectsWithDates = await Promise.all(
          enrollment.subjects.map(async (subject) => ({
            ...subject,
            examDate: await getExamDateForSubject(
              subject.label,
              enrollment.examSessionId._id,
              enrollment.course,
              enrollment.batch,
              enrollment.pattern,
            ),
          })),
        );

        const hallTicketData = {
          studentName: enrollment.studentName,
          motherName,
          batch: enrollment.batch,
          rollNumber: enrollment.rollNumber,
          hallTicketNumber: enrollment.hallTicketNumber,
          course: enrollment.course,
          pattern: enrollment.pattern,
          academicYear: enrollment.examSessionId.academicYear,
          term: enrollment.examSessionId.term,
          subjects: subjectsWithDates,
          agnelLogoBase64,
          headOfExamSignBase64,
          principalSignBase64,
          studentPhotoBase64,
        };

        const htmlContent = generateHallTicketHTML(hallTicketData);

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "networkidle0" });
        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
        });
        await page.close();

        archive.append(pdfBuffer, {
          name: `HallTicket_${enrollment.hallTicketNumber}_${enrollment.studentName.replace(/\s+/g, "_")}.pdf`,
        });

        processedCount++;
        const progress = Math.round((processedCount / enrollments.length) * 100);
        
        updateJob(jobId, { 
          progress, 
          metadata: { 
            processedStudents: processedCount,
            totalStudents: enrollments.length,
            message: `Generated ${processedCount} of ${enrollments.length} hall tickets`
          } 
        });

      } catch (err) {
        console.error(`Error processing enrollment ${enrollment._id}:`, err);
        // Continue with next enrollment
      }
    }

    await browser.close();
    browser = null;

    await archive.finalize();

    output.on("close", () => {
      updateJob(jobId, { 
        status: "completed", 
        progress: 100, 
        result: zipFilePath,
        metadata: { 
          message: "Hall tickets generation completed successfully!",
          downloadUrl: `/api/regular-exam/bulk-download-result/${jobId}`
        } 
      });
    });

  } catch (error) {
    console.error("Error in bulk hall ticket job:", error);
    if (browser) await browser.close();
    updateJob(jobId, { status: "failed", error: error.message });
  }
};

export const startBulkHallTicketGeneration = async (req, res) => {
  try {
    const { examSessionId, batch, course, pattern, enrollmentIds } = req.query;
    const userId = req.user?.id || req.user?.examinerId;

    const filters = {};
    if (examSessionId) filters.examSessionId = examSessionId;
    if (batch) filters.batch = batch;
    if (course) filters.course = course;
    if (pattern) filters.pattern = pattern;

    if (enrollmentIds) {
      const ids = enrollmentIds.split(",").filter((id) => id.trim() !== "");
      if (ids.length > 0) {
        filters._id = { $in: ids };
      }
    }

    const jobId = uuidv4();
    createJob(jobId, { type: "bulk_hall_ticket", filters, userId });

    // Start background process
    processBulkHallTicketGeneration(jobId, filters, userId);

    res.status(202).json({
      message: "Bulk hall ticket generation started",
      jobId,
    });
  } catch (error) {
    console.error("Error starting bulk hall ticket job:", error);
    res
      .status(500)
      .json({ message: "Failed to start job", error: error.message });
  }
};

export const getBulkHallTicketStatus = async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ message: "Job not found" });
  }

  res.status(200).json(job);
};

export const downloadBulkHallTicketResult = async (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job || job.status !== "completed" || !job.result) {
    return res.status(404).json({ message: "Result not available" });
  }

  res.download(job.result, "HallTickets.zip", (err) => {
    if (err) {
      console.error("Error sending file:", err);
    } else {
      // Optional: Delete file after download or keep it for a while (jobManager cleans up jobs, but maybe not files)
      // For now, we rely on manual cleanup or a cron job, or just leave it in temp
      // Ideally, we should delete it after some time.
      // fs.unlinkSync(job.result); // Don't delete immediately if multiple people might download, but here it's one-off
    }
  });
};

// ==================== SUBJECT LINKING ====================

// Get all admin panel subjects for linking dropdown
export const getSubjectsForLinking = async (req, res) => {
  try {
    const subjects = await Subject.find({})
      .select("_id subjectName subjectCode markingScheme")
      .lean();

    res.status(200).json(subjects);
  } catch (error) {
    console.error("Error fetching subjects for linking:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch subjects", error: error.message });
  }
};

// Get subject configs with their linking status
export const getSubjectConfigsForLinking = async (req, res) => {
  try {
    const { examSessionId } = req.query;

    const filter = {};
    if (examSessionId) filter.examSessionId = examSessionId;

    const configs = await RegularExamSubjectConfig.find(filter)
      .populate("examSessionId", "name sessionType batch course")
      .populate("subjects.subjectId", "subjectName subjectCode markingScheme")
      .lean();

    // Transform to include linking status for each subject
    const result = configs.map((config) => ({
      ...config,
      subjects: config.subjects.map((subj) => ({
        ...subj,
        isLinked: !!subj.subjectId,
        linkedSubject: subj.subjectId || null,
      })),
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching subject configs for linking:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch configs", error: error.message });
  }
};

// Link/unlink a subject in a config
export const linkSubjectInConfig = async (req, res) => {
  try {
    const { configId, examSubjectId } = req.params;
    const { subjectId } = req.body;

    const config = await RegularExamSubjectConfig.findById(configId);
    if (!config) {
      return res.status(404).json({ message: "Subject config not found" });
    }

    // Find the subject in the config's subjects array
    const subjectIndex = config.subjects.findIndex(
      (s) => s.id === examSubjectId
    );
    if (subjectIndex === -1) {
      return res.status(404).json({ message: "Subject not found in config" });
    }

    // Update the subjectId (null to unlink, ObjectId to link)
    config.subjects[subjectIndex].subjectId = subjectId || null;
    await config.save();

    // Also update any existing enrollments that have this subject
    await RegularExamEnrollment.updateMany(
      { examSessionId: config.examSessionId, "subjects.id": examSubjectId },
      { $set: { "subjects.$[elem].subjectId": subjectId || null } },
      { arrayFilters: [{ "elem.id": examSubjectId }] }
    );

    // Populate the linked subject for response
    const updatedConfig = await RegularExamSubjectConfig.findById(configId)
      .populate("subjects.subjectId", "subjectName subjectCode markingScheme")
      .lean();

    res.status(200).json({
      message: subjectId
        ? "Subject linked successfully"
        : "Subject unlinked successfully",
      config: updatedConfig,
    });
  } catch (error) {
    console.error("Error linking subject:", error);
    res
      .status(500)
      .json({ message: "Failed to link subject", error: error.message });
  }
};

// Bulk link subjects in a config
export const bulkLinkSubjectsInConfig = async (req, res) => {
  try {
    const { configId } = req.params;
    const { links } = req.body; // Array of { examSubjectId, subjectId }

    if (!Array.isArray(links)) {
      return res.status(400).json({ message: "links must be an array" });
    }

    const config = await RegularExamSubjectConfig.findById(configId);
    if (!config) {
      return res.status(404).json({ message: "Subject config not found" });
    }

    // Update each subject
    for (const link of links) {
      const subjectIndex = config.subjects.findIndex(
        (s) => s.id === link.examSubjectId
      );
      if (subjectIndex !== -1) {
        config.subjects[subjectIndex].subjectId = link.subjectId || null;
      }
    }
    await config.save();

    // Update enrollments for each subject
    for (const link of links) {
      await RegularExamEnrollment.updateMany(
        { examSessionId: config.examSessionId, "subjects.id": link.examSubjectId },
        { $set: { "subjects.$[elem].subjectId": link.subjectId || null } },
        { arrayFilters: [{ "elem.id": link.examSubjectId }] }
      );
    }

    const updatedConfig = await RegularExamSubjectConfig.findById(configId)
      .populate("subjects.subjectId", "subjectName subjectCode markingScheme")
      .lean();

    res.status(200).json({
      message: "Subjects linked successfully",
      config: updatedConfig,
    });
  } catch (error) {
    console.error("Error bulk linking subjects:", error);
    res
      .status(500)
      .json({ message: "Failed to bulk link subjects", error: error.message });
  }
};
