import FeeReceipt from "../models/feeReceiptModel.js";
import UnifiedReceipt from "../models/unifiedReceiptModel.js";
import Student from "../models/studentModel.js";
import paymentModel from "../models/paymentModel.js";
import FeeStructure from "../models/feeStructureModel.js";
import ATKTForm from "../models/atktFormModel.js";
import applicationModel from "../models/applicationModel.js";
import programModel from "../models/programModel.js";
import User from "../models/userModel.js";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import UnifiedReceiptTemplate from "../templates/UnifiedReceiptTemplate.js";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedAssets = null;
let cachedAssetsTime = null;
const CACHE_DURATION = 60 * 60 * 1000;

let browserInstance = null;

// Helper function to resolve unknown student details from payment/user data
const resolveUnknownStudentDetails = async (receipt) => {
  const studentDetails = { ...receipt.studentDetails };
  const unknownNameValues = ["Unknown Applicant", "Unknown Student", "Unknown"];
  let needsNameResolution = unknownNameValues.includes(studentDetails.name);
  let needsProgramResolution = studentDetails.program === "Unknown Program";
  
  // Return early if nothing needs resolution
  if (!needsNameResolution && !needsProgramResolution) {
    return studentDetails;
  }

  // Try to get data from payment notes
  if (receipt.payment?.payload?.notes?.studentName && needsNameResolution) {
    studentDetails.name = receipt.payment.payload.notes.studentName;
    needsNameResolution = unknownNameValues.includes(studentDetails.name);
  }

  // Try to get from application - check receipt.applicationId OR payment.payload.notes.applicationId
  const applicationId = receipt.applicationId || receipt.payment?.payload?.notes?.applicationId;
  if (receipt.receiptType === "application" && applicationId) {
    const application = await applicationModel.findById(applicationId);
    if (application) {
      if (application.studentDetails?.firstName && needsNameResolution) {
        studentDetails.name = `${application.studentDetails.firstName} ${application.studentDetails.lastName || ""}`.trim();
        needsNameResolution = unknownNameValues.includes(studentDetails.name);
      }
      studentDetails.email = studentDetails.email || application.studentDetails?.emailAddress || application.studentDetails?.email || "";
      studentDetails.mobile = studentDetails.mobile || application.studentDetails?.studentMobileNumber || application.studentDetails?.mobile || "";
      if (needsProgramResolution && application.course) {
        studentDetails.program = application.course;
        needsProgramResolution = false;
      }
      studentDetails.id = application.applicationNumber || studentDetails.id;
    }
  }

  // Try to get from User model (for name/email/mobile and to find their applications for program)
  if (receipt.user && (needsNameResolution || needsProgramResolution)) {
    const user = await User.findById(receipt.user);
    if (user?.firstName && needsNameResolution) {
      studentDetails.name = `${user.firstName} ${user.lastName || ""}`.trim();
      studentDetails.email = studentDetails.email || user.email || "";
      studentDetails.mobile = studentDetails.mobile || user.mobile || "";
      needsNameResolution = unknownNameValues.includes(studentDetails.name);
    }
    
    // If program still unknown, try to find any application by this user
    if (needsProgramResolution && receipt.receiptType === "application") {
      const userApplication = await applicationModel.findOne({ 
        loginStudentId: receipt.user,
        course: { $exists: true, $ne: null, $ne: "" }
      });
      if (userApplication?.course) {
        studentDetails.program = userApplication.course;
        needsProgramResolution = false;
      }
    }
  }

  // Try from payment email/contact if name still unknown
  if (receipt.payment?.payload?.email && needsNameResolution) {
    // Extract name from email (before @) as last resort
    const emailName = receipt.payment.payload.email.split("@")[0];
    // Only use if it looks like a name (has letters, no pure numbers)
    if (/[a-zA-Z]/.test(emailName) && !/^\d+$/.test(emailName)) {
      studentDetails.name = emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
  }

  return studentDetails;
};

const generateReceiptNumber = async (receiptType = "FR") => {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");

  const prefix =
    receiptType === "student_fee"
      ? "FR"
      : receiptType === "application"
        ? "AR"
        : receiptType === "atkt"
          ? "ER"
          : "RR";

  const lastReceipt = await UnifiedReceipt.findOne({
    receiptNumber: new RegExp(`^${prefix}${year}${month}`),
  }).sort({ receiptNumber: -1 });

  let sequence = 1;
  if (lastReceipt) {
    const lastSequence = parseInt(lastReceipt.receiptNumber.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${prefix}${year}${month}${String(sequence).padStart(4, "0")}`;
};

const getBrowserInstance = async () => {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--disable-extensions",
      ],
    });
  }
  return browserInstance;
};

const loadBase64Assets = async () => {
  const now = Date.now();
  if (cachedAssets && cachedAssetsTime && (now - cachedAssetsTime) < CACHE_DURATION) {
    return cachedAssets;
  }

  try {
    const uploadsPath = path.join(__dirname, "..", "uploads", "images");

    const loadImage = async (filename) => {
      try {
        const imagePath = path.join(uploadsPath, filename);
        if (fs.existsSync(imagePath)) {
          const imageBuffer = fs.readFileSync(imagePath);
          const base64 = imageBuffer.toString("base64");
          const ext = path.extname(filename).toLowerCase();
          const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
          return `data:${mimeType};base64,${base64}`;
        }
      } catch (error) {
        console.error(`Error loading ${filename}:`, error.message);
      }
      return null;
    };

    cachedAssets = {
      collegeSealBase64: await loadImage("clg_seal.png"),
      agnelLogoBase64: await loadImage("agnel-logo.png"),
      naacLogoBase64: await loadImage("naac.png"),
    };
    cachedAssetsTime = now;
    return cachedAssets;
  } catch (error) {
    console.error("Error loading base64 assets:", error);
    return {
      collegeSealBase64: null,
      agnelLogoBase64: null,
      naacLogoBase64: null,
    };
  }
};

export const createUnifiedReceipt = async (
  paymentId,
  receiptType,
  additionalData = {},
) => {
  try {
    const payment = await paymentModel.findById(paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }

    const existingReceipt = await UnifiedReceipt.findOne({
      payment: paymentId,
    });
    if (existingReceipt) {
      console.log("Unified receipt already exists, returning existing receipt");
      return existingReceipt;
    }

    const receiptNumber = await generateReceiptNumber(receiptType);

    // Get amount from payment - always use payload.amount (in paise) / 100
    const amountPaid = payment.payload?.amount
      ? payment.payload.amount / 100
      : 0;

    let receiptData = {
      receiptNumber,
      receiptType,
      payment: paymentId,
      paymentDetails: {
        paymentDate: payment.createdAt,
        paymentMode: "Online",
        transactionId: payment.paymentId,
        orderId: payment.orderId,
        razorpayPaymentId: payment.paymentId,
      },
      paymentSummary: {
        amountPaid: amountPaid,
        isFullPayment: payment.isFullPayment || false,
        installmentNumber: payment.installmentNumber,
      },
      institutionDetails: {
        name: "AGNEL SCHOOL OF LAW",
        address: "Sector 9A, Vashi, Navi Mumbai, Maharashtra 400703",
        phone: "02227771000",
        email: "asl@agnelschooloflaw.com",
        website: "www.agnelschooloflaw.com",
      },
    };

    if (receiptType === "student_fee") {
      const student = await Student.findById(payment.studentId);
      const feeStructure = await FeeStructure.findById(payment.feeStructureId);

      if (student && feeStructure) {
        receiptData.student = student._id;
        receiptData.feeStructureId = feeStructure._id;
        receiptData.academicYear = payment.academicYear;
        receiptData.studentDetails = {
          name: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
          id: student.studentId,
          idLabel: "Student ID",
          email: student.studentDetails.email,
          mobile: student.studentDetails.mobile,
          program: student.academicDetails.program,
          batch: student.academicDetails.batch?.name,
          rollNumber: student.academicDetails.rollNumber,
        };
        receiptData.paymentDetails.academicYear = payment.academicYear;
        receiptData.feeBreakdown = {
          tuitionFee: feeStructure.fees?.tuitionFee || 0,
          developmentFee: feeStructure.fees?.developmentFee || 0,
          latePaymentPenalty: payment.payload?.notes?.latePaymentPenalty
            ? parseFloat(payment.payload.notes.latePaymentPenalty)
            : 0,
        };
        receiptData.paymentSummary.totalFeeAmount = feeStructure.totalAmount;

        const allPayments = await paymentModel.find({
          studentId: student._id,
          feeStructureId: feeStructure._id,
          academicYear: payment.academicYear,
          paymentType: "student_fee",
        });
        const totalPaid = allPayments.reduce(
          (sum, p) => sum + (p.amount || 0),
          0,
        );
        receiptData.paymentSummary.remainingBalance =
          feeStructure.totalAmount - totalPaid;
      }
    } else if (receiptType === "application") {
      const application = await applicationModel.findById(
        payment.applicationId,
      );

      if (application) {
        const program = await programModel.findOne({
          programName: application.course,
        });

        receiptData.user = payment.userId;
        receiptData.applicationId = application._id;
        receiptData.studentDetails = {
          name: `${application.studentDetails.firstName} ${application.studentDetails.lastName}`,
          id: application.applicationNumber,
          idLabel: "Application Number",
          email: application.studentDetails.email,
          mobile: application.studentDetails.mobile,
          program: application.course,
        };
        receiptData.feeBreakdown = {
          applicationFee: program?.applicationFee || amountPaid,
          developmentFee: program?.developmentFee || 0,
        };
        receiptData.paymentSummary.totalFeeAmount = program?.applicationFee || amountPaid;
      }
    } else if (receiptType === "atkt") {
      const atktForm = await ATKTForm.findById(payment.atktFormId);

      if (atktForm) {
        receiptData.atktFormId = atktForm._id;
        receiptData.studentDetails = {
          name: atktForm.studentName,
          id: atktForm.rollNumber,
          idLabel: "Roll Number",
          mobile: atktForm.contactNumber,
          course: atktForm.course,
          batch: atktForm.batch,
          pattern: atktForm.pattern,
        };
        receiptData.feeBreakdown = {
          examinationFee: amountPaid,
        };
        receiptData.subjects =
          atktForm.subjects
            ?.filter((s) => s.type !== "section")
            .map((s) => ({
              id: s.id,
              label: s.label,
              name: s.label,
              code: s.code || s.id,
            })) || [];
        receiptData.paymentSummary.totalFeeAmount = amountPaid;
      }
    }

    Object.assign(receiptData, additionalData);

    const receipt = await UnifiedReceipt.create(receiptData);
    return receipt;
  } catch (error) {
    console.error("Error creating unified receipt:", error);
    throw error;
  }
};

export const getUnifiedReceipts = async (req, res) => {
  try {
    const {
      search,
      batch,
      academicYear,
      startDate,
      endDate,
      receiptType,
      studentId,
      page = 1,
      limit = 20,
    } = req.query;
    const userRole = req.user.role;
    const userId = req.user.userId || req.user.studentId;
    
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    // If logged in as student (has studentId in token), only show their receipts
    if (req.user.studentId) {
      const student = await Student.findById(req.user.studentId);
      if (!student) {
        return res
          .status(404)
          .json({ success: false, message: "Student not found" });
      }
      // Show receipts linked to student ID OR linked to their user account (for application fees)
      const orConditions = [{ student: student._id }];
      
      if (student.loginStudentId && mongoose.Types.ObjectId.isValid(student.loginStudentId)) {
        orConditions.push({ user: student.loginStudentId });
      }
      
      query.$or = orConditions;
    } else if (userRole === "student") {
      // Fallback for old token format
      const student = await Student.findById(userId);
      if (!student) {
        return res
          .status(404)
          .json({ success: false, message: "Student not found" });
      }
      query.student = student._id;
    } else if (studentId) {
      // Admin/faculty can filter by specific student
      query.student = studentId;
    }

    if (receiptType) {
      query.receiptType = receiptType;
    }

    if (search) {
      query.$or = [
        { receiptNumber: new RegExp(search, "i") },
        { "studentDetails.name": new RegExp(search, "i") },
        { "studentDetails.id": new RegExp(search, "i") },
      ];
    }

    if (batch) {
      // For application receipts, batch filter should match program
      // For student_fee/atkt receipts, batch filter matches actual batch
      if (receiptType === "application") {
        // Use regex to match program with or without hyphens (e.g., "BA LLB" matches "BA-LLB")
        const normalizedBatch = batch.replace(/\s+/g, "[-\\s]?");
        query["studentDetails.program"] = new RegExp(
          `^${normalizedBatch}$`,
          "i",
        );
      } else {
        query["studentDetails.batch"] = batch;
      }
    }

    if (academicYear) {
      query.academicYear = academicYear;
    }

    if (startDate || endDate) {
      query["paymentDetails.paymentDate"] = {};
      if (startDate) {
        query["paymentDetails.paymentDate"].$gte = new Date(startDate);
      }
      if (endDate) {
        query["paymentDetails.paymentDate"].$lte = new Date(endDate);
      }
    }

    const totalCount = await UnifiedReceipt.countDocuments(query);
    
    // Get all IDs for "select all" functionality - use lean() and only fetch _id
    const allIdsResult = await UnifiedReceipt.find(query).select("_id").lean();
    const allIds = allIdsResult.map((r) => r._id);
    
    const receipts = await UnifiedReceipt.find(query)
      .populate("payment", "payload paymentId orderId createdAt isManualPayment manualPaymentDetails")
      .populate("student", "studentDetails studentId")
      .sort({ "paymentDetails.paymentDate": -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Resolve unknown student details for receipts that need it
    const resolvedReceipts = await Promise.all(
      receipts.map(async (receipt) => {
        const unknownNameValues = ["Unknown Applicant", "Unknown Student", "Unknown"];
        const needsResolution = 
          unknownNameValues.includes(receipt.studentDetails?.name) ||
          receipt.studentDetails?.program === "Unknown Program";
        if (needsResolution) {
          const resolvedDetails = await resolveUnknownStudentDetails(receipt);
          return { ...receipt, studentDetails: resolvedDetails };
        }
        return receipt;
      })
    );

    res.status(200).json({
      success: true,
      data: resolvedReceipts,
      count: receipts.length,
      allIds,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        limit: limitNum,
        hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching unified receipts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch receipts",
      error: error.message,
    });
  }
};

export const getReceiptByIdUnified = async (req, res) => {
  try {
    const { receiptId } = req.params;

    const receipt = await UnifiedReceipt.findById(receiptId)
      .populate("payment")
      .populate("student");

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: "Receipt not found",
      });
    }

    // Resolve unknown student details
    const resolvedStudentDetails = await resolveUnknownStudentDetails(receipt);
    const resolvedReceipt = receipt.toObject();
    resolvedReceipt.studentDetails = resolvedStudentDetails;

    res.status(200).json({
      success: true,
      data: resolvedReceipt,
    });
  } catch (error) {
    console.error("Error fetching receipt:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch receipt",
      error: error.message,
    });
  }
};

export const downloadReceiptPDF = async (req, res) => {
  try {
    const { receiptId } = req.params;

    let receipt = await UnifiedReceipt.findById(receiptId)
      .populate("payment")
      .populate("student");

    // Fallback: if not found by ID, try looking up by atktFormId or payment ref
    if (!receipt) {
      receipt = await UnifiedReceipt.findOne({
        $or: [{ atktFormId: receiptId }, { payment: receiptId }],
      })
        .populate("payment")
        .populate("student");
    }

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: "Receipt not found",
      });
    }

    if (req.user.studentId) {
      const student = await Student.findById(req.user.studentId);
      if (!student) {
        return res
          .status(404)
          .json({ success: false, message: "Student not found" });
      }

      if (
        receipt.student &&
        receipt.student._id.toString() !== student._id.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied: You can only download your own receipts",
        });
      }
    }

    const assets = await loadBase64Assets();
    
    let feeBreakdown = receipt.feeBreakdown;
    
    if (receipt.receiptType === "application" && receipt.applicationId) {
      const application = await applicationModel.findById(receipt.applicationId);
      if (application) {
        const program = await programModel.findOne({
          programName: application.course,
        });
        if (program) {
          feeBreakdown = {
            applicationFee: program.applicationFee || receipt.feeBreakdown?.applicationFee || 0,
            developmentFee: program.developmentFee || 0,
          };
        }
      }
    }

    // Resolve unknown student details from payment/user data
    const resolvedStudentDetails = await resolveUnknownStudentDetails(receipt);
    
    const receiptData = {
      receiptType: receipt.receiptType,
      receiptNumber: receipt.receiptNumber,
      institutionDetails: receipt.institutionDetails,
      studentDetails: resolvedStudentDetails,
      paymentDetails: receipt.paymentDetails,
      feeBreakdown: feeBreakdown,
      paymentSummary: receipt.paymentSummary,
      subjects: receipt.subjects,
      academicYear: receipt.academicYear,
      copyLabel: req.user.studentId ? "Student Copy" : undefined,
      ...assets,
    };

    const html = UnifiedReceiptTemplate(receiptData);

    let pdf;
    let page;
    let browser;

    const generatePdf = async (retry = false) => {
      try {
        browser = await getBrowserInstance();
        page = await browser.newPage();
        await page.setContent(html, {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });

        pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
          preferCSSPageSize: true,
        });

        await page.close();
        page = null;
      } catch (error) {
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch (e) {
            console.error("Error closing page:", e);
          }
        }
        
        // If it's a protocol error or detached frame, and we haven't retried yet
        if (
          !retry &&
          (error.message.includes("Protocol error") ||
            error.message.includes("detached") ||
            error.message.includes("Target closed"))
        ) {
          console.log("Browser error detected, restarting browser and retrying...");
          if (browserInstance) {
            try {
              await browserInstance.close();
            } catch (e) {
              console.error("Error closing browser instance:", e);
            }
            browserInstance = null;
          }
          return generatePdf(true);
        }
        throw error;
      }
    };

    try {
      await generatePdf();

      await UnifiedReceipt.findByIdAndUpdate(receiptId, {
        $inc: { downloadCount: 1 },
        lastDownloadedAt: new Date(),
        receiptStatus: "downloaded",
      });

      const studentName = (receipt.studentDetails?.name || "Student")
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "");
      const fileName = `${studentName}_Receipt_${receipt.receiptNumber}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`,
      );
      res.send(pdf);
    } catch (pdfError) {
      throw pdfError;
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to generate PDF",
        error: error.message,
      });
    }
  }
};

export const downloadAllReceiptsPDF = async (req, res) => {
  let browser = null;
  try {
    const { receiptIds } = req.body;

    if (!receiptIds || !Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Receipt IDs are required",
      });
    }

    const receipts = await UnifiedReceipt.find({ _id: { $in: receiptIds } })
      .populate("payment")
      .populate("student");

    if (!receipts || receipts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No receipts found",
      });
    }

    const assets = await loadBase64Assets();
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    });

    const applicationReceipts = receipts.filter(r => r.receiptType === "application" && r.applicationId);
    const applicationIds = applicationReceipts.map(r => r.applicationId);
    
    const applicationsMap = {};
    const programsMap = {};
    
    if (applicationIds.length > 0) {
      const applications = await applicationModel.find({ _id: { $in: applicationIds } });
      const courseNames = [...new Set(applications.map(a => a.course))];
      const programs = await programModel.find({ programName: { $in: courseNames } });
      
      applications.forEach(app => {
        applicationsMap[app._id.toString()] = app;
      });
      
      programs.forEach(prog => {
        programsMap[prog.programName] = prog;
      });
    }

    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < receipts.length; i += BATCH_SIZE) {
      batches.push(receipts.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;

    for (const batch of batches) {
      const pdfPromises = batch.map(async (receipt) => {
        let page;
        try {
          let feeBreakdown = receipt.feeBreakdown;
          
          if (receipt.receiptType === "application" && receipt.applicationId) {
            const application = applicationsMap[receipt.applicationId.toString()];
            if (application) {
              const program = programsMap[application.course];
              if (program) {
                feeBreakdown = {
                  applicationFee: program.applicationFee || receipt.feeBreakdown?.applicationFee || 0,
                  developmentFee: program.developmentFee || 0,
                };
              }
            }
          }

          // Resolve unknown student details from payment/user data
          const resolvedStudentDetails = await resolveUnknownStudentDetails(receipt);
          
          const receiptData = {
            receiptType: receipt.receiptType,
            receiptNumber: receipt.receiptNumber,
            institutionDetails: receipt.institutionDetails,
            studentDetails: resolvedStudentDetails,
            paymentDetails: receipt.paymentDetails,
            feeBreakdown: feeBreakdown,
            paymentSummary: receipt.paymentSummary,
            subjects: receipt.subjects,
            academicYear: receipt.academicYear,
            ...assets,
          };

          const html = UnifiedReceiptTemplate(receiptData);
          page = await browser.newPage();

          await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 10000 });

          const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
            preferCSSPageSize: true,
          });

          await page.close();
          page = null;

          const studentName = (receipt.studentDetails?.name || "Student")
            .replace(/\s+/g, "_")
            .replace(/[^a-zA-Z0-9_]/g, "");
          const fileName = `${studentName}_Receipt_${receipt.receiptNumber}.pdf`;

          zip.file(fileName, pdf);

          UnifiedReceipt.findByIdAndUpdate(receipt._id, {
            $inc: { downloadCount: 1 },
            lastDownloadedAt: new Date(),
            receiptStatus: "downloaded",
          }).catch((err) => console.error("Error updating receipt:", err));

          return { success: true, receiptNumber: receipt.receiptNumber };
        } catch (error) {
          console.error(
            `Error generating PDF for ${receipt.receiptNumber}:`,
            error.message,
          );
          if (page && !page.isClosed()) {
            try {
              await page.close();
            } catch (closeError) {
              console.error("Error closing page:", closeError.message);
            }
          }
          return {
            success: false,
            receiptNumber: receipt.receiptNumber,
            error: error.message,
          };
        }
      });

      await Promise.all(pdfPromises);
      processedCount += batch.length;
      console.log(`Processed ${processedCount}/${receipts.length} receipts`);
    }

    await browser.close();
    browser = null;

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 3 },
      streamFiles: true,
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Receipts_${new Date().toISOString().split("T")[0]}.zip`,
    );
    res.send(zipBuffer);
  } catch (error) {
    console.error("Error generating bulk PDFs:", error);
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Error closing browser:", closeError.message);
      }
    }
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to generate PDFs",
        error: error.message,
      });
    }
  }
};

export const downloadUnifiedReceiptsExcel = async (req, res) => {
  try {
    const { search, batch, academicYear, startDate, endDate, receiptType } =
      req.query;

    let query = {};

    if (receiptType) {
      query.receiptType = receiptType;
    }

    if (search) {
      query.$or = [
        { receiptNumber: new RegExp(search, "i") },
        { "studentDetails.name": new RegExp(search, "i") },
        { "studentDetails.id": new RegExp(search, "i") },
      ];
    }

    if (batch) {
      if (receiptType === "application") {
        query["studentDetails.program"] = batch;
      } else {
        query["studentDetails.batch"] = batch;
      }
    }

    if (academicYear) {
      query.academicYear = academicYear;
    }

    if (startDate || endDate) {
      query["paymentDetails.paymentDate"] = {};
      if (startDate) {
        query["paymentDetails.paymentDate"].$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query["paymentDetails.paymentDate"].$lte = endDateTime;
      }
    }

    const receipts = await UnifiedReceipt.find(query)
      .populate("payment")
      .populate("student")
      .sort({ "paymentDetails.paymentDate": -1 });

    const formattedReceipts = receipts.map((receipt) => {
      const typeLabel =
        receipt.receiptType === "student_fee"
          ? "Student Fee"
          : receipt.receiptType === "application"
            ? "Application Fee"
            : receipt.receiptType === "atkt"
              ? "ATKT Fee"
              : "Other";

      return {
        "Receipt Number": receipt.receiptNumber || "",
        "Receipt Type": typeLabel,
        "Student Name": (receipt.studentDetails?.name || "").toUpperCase(),
        "Student ID": receipt.studentDetails?.id || "",
        Batch: (receipt.studentDetails?.batch || "").toUpperCase(),
        Program: receipt.studentDetails?.program || "",
        "Academic Year": receipt.academicYear || "",
        "Tuition Fee": receipt.feeBreakdown?.tuitionFee || 0,
        "Development Fee": receipt.feeBreakdown?.developmentFee || 0,
        "Application Fee": receipt.feeBreakdown?.applicationFee || 0,
        "Examination Fee": receipt.feeBreakdown?.examinationFee || 0,
        "Late Payment Penalty": receipt.feeBreakdown?.latePaymentPenalty || 0,
        "Amount Paid": receipt.paymentSummary?.amountPaid || 0,
        "Payment Mode": receipt.paymentDetails?.paymentMode || "Online",
        "Transaction ID": receipt.paymentDetails?.orderId || "",
        "Razorpay Payment ID": receipt.paymentDetails?.razorpayPaymentId || "",
        "Payment Date": receipt.paymentDetails?.paymentDate
          ? new Date(receipt.paymentDetails.paymentDate).toLocaleDateString()
          : "",
        "Installment Number": receipt.paymentSummary?.installmentNumber || "",
        "Payment Type": receipt.paymentSummary?.isFullPayment
          ? "Full Payment"
          : "Installment",
        "Receipt Status": (receipt.receiptStatus || "generated").toUpperCase(),
        "Download Count": receipt.downloadCount || 0,
      };
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Unified Receipts");

    worksheet.columns = [
      { header: "Receipt Number", key: "Receipt Number", width: 20 },
      { header: "Receipt Type", key: "Receipt Type", width: 15 },
      { header: "Student Name", key: "Student Name", width: 25 },
      { header: "Student ID", key: "Student ID", width: 15 },
      { header: "Batch", key: "Batch", width: 15 },
      { header: "Program", key: "Program", width: 20 },
      { header: "Academic Year", key: "Academic Year", width: 15 },
      { header: "Tuition Fee", key: "Tuition Fee", width: 12 },
      { header: "Development Fee", key: "Development Fee", width: 15 },
      { header: "Application Fee", key: "Application Fee", width: 15 },
      { header: "Examination Fee", key: "Examination Fee", width: 15 },
      {
        header: "Late Payment Penalty",
        key: "Late Payment Penalty",
        width: 18,
      },
      { header: "Amount Paid", key: "Amount Paid", width: 12 },
      { header: "Payment Mode", key: "Payment Mode", width: 15 },
      { header: "Transaction ID", key: "Transaction ID", width: 25 },
      { header: "Razorpay Payment ID", key: "Razorpay Payment ID", width: 25 },
      { header: "Payment Date", key: "Payment Date", width: 15 },
      { header: "Installment Number", key: "Installment Number", width: 18 },
      { header: "Payment Type", key: "Payment Type", width: 15 },
      { header: "Receipt Status", key: "Receipt Status", width: 15 },
      { header: "Download Count", key: "Download Count", width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    formattedReceipts.forEach((data) => {
      worksheet.addRow(data);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=unified_receipts_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error downloading unified receipts:", err);
    res.status(500).json({ error: "Failed to download unified receipts" });
  }
};

export const createFeeReceipt = async (paymentId, studentFeeId) => {
  try {
    const payment = await paymentModel.findById(paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }

    const student = await Student.findById(payment.studentId);
    if (!student) {
      throw new Error("Student not found");
    }

    const feeStructure = await FeeStructure.findById(payment.feeStructureId);
    if (!feeStructure) {
      throw new Error("Fee structure not found");
    }

    const allPayments = await paymentModel.find({
      studentId: payment.studentId,
      feeStructureId: payment.feeStructureId,
      academicYear: payment.academicYear,
      paymentType: "student_fee",
    });

    const totalPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    const receiptNumber = await generateReceiptNumber();

    const amountPaid = totalPaid;
    const isFullPayment = payment.isFullPayment;

    const latePaymentPenalty = payment.payload?.notes?.latePaymentPenalty
      ? parseFloat(payment.payload.notes.latePaymentPenalty)
      : 0;

    const tuitionFee =
      typeof feeStructure.fees?.tuitionFee === "number"
        ? feeStructure.fees.tuitionFee
        : 0;
    const developmentFee =
      typeof feeStructure.fees?.developmentFee === "number"
        ? feeStructure.fees.developmentFee
        : 0;

    const feeBreakdown = {
      tuitionFee,
      developmentFee,
      latePaymentPenalty: Number.isFinite(latePaymentPenalty)
        ? latePaymentPenalty
        : 0,
    };

    const paymentSummary = {
      totalFeeAmount:
        typeof feeStructure.totalAmount === "number"
          ? feeStructure.totalAmount
          : 0,
      amountPaid: amountPaid,
      installmentNumber: payment.installmentNumber,
      isFullPayment: isFullPayment,
    };

    const receiptData = {
      receiptNumber,
      student: student._id,
      payment: paymentId,
      academicYear: payment.academicYear,
      receiptDetails: {
        studentName: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
        studentId: student.studentId,
        batchName: student.academicDetails.batch.name,
        program: student.academicDetails.program,
        paymentDate: payment.createdAt,
        paymentMode: "Online",
        transactionId: payment.orderId,
        razorpayPaymentId: payment.paymentId,
      },
      feeBreakdown,
      paymentSummary,
      institutionDetails: {
        name: "AGNEL SCHOOL OF LAW",
        address: "Sector 9A,Vashi ,Navi Mumbai Maharashtra 400703",
        phone: "02227771000",
        email: "asl@agnelschooloflaw.com",
        website: "www.agnelscollege.com",
      },
      receiptStatus: "generated",
    };

    const receipt = await FeeReceipt.findOneAndUpdate(
      { payment: paymentId },
      { $setOnInsert: receiptData },
      { new: true, upsert: true },
    );

    return receipt;
  } catch (error) {
    console.error("Error creating fee receipt:", error);
    throw error;
  }
};

export const getStudentReceipts = async (req, res) => {
  try {
    const loginStudentId = req.user.studentId;
    const { academicYear } = req.query;

    const query = { student: loginStudentId };
    if (academicYear) {
      query.academicYear = academicYear;
    }

    const receipts = await FeeReceipt.find(query)
      .populate("student", "studentDetails academicDetails studentId")
      .populate("payment", "amount paymentId orderId createdAt payload")
      .sort({ createdAt: -1 });

    const updatedReceipts = receipts.map((receipt) => {
      const receiptObj = receipt.toObject();

      if (
        receipt.payment &&
        receipt.payment.payload &&
        receipt.payment.payload.amount
      ) {
        const amountInRupees = receipt.payment.payload.amount / 100;
        if (receiptObj.paymentSummary) {
          receiptObj.paymentSummary.amountPaid = amountInRupees;
        }
      }

      return receiptObj;
    });

    res.status(200).json({
      success: true,
      count: updatedReceipts.length,
      data: updatedReceipts,
    });
  } catch (error) {
    console.error("Error fetching student receipts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch receipts",
      error: error.message,
    });
  }
};

export const getReceiptById = async (req, res) => {
  try {
    const { receiptId } = req.params;
    const loginStudentId = req.user.studentId;

    const receipt = await FeeReceipt.findOne({
      _id: receiptId,
      user: loginStudentId,
    })
      .populate("student")
      .populate("payment")
      .populate("studentFee");

    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: "Receipt not found",
      });
    }

    res.status(200).json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    console.error("Error fetching receipt:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch receipt",
      error: error.message,
    });
  }
};

// ---------------- ATKT Payment Utilities ----------------
export const getAllAtktPayments = async (req, res) => {
  try {
    const payments = await paymentModel
      .find({ paymentType: "atkt" })
      .sort({ createdAt: -1 });

    const enriched = await Promise.all(
      payments.map(async (p) => {
        const form = await ATKTForm.findById(p.atktFormId);
        return {
          _id: p._id,
          paymentId: p.paymentId,
          orderId: p.orderId,
          amount: p.amount,
          createdAt: p.createdAt,
          atktFormId: p.atktFormId,
          studentName: form?.studentName || null,
          rollNumber: form?.rollNumber || null,
          subjectsCount: form?.subjects?.length || 0,
          paymentStatus: form?.paymentStatus || null,
        };
      }),
    );

    res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    console.error("Error fetching ATKT payments:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch ATKT payments" });
  }
};

export const getAtktReceipt = async (req, res) => {
  try {
    const { atktFormId } = req.params;
    const form = await ATKTForm.findById(atktFormId);
    if (!form) {
      return res
        .status(404)
        .json({ success: false, message: "ATKT form not found" });
    }
    const studentId = req.user?.studentId;
    if (
      studentId &&
      form.submittedBy &&
      form.submittedBy.toString() !== studentId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this receipt",
      });
    }
    if (form.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Receipt available only after successful payment",
      });
    }

    const payment = await paymentModel.findOne({
      atktFormId: form._id,
      paymentType: "atkt",
    });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found for this ATKT form",
      });
    }

    const receiptPayload = {
      type: "ATKT_PAYMENT_RECEIPT",
      receiptNumber: `ATKT-${payment.paymentId}`,
      studentName: form.studentName,
      rollNumber: form.rollNumber,
      course: form.course,
      batch: form.batch,
      pattern: form.pattern,
      subjects: form.subjects || [],
      amount: form.amount,
      paymentDate: payment.createdAt,
      transactionId: payment.paymentId,
      orderId: payment.orderId,
      institution: {
        name: process.env.SMTP_COMPANY || "Institution",
        website: process.env.FRONTEND_URL || "",
      },
    };

    res.status(200).json({ success: true, data: receiptPayload });
  } catch (error) {
    console.error("Error generating ATKT receipt:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate ATKT receipt",
    });
  }
};

export const getAllReceipts = async (req, res) => {
  try {
    const { 
      search, 
      batch, 
      academicYear, 
      startDate, 
      endDate, 
      paymentStatus,
      page = 1,
      limit = 20 
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (batch) {
      query["receiptDetails.batchName"] = batch;
    }

    if (academicYear) {
      query.academicYear = academicYear;
    }

    if (startDate || endDate) {
      query["receiptDetails.paymentDate"] = {};
      if (startDate) {
        query["receiptDetails.paymentDate"].$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query["receiptDetails.paymentDate"].$lte = endDateTime;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { "receiptDetails.studentName": searchRegex },
        { "receiptDetails.studentId": searchRegex },
        { receiptNumber: searchRegex },
        { "receiptDetails.razorpayPaymentId": searchRegex },
      ];
    }

    const totalCount = await FeeReceipt.countDocuments(query);

    const receipts = await FeeReceipt.find(query)
      .populate("student", "studentDetails academicDetails studentId")
      .populate("payment", "amount paymentId orderId createdAt payload")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const filteredReceipts = receipts.map((receipt) => {
      if (
        receipt.payment &&
        receipt.payment.payload &&
        receipt.payment.payload.amount
      ) {
        const amountInRupees = receipt.payment.payload.amount / 100;
        if (receipt.paymentSummary) {
          receipt.paymentSummary.amountPaid = amountInRupees;
        }
      }
      return receipt;
    });

    res.status(200).json({
      success: true,
      count: filteredReceipts.length,
      data: filteredReceipts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        limit: limitNum,
        hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching all receipts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch receipts",
      error: error.message,
    });
  }
};

export const downloadReceiptsExcel = async (req, res) => {
  try {
    const { search, batch, academicYear, startDate, endDate } = req.query;

    const query = {};

    if (batch) {
      query["receiptDetails.batchName"] = batch;
    }

    if (academicYear) {
      query.academicYear = academicYear;
    }

    if (startDate || endDate) {
      query["receiptDetails.paymentDate"] = {};
      if (startDate) {
        query["receiptDetails.paymentDate"].$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query["receiptDetails.paymentDate"].$lte = endDateTime;
      }
    }

    const receipts = await FeeReceipt.find(query)
      .populate("student", "studentDetails academicDetails studentId")
      .populate("payment", "amount paymentId orderId createdAt payload")
      .sort({ createdAt: -1 });

    let filteredReceipts = receipts.map((receipt) => {
      const amountPaid = receipt.payment?.payload?.amount
        ? receipt.payment.payload.amount / 100
        : receipt.paymentSummary?.amountPaid || 0;

      return {
        "Receipt Number": receipt.receiptNumber || "",
        "Student Name": (
          receipt.receiptDetails?.studentName || ""
        ).toUpperCase(),
        "Student ID": receipt.receiptDetails?.studentId || "",
        Batch: (receipt.receiptDetails?.batchName || "").toUpperCase(),
        Program: receipt.receiptDetails?.program || "",
        "Academic Year": receipt.academicYear || "",
        "Tuition Fee": receipt.feeBreakdown?.tuitionFee || 0,
        "Development Fee": receipt.feeBreakdown?.developmentFee || 0,
        "Late Payment Penalty": receipt.feeBreakdown?.latePaymentPenalty || 0,
        "Amount Paid": amountPaid,
        "Payment Mode": receipt.receiptDetails?.paymentMode || "Online",
        "Transaction ID": receipt.receiptDetails?.transactionId || "",
        "Razorpay Payment ID": receipt.receiptDetails?.razorpayPaymentId || "",
        "Payment Date": receipt.receiptDetails?.paymentDate
          ? new Date(receipt.receiptDetails.paymentDate).toLocaleDateString()
          : "",
        "Installment Number": receipt.paymentSummary?.installmentNumber || "",
        "Payment Type": receipt.paymentSummary?.isFullPayment
          ? "Full Payment"
          : "Installment",
      };
    });

    if (search) {
      const searchLower = search.toLowerCase();
      filteredReceipts = filteredReceipts.filter(
        (receipt) =>
          receipt["Student Name"]?.toLowerCase().includes(searchLower) ||
          receipt["Student ID"]?.toLowerCase().includes(searchLower) ||
          receipt["Receipt Number"]?.toLowerCase().includes(searchLower) ||
          receipt["Razorpay Payment ID"]?.toLowerCase().includes(searchLower),
      );
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Fee Receipts");

    worksheet.columns = [
      { header: "Receipt Number", key: "receiptNumber", width: 20 },
      { header: "Student Name", key: "studentName", width: 25 },
      { header: "Student ID", key: "studentId", width: 15 },
      { header: "Batch", key: "batch", width: 15 },
      { header: "Program", key: "program", width: 20 },
      { header: "Academic Year", key: "academicYear", width: 15 },
      { header: "Tuition Fee", key: "tuitionFee", width: 12 },
      { header: "Development Fee", key: "developmentFee", width: 15 },
      { header: "Late Payment Penalty", key: "latePaymentPenalty", width: 18 },
      { header: "Amount Paid", key: "amountPaid", width: 12 },
      { header: "Payment Mode", key: "paymentMode", width: 15 },
      { header: "Transaction ID", key: "transactionId", width: 25 },
      { header: "Razorpay Payment ID", key: "razorpayPaymentId", width: 25 },
      { header: "Payment Date", key: "paymentDate", width: 15 },
      { header: "Installment Number", key: "installmentNumber", width: 18 },
      { header: "Payment Type", key: "paymentType", width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    filteredReceipts.forEach((data) => {
      worksheet.addRow({
        receiptNumber: data["Receipt Number"],
        studentName: data["Student Name"],
        studentId: data["Student ID"],
        batch: data["Batch"],
        program: data["Program"],
        academicYear: data["Academic Year"],
        tuitionFee: data["Tuition Fee"],
        developmentFee: data["Development Fee"],
        latePaymentPenalty: data["Late Payment Penalty"],
        amountPaid: data["Amount Paid"],
        paymentMode: data["Payment Mode"],
        transactionId: data["Transaction ID"],
        razorpayPaymentId: data["Razorpay Payment ID"],
        paymentDate: data["Payment Date"],
        installmentNumber: data["Installment Number"],
        paymentType: data["Payment Type"],
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=fee_receipts_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error downloading receipts:", err);
    res.status(500).json({ error: "Failed to download receipts" });
  }
};

export const getPendingPayments = async (req, res) => {
  try {
    const { search, batch, academicYear, paymentStatus, page = 1, limit = 20 } = req.query;
    
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const query = {};
    if (academicYear) {
      query.academicYear = academicYear;
    }

    const feeStructures = await FeeStructure.find(query).lean();

    if (feeStructures.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        stats: { total: 0, paid: 0, unpaid: 0, partial: 0, overdue: 0, totalPending: 0 },
        allIds: [],
        pagination: { currentPage: 1, totalPages: 0, totalCount: 0, limit: limitNum, hasNextPage: false, hasPrevPage: false },
      });
    }

    const feeStructureMap = new Map();
    const batchIds = [];
    feeStructures.forEach((fs) => {
      feeStructureMap.set(fs.batch.id.toString(), fs);
      batchIds.push(fs.batch.id);
    });

    let studentQuery = {
      "academicDetails.batch.id": { $in: batchIds },
    };

    if (batch) {
      const matchingStructures = feeStructures.filter(
        (fs) => fs.batch.name === batch,
      );
      if (matchingStructures.length > 0) {
        const matchingBatchIds = matchingStructures.map((fs) => fs.batch.id);
        studentQuery["academicDetails.batch.id"] = { $in: matchingBatchIds };
      } else {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          stats: { total: 0, paid: 0, unpaid: 0, partial: 0, overdue: 0, totalPending: 0 },
          allIds: [],
          pagination: { currentPage: 1, totalPages: 0, totalCount: 0, limit: limitNum, hasNextPage: false, hasPrevPage: false },
        });
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      studentQuery.$or = [
        { "studentDetails.firstName": searchRegex },
        { "studentDetails.lastName": searchRegex },
        { studentId: searchRegex },
        { email: searchRegex },
        { "studentDetails.emailAddress": searchRegex },
      ];
    }

    const students = await Student.find(studentQuery)
      .select("studentDetails academicDetails studentId email phone loginStudentId")
      .lean();

    if (students.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        stats: { total: 0, paid: 0, unpaid: 0, partial: 0, overdue: 0, totalPending: 0 },
        allIds: [],
        pagination: { currentPage: 1, totalPages: 0, totalCount: 0, limit: limitNum, hasNextPage: false, hasPrevPage: false },
      });
    }

    const studentIds = students.map((s) => s._id);
    const feeStructureIds = feeStructures.map((fs) => fs._id);

    // Bulk fetch all student_fee payments for these students
    const allPayments = await paymentModel.find({
      studentId: { $in: studentIds },
      feeStructureId: { $in: feeStructureIds },
      paymentType: "student_fee",
      isReversed: { $ne: true },
    }).lean();

    // Group payments by student
    const paymentsByStudent = new Map();
    allPayments.forEach((payment) => {
      const key = payment.studentId.toString();
      if (!paymentsByStudent.has(key)) {
        paymentsByStudent.set(key, []);
      }
      paymentsByStudent.get(key).push(payment);
    });

    // Bulk fetch application payments keyed by student._id
    // For bulk-admitted students, Student._id = Application._id, so query payments directly
    let applicationPaymentsMap = new Map();

    const directAppPayments = await paymentModel.find({
      applicationId: { $in: studentIds },
      paymentType: "application",
      isReversed: { $ne: true },
    }).lean();

    directAppPayments.forEach((p) => {
      const sid = p.applicationId.toString();
      const pAmount = p.payload?.amount ? p.payload.amount / 100 : 0;
      const pDate = p.createdAt;
      const existing = applicationPaymentsMap.get(sid);
      if (existing) {
        existing.amount += pAmount;
        if (new Date(pDate) > new Date(existing.date)) existing.date = pDate;
      } else {
        applicationPaymentsMap.set(sid, { amount: pAmount, date: pDate });
      }
    });

    // Fallback: loginStudentId lookup for single-admitted students not found above
    const loginStudentIds = students
      .filter((s) => s.loginStudentId && mongoose.Types.ObjectId.isValid(s.loginStudentId)
        && !applicationPaymentsMap.has(s._id.toString()))
      .map((s) => ({ loginId: s.loginStudentId, studentId: s._id.toString() }));

    if (loginStudentIds.length > 0) {
      const loginIds = loginStudentIds.map((l) => l.loginId);
      const loginToStudentId = new Map(loginStudentIds.map((l) => [l.loginId.toString(), l.studentId]));

      const applications = await applicationModel.find({
        loginStudentId: { $in: loginIds },
      }).select("_id loginStudentId").lean();

      const appToStudentMap = new Map();
      applications.forEach((a) => {
        const sid = loginToStudentId.get(a.loginStudentId.toString());
        if (sid) appToStudentMap.set(a._id.toString(), sid);
      });

      const applicationIds = applications.map((a) => a._id);
      if (applicationIds.length > 0) {
        const appPayments = await paymentModel.find({
          applicationId: { $in: applicationIds },
          paymentType: "application",
          isReversed: { $ne: true },
        }).lean();

        appPayments.forEach((p) => {
          const sid = appToStudentMap.get(p.applicationId.toString());
          if (sid) {
            const pAmount = p.payload?.amount ? p.payload.amount / 100 : 0;
            const pDate = p.createdAt;
            const existing = applicationPaymentsMap.get(sid);
            if (existing) {
              existing.amount += pAmount;
              if (new Date(pDate) > new Date(existing.date)) existing.date = pDate;
            } else {
              applicationPaymentsMap.set(sid, { amount: pAmount, date: pDate });
            }
          }
        });
      }
    }

    // Process students in memory
    const pendingPaymentsList = students.map((student) => {
      const batchId = student.academicDetails.batch.id.toString();
      const feeStructure = feeStructureMap.get(batchId);

      if (!feeStructure) return null;

      const studentFeePayments = paymentsByStudent.get(student._id.toString()) || [];
      
      // Get application fee if applicable
      let applicationFeeAmount = 0;
      let applicationFeeDate = null;
      const appPayment = applicationPaymentsMap.get(student._id.toString());
      if (appPayment) {
        applicationFeeAmount = appPayment.amount;
        applicationFeeDate = appPayment.date;
      }

      const studentFeePaid = studentFeePayments.reduce((sum, payment) => {
        return sum + (payment.payload?.amount ? payment.payload.amount / 100 : 0);
      }, 0);
      
      const totalPaid = studentFeePaid + applicationFeeAmount;
      const remainingAmount = Math.max(0, feeStructure.totalAmount - totalPaid);
      const status = remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "unpaid";

      const allDates = [
        ...studentFeePayments.map((p) => new Date(p.createdAt)),
        ...(applicationFeeDate ? [new Date(applicationFeeDate)] : []),
      ];
      const lastPaymentDate = allDates.length > 0
        ? new Date(Math.max(...allDates))
        : null;

      const installments = feeStructure.paymentStructure?.installments || [];
      const sortedInstallments = [...installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
      let cumulativeAmount = 0;
      const nextDueInstallment = status !== "paid"
        ? sortedInstallments.find((inst) => {
            cumulativeAmount += inst.amount;
            return totalPaid < cumulativeAmount;
          })
        : null;

      const isOverdue = nextDueInstallment
        ? new Date(nextDueInstallment.dueDate) < new Date()
        : false;

      return {
        _id: student._id,
        studentName: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
        studentId: student.studentId,
        email: student.email || student.studentDetails.emailAddress,
        phone: student.phone || student.studentDetails.studentMobileNumber,
        batch: student.academicDetails.batch.name,
        program: student.academicDetails.program,
        academicYear: feeStructure.academicYear,
        totalAmount: feeStructure.totalAmount,
        paidAmount: totalPaid,
        remainingAmount: remainingAmount,
        paymentStatus: status,
        lastPaymentDate: lastPaymentDate,
        nextDueDate: nextDueInstallment?.dueDate || null,
        isOverdue: isOverdue,
        paymentsCount: studentFeePayments.length + (applicationFeeAmount > 0 ? 1 : 0),
      };
    });

    let filteredData = pendingPaymentsList.filter((item) => item !== null);

    if (paymentStatus && paymentStatus !== "all") {
      filteredData = filteredData.filter(
        (item) => item.paymentStatus === paymentStatus,
      );
    }

    filteredData.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return b.remainingAmount - a.remainingAmount;
    });

    // Calculate stats before pagination
    const stats = {
      total: filteredData.length,
      paid: filteredData.filter((p) => p.paymentStatus === "paid").length,
      unpaid: filteredData.filter((p) => p.paymentStatus === "unpaid").length,
      partial: filteredData.filter((p) => p.paymentStatus === "partial").length,
      overdue: filteredData.filter((p) => p.isOverdue).length,
      totalPending: filteredData.reduce((sum, p) => sum + Math.max(0, p.remainingAmount || 0), 0),
    };

    // Get all IDs for "select all" functionality
    const allIds = filteredData.map((item) => item._id);

    // Apply pagination
    const totalCount = filteredData.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedData = filteredData.slice(startIndex, startIndex + limitNum);

    res.status(200).json({
      success: true,
      count: paginatedData.length,
      data: paginatedData,
      stats,
      allIds,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        limit: limitNum,
        hasNextPage: pageNum < Math.ceil(totalCount / limitNum),
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching pending payments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending payments",
      error: error.message,
    });
  }
};

export const downloadPendingPaymentsExcel = async (req, res) => {
  try {
    const { search, batch, academicYear, paymentStatus } = req.query;

    const query = {};
    if (academicYear) {
      query.academicYear = academicYear;
    }

    const feeStructures = await FeeStructure.find(query);
    const feeStructureIds = feeStructures.map((fs) => fs._id);
    const batchIds = feeStructures.map((fs) => fs.batch.id);

    let studentQuery = {
      "academicDetails.batch.id": { $in: batchIds },
    };

    if (batch) {
      const matchingStructures = feeStructures.filter(
        (fs) => fs.batch.name === batch,
      );
      if (matchingStructures.length > 0) {
        const matchingBatchIds = matchingStructures.map((fs) => fs.batch.id);
        studentQuery["academicDetails.batch.id"] = { $in: matchingBatchIds };
      }
    }

    const students = await Student.find(studentQuery).select(
      "studentDetails academicDetails studentId email phone loginStudentId",
    );

    const pendingPaymentsList = await Promise.all(
      students.map(async (student) => {
        const feeStructure = feeStructures.find(
          (fs) =>
            fs.batch.id.toString() ===
            student.academicDetails.batch.id.toString(),
        );

        if (!feeStructure) return null;

        // Get student_fee payments (exclude reversed payments)
        const studentFeePayments = await paymentModel.find({
          studentId: student._id,
          feeStructureId: feeStructure._id,
          paymentType: "student_fee",
          isReversed: { $ne: true },
        });

        // Get application fee payments (for FY students)
        let applicationFeeAmount = 0;
        // Direct lookup: for bulk-admitted students Student._id = Application._id
        let applicationPayments = await paymentModel.find({
          applicationId: student._id,
          paymentType: "application",
          isReversed: { $ne: true },
        });
        // Fallback: loginStudentId -> Application -> Payment
        if (applicationPayments.length === 0 && student.loginStudentId && mongoose.Types.ObjectId.isValid(student.loginStudentId)) {
          const application = await applicationModel.findOne({
            loginStudentId: student.loginStudentId,
          });
          if (application) {
            applicationPayments = await paymentModel.find({
              applicationId: application._id,
              paymentType: "application",
              isReversed: { $ne: true },
            });
          }
        }
        applicationPayments.forEach((ap) => {
          if (ap.payload?.amount) {
            applicationFeeAmount += ap.payload.amount / 100;
          }
        });

        // Calculate total paid
        const studentFeePaid = studentFeePayments.reduce((sum, payment) => {
          return (
            sum + (payment.payload?.amount ? payment.payload.amount / 100 : 0)
          );
        }, 0);
        
        const totalPaid = studentFeePaid + applicationFeeAmount;

        const remainingAmount = Math.max(0, feeStructure.totalAmount - totalPaid);
        const status =
          remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "unpaid";

        const lastPaymentDate =
          studentFeePayments.length > 0
            ? new Date(Math.max(...studentFeePayments.map((p) => new Date(p.createdAt))))
            : null;

        const installments = feeStructure.paymentStructure?.installments || [];
        const sortedInstallments = [...installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
        let cumulativeAmount = 0;
        const nextDueInstallment = status !== "paid"
          ? sortedInstallments.find((inst) => {
              cumulativeAmount += inst.amount;
              return totalPaid < cumulativeAmount;
            })
          : null;

        const isOverdue = nextDueInstallment
          ? new Date(nextDueInstallment.dueDate) < new Date()
          : false;

        return {
          studentName: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
          studentId: student.studentId,
          email: student.email || student.studentDetails.email,
          phone: student.phone || student.studentDetails.phone,
          batch: student.academicDetails.batch.name,
          program: student.academicDetails.program,
          academicYear: feeStructure.academicYear,
          totalAmount: feeStructure.totalAmount,
          paidAmount: totalPaid,
          remainingAmount: remainingAmount,
          paymentStatus: status.toUpperCase(),
          lastPaymentDate: lastPaymentDate
            ? lastPaymentDate.toLocaleDateString()
            : "N/A",
          nextDueDate: nextDueInstallment
            ? new Date(nextDueInstallment.dueDate).toLocaleDateString()
            : "N/A",
          isOverdue: isOverdue ? "YES" : "NO",
        };
      }),
    );

    let filteredData = pendingPaymentsList.filter((item) => item !== null);

    if (paymentStatus && paymentStatus !== "all") {
      filteredData = filteredData.filter(
        (item) => item.paymentStatus === paymentStatus.toUpperCase(),
      );
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredData = filteredData.filter(
        (item) =>
          item.studentName?.toLowerCase().includes(searchLower) ||
          item.studentId?.toLowerCase().includes(searchLower) ||
          item.email?.toLowerCase().includes(searchLower),
      );
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Pending Payments");

    worksheet.columns = [
      { header: "Student Name", key: "studentName", width: 25 },
      { header: "Student ID", key: "studentId", width: 15 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Batch", key: "batch", width: 15 },
      { header: "Program", key: "program", width: 20 },
      { header: "Academic Year", key: "academicYear", width: 15 },
      { header: "Total Fee", key: "totalAmount", width: 12 },
      { header: "Paid Amount", key: "paidAmount", width: 12 },
      { header: "Remaining", key: "remainingAmount", width: 12 },
      { header: "Status", key: "paymentStatus", width: 12 },
      { header: "Last Payment Date", key: "lastPaymentDate", width: 18 },
      { header: "Next Due Date", key: "nextDueDate", width: 18 },
      { header: "Overdue", key: "isOverdue", width: 10 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    filteredData.forEach((data) => {
      const row = worksheet.addRow(data);

      if (data.isOverdue === "YES") {
        row.getCell("isOverdue").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF0000" },
        };
        row.getCell("isOverdue").font = {
          color: { argb: "FFFFFFFF" },
          bold: true,
        };
      }

      if (data.paymentStatus === "UNPAID") {
        row.getCell("paymentStatus").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFCCCC" },
        };
      } else if (data.paymentStatus === "PARTIAL") {
        row.getCell("paymentStatus").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFFCC" },
        };
      }
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=pending_payments_${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error downloading pending payments:", err);
    res.status(500).json({ error: "Failed to download pending payments" });
  }
};

/**
 * Record a manual/offline payment for a student
 * Creates payment record and generates receipt
 */
export const recordManualPayment = async (req, res) => {
  try {
    const {
      studentId,
      feeStructureId,
      academicYear,
      amount,
      paymentMode,
      referenceNumber,
      paymentDate,
      remarks,
      installmentNumber,
      isFullPayment,
    } = req.body;

    if (!studentId || !feeStructureId || !academicYear || !amount || !paymentMode) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: studentId, feeStructureId, academicYear, amount, paymentMode",
      });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const feeStructure = await FeeStructure.findById(feeStructureId);
    if (!feeStructure) {
      return res.status(404).json({ success: false, message: "Fee structure not found" });
    }

    const manualPaymentId = `MANUAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const manualOrderId = `ORDER_MANUAL_${Date.now()}`;

    const payment = new paymentModel({
      payload: {
        amount: amount * 100,
        currency: "INR",
        notes: {
          studentId: studentId,
          feeStructureId: feeStructureId,
          academicYear: academicYear,
          paymentMode: paymentMode,
          isManualPayment: true,
        },
      },
      paymentId: manualPaymentId,
      orderId: manualOrderId,
      signature: "MANUAL_PAYMENT",
      studentId: studentId,
      feeStructureId: feeStructureId,
      academicYear: academicYear,
      paymentType: "student_fee",
      installmentNumber: installmentNumber || null,
      isFullPayment: isFullPayment || false,
      isManualPayment: true,
      manualPaymentDetails: {
        paymentMode: paymentMode,
        referenceNumber: referenceNumber || null,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        remarks: remarks || null,
        recordedBy: req.user?.userId || req.user?.id,
        recordedAt: new Date(),
      },
    });

    await payment.save();

    const receipt = await createUnifiedReceipt(payment._id, "student_fee", {
      paymentDetails: {
        paymentDate: payment.manualPaymentDetails.paymentDate,
        paymentMode: getPaymentModeLabel(paymentMode),
        transactionId: referenceNumber || manualPaymentId,
        orderId: manualOrderId,
      },
      remarks: `Manual payment recorded. ${remarks || ""}`.trim(),
    });

    res.status(201).json({
      success: true,
      message: "Manual payment recorded successfully",
      payment: {
        _id: payment._id,
        paymentId: payment.paymentId,
        amount: amount,
        paymentMode: paymentMode,
        paymentDate: payment.manualPaymentDetails.paymentDate,
      },
      receipt: {
        _id: receipt._id,
        receiptNumber: receipt.receiptNumber,
      },
    });
  } catch (error) {
    console.error("Error recording manual payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record manual payment",
      error: error.message,
    });
  }
};

/**
 * Reverse a manual payment (only manual payments can be reversed)
 */
export const reverseManualPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Reason is required for reversing a payment",
      });
    }

    const payment = await paymentModel.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    if (!payment.isManualPayment) {
      return res.status(400).json({
        success: false,
        message: "Only manual payments can be reversed. Online payments must be refunded through the payment gateway.",
      });
    }

    if (payment.isReversed) {
      return res.status(400).json({
        success: false,
        message: "This payment has already been reversed",
      });
    }

    payment.isReversed = true;
    payment.reversalDetails = {
      reversedBy: req.user?.userId || req.user?.id,
      reversedAt: new Date(),
      reason: reason,
    };
    await payment.save();

    const receipt = await UnifiedReceipt.findOne({ payment: paymentId });
    if (receipt) {
      receipt.receiptStatus = "reversed";
      receipt.remarks = `${receipt.remarks || ""} | REVERSED: ${reason}`.trim();
      await receipt.save();
    }

    res.status(200).json({
      success: true,
      message: "Payment reversed successfully",
      payment: {
        _id: payment._id,
        paymentId: payment.paymentId,
        isReversed: payment.isReversed,
        reversalDetails: payment.reversalDetails,
      },
    });
  } catch (error) {
    console.error("Error reversing payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reverse payment",
      error: error.message,
    });
  }
};

/**
 * Get student fee details for manual payment form
 */
export const getStudentFeeDetails = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear } = req.query;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const batchId = student.academicDetails?.batch?.id;
    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: "Student is not assigned to a batch",
      });
    }

    const query = { "batch.id": batchId, isActive: true };
    if (academicYear) {
      query.academicYear = academicYear;
    }

    const feeStructures = await FeeStructure.find(query).sort({ academicYear: -1 });

    // Get application fee payments (for FY students)
    let applicationFeeAmount = 0;
    let applicationFeeDate = null;
    // Direct lookup: for bulk-admitted students Student._id = Application._id
    let applicationPayments = await paymentModel.find({
      applicationId: student._id,
      paymentType: "application",
      isReversed: { $ne: true },
    });
    // Fallback: loginStudentId -> Application -> Payment
    if (applicationPayments.length === 0 && student.loginStudentId && mongoose.Types.ObjectId.isValid(student.loginStudentId)) {
      const application = await applicationModel.findOne({
        loginStudentId: student.loginStudentId,
      });
      if (application) {
        applicationPayments = await paymentModel.find({
          applicationId: application._id,
          paymentType: "application",
          isReversed: { $ne: true },
        });
      }
    }
    applicationPayments.forEach((ap) => {
      if (ap.payload?.amount) {
        applicationFeeAmount += ap.payload.amount / 100;
      }
      if (!applicationFeeDate || new Date(ap.createdAt) > new Date(applicationFeeDate)) {
        applicationFeeDate = ap.createdAt;
      }
    });

    const feeDetailsWithPayments = await Promise.all(
      feeStructures.map(async (fs, index) => {
        // Query payments for this student and fee structure
        const payments = await paymentModel.find({
          studentId: student._id,
          feeStructureId: fs._id,
          paymentType: "student_fee",
          isReversed: { $ne: true },
        });

        // Also check for payments without feeStructureId (older payments)
        const paymentsWithoutFeeStructure = await paymentModel.find({
          studentId: student._id,
          feeStructureId: { $exists: false },
          paymentType: "student_fee",
          isReversed: { $ne: true },
        });

        // Also check payments by academicYear if feeStructureId doesn't match
        const paymentsByAcademicYear = await paymentModel.find({
          studentId: student._id,
          academicYear: fs.academicYear,
          paymentType: "student_fee",
          isReversed: { $ne: true },
        });

        // Combine all unique payments
        const allPaymentIds = new Set();
        const allPayments = [];
        
        [...payments, ...paymentsWithoutFeeStructure, ...paymentsByAcademicYear].forEach(p => {
          if (!allPaymentIds.has(p._id.toString())) {
            allPaymentIds.add(p._id.toString());
            allPayments.push(p);
          }
        });

        const studentFeePaid = allPayments.reduce((sum, p) => {
          const amount = p.payload?.amount ? p.payload.amount / 100 : 0;
          return sum + amount;
        }, 0);

        // Only add application fee to the first/current fee structure (FY students)
        const appFeeForThisStructure = index === 0 ? applicationFeeAmount : 0;
        const totalPaid = studentFeePaid + appFeeForThisStructure;
        const remainingAmount = Math.max(0, fs.totalAmount - totalPaid);

        const paymentsList = allPayments.map((p) => ({
          _id: p._id,
          paymentId: p.paymentId,
          amount: p.payload?.amount ? p.payload.amount / 100 : 0,
          date: p.createdAt,
          isManualPayment: p.isManualPayment,
          paymentMode: p.isManualPayment
            ? p.manualPaymentDetails?.paymentMode
            : "online",
          installmentNumber: p.installmentNumber,
        }));

        // Add application fee as a payment entry if applicable
        if (appFeeForThisStructure > 0) {
          paymentsList.unshift({
            _id: "application_fee",
            paymentId: "Application Fee",
            amount: appFeeForThisStructure,
            date: applicationFeeDate || student.createdAt,
            isManualPayment: false,
            paymentMode: "online",
            installmentNumber: null,
            isApplicationFee: true,
          });
        }

        return {
          feeStructure: {
            _id: fs._id,
            academicYear: fs.academicYear,
            totalAmount: fs.totalAmount,
            fees: fs.fees,
            paymentStructure: fs.paymentStructure,
          },
          payments: paymentsList,
          totalPaid,
          remainingAmount,
          paymentStatus:
            remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "unpaid",
        };
      })
    );

    res.status(200).json({
      success: true,
      student: {
        _id: student._id,
        name: `${student.studentDetails.firstName} ${student.studentDetails.middleName || ""} ${student.studentDetails.lastName}`.trim(),
        email: student.studentDetails.emailAddress,
        rollNumber: student.academicDetails.rollNumber,
        batch: student.academicDetails.batch?.name,
        program: student.academicDetails.program,
      },
      feeDetails: feeDetailsWithPayments,
    });
  } catch (error) {
    console.error("Error fetching student fee details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch student fee details",
      error: error.message,
    });
  }
};

/**
 * Get all manual payments with filters
 */
export const getManualPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, academicYear, batch, includeReversed } =
      req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let matchQuery = {
      isManualPayment: true,
    };

    if (includeReversed !== "true") {
      matchQuery.isReversed = { $ne: true };
    }

    if (academicYear) {
      matchQuery.academicYear = academicYear;
    }

    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
    ];

    if (batch) {
      pipeline.push({
        $match: { "student.academicDetails.batch.name": batch },
      });
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      pipeline.push({
        $match: {
          $or: [
            { "student.studentDetails.firstName": searchRegex },
            { "student.studentDetails.lastName": searchRegex },
            { "student.academicDetails.rollNumber": searchRegex },
            { paymentId: searchRegex },
            { "manualPaymentDetails.referenceNumber": searchRegex },
          ],
        },
      });
    }

    pipeline.push({ $sort: { createdAt: -1 } });

    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await paymentModel.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

    pipeline.push({
      $lookup: {
        from: "unifiedreceipts",
        localField: "_id",
        foreignField: "payment",
        as: "receipt",
      },
    });
    pipeline.push({ $unwind: { path: "$receipt", preserveNullAndEmptyArrays: true } });

    pipeline.push({
      $project: {
        _id: 1,
        paymentId: 1,
        amount: { $divide: ["$payload.amount", 100] },
        academicYear: 1,
        isManualPayment: 1,
        isReversed: 1,
        manualPaymentDetails: 1,
        reversalDetails: 1,
        createdAt: 1,
        studentName: {
          $concat: [
            "$student.studentDetails.firstName",
            " ",
            { $ifNull: ["$student.studentDetails.middleName", ""] },
            " ",
            "$student.studentDetails.lastName",
          ],
        },
        rollNumber: "$student.academicDetails.rollNumber",
        batch: "$student.academicDetails.batch.name",
        receiptNumber: "$receipt.receiptNumber",
        receiptId: "$receipt._id",
      },
    });

    const payments = await paymentModel.aggregate(pipeline);

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalCount: total,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching manual payments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch manual payments",
      error: error.message,
    });
  }
};

const getPaymentModeLabel = (mode) => {
  const labels = {
    cash: "Cash",
    cheque: "Cheque",
    bank_transfer: "Bank Transfer",
    dd: "Demand Draft",
    upi: "UPI",
    other: "Other",
  };
  return labels[mode] || mode;
};
