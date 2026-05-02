import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import UnifiedReceipt from "../models/unifiedReceiptModel.js";
import paymentModel from "../models/paymentModel.js";
import Student from "../models/studentModel.js";
import FeeStructure from "../models/feeStructureModel.js";
import applicationModel from "../models/applicationModel.js";
import ATKTForm from "../models/atktFormModel.js";
import User from "../models/userModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MONGODB_URI = process.env.MONGO_DB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGO_DB_URI not found in .env file");
  process.exit(1);
}

const generateReceiptNumber = async (receiptType, sequenceStart = 1) => {
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

  let sequence = sequenceStart;
  if (lastReceipt) {
    const lastSequence = parseInt(lastReceipt.receiptNumber.slice(-4));
    sequence = Math.max(lastSequence + 1, sequenceStart);
  }

  return `${prefix}${year}${month}${String(sequence).padStart(4, "0")}`;
};

const finalReceiptMigration = async () => {
  try {
    console.log("🚀 FINAL UNIFIED RECEIPT MIGRATION");
    console.log("=".repeat(70));
    console.log(
      "This script will generate receipts for ALL payments with valid amounts",
    );
    console.log("Skipping only payments with ₹0 amount");
    console.log("=".repeat(70) + "\n");

    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Clear existing unified receipts for fresh start
    const deleteResult = await UnifiedReceipt.deleteMany({});
    console.log(
      `🗑️  Cleared ${deleteResult.deletedCount} existing unified receipts\n`,
    );

    // Get all payments
    const allPayments = await paymentModel.find({}).sort({ createdAt: 1 });
    console.log(`📊 Total payments found: ${allPayments.length}\n`);

    let stats = {
      total: 0,
      created: 0,
      skipped: 0,
      errors: 0,
      byType: {
        student_fee: { total: 0, created: 0, skipped: 0, errors: 0 },
        application: { total: 0, created: 0, skipped: 0, errors: 0 },
        atkt: { total: 0, created: 0, skipped: 0, errors: 0 },
      },
    };

    // Process all payments
    for (let i = 0; i < allPayments.length; i++) {
      const payment = allPayments[i];
      const paymentType = payment.paymentType;

      stats.total++;
      stats.byType[paymentType].total++;

      try {
        // Calculate amount from payload
        const amountPaid = payment.payload?.amount
          ? payment.payload.amount / 100
          : 0;

        // Skip zero amount payments
        if (amountPaid === 0) {
          stats.skipped++;
          stats.byType[paymentType].skipped++;
          continue;
        }

        let receiptData = null;

        // ==================== STUDENT FEE RECEIPTS ====================
        if (paymentType === "student_fee") {
          const student = await Student.findById(payment.studentId);
          const feeStructure = await FeeStructure.findById(
            payment.feeStructureId,
          );

          const receiptNumber = await generateReceiptNumber(
            "student_fee",
            1000,
          );

          if (student && feeStructure) {
            // Full data available
            const allPayments = await paymentModel.find({
              studentId: student._id,
              feeStructureId: feeStructure._id,
              academicYear: payment.academicYear,
              paymentType: "student_fee",
              createdAt: { $lte: payment.createdAt },
            });

            const totalPaidSoFar = allPayments.reduce((sum, p) => {
              return sum + (p.payload?.amount ? p.payload.amount / 100 : 0);
            }, 0);

            const remainingBalance = feeStructure.totalAmount - totalPaidSoFar;

            receiptData = {
              receiptNumber,
              receiptType: "student_fee",
              payment: payment._id,
              student: student._id,
              feeStructureId: feeStructure._id,
              academicYear: payment.academicYear,
              studentDetails: {
                name: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
                id: student.studentId,
                idLabel: "Student ID",
                email: student.studentDetails?.email || student.email || "",
                mobile: student.studentDetails?.mobile || student.phone || "",
                program: student.academicDetails.program,
                batch: student.academicDetails.batch?.name,
                rollNumber: student.academicDetails.rollNumber,
              },
              paymentDetails: {
                paymentDate: payment.createdAt,
                paymentMode: "Online",
                transactionId: payment.paymentId,
                orderId: payment.orderId,
                razorpayPaymentId: payment.paymentId,
                academicYear: payment.academicYear,
              },
              feeBreakdown: {
                tuitionFee: feeStructure.fees?.tuitionFee || 0,
                developmentFee: feeStructure.fees?.developmentFee || 0,
                latePaymentPenalty: payment.payload?.notes?.latePaymentPenalty
                  ? parseFloat(payment.payload.notes.latePaymentPenalty)
                  : 0,
              },
              paymentSummary: {
                totalFeeAmount: feeStructure.totalAmount,
                amountPaid: amountPaid,
                remainingBalance: Math.max(0, remainingBalance),
                installmentNumber: payment.installmentNumber,
                isFullPayment: payment.isFullPayment || false,
              },
              institutionDetails: {
                name: "AGNEL SCHOOL OF LAW",
                address: "Sector 9A, Vashi, Navi Mumbai, Maharashtra 400703",
                phone: "02227771000",
                email: "asl.office2023@gmail.com",
                website: "www.agnelschooloflaw.com",
              },
              receiptStatus: "generated",
              downloadCount: 0,
              createdAt: payment.createdAt,
              updatedAt: payment.updatedAt,
            };
          } else {
            // Fallback: Use payload data
            receiptData = {
              receiptNumber,
              receiptType: "student_fee",
              payment: payment._id,
              academicYear:
                payment.academicYear ||
                payment.payload?.notes?.academicYear ||
                "Unknown",
              studentDetails: {
                name: payment.payload?.notes?.studentName || "Unknown Student",
                id:
                  payment.payload?.notes?.studentId ||
                  payment.studentId?.toString() ||
                  "Unknown",
                idLabel: "Student ID",
                email: payment.payload?.email || "",
                mobile: payment.payload?.contact || "",
                program: "Unknown Program",
                batch: "Unknown Batch",
                rollNumber: "N/A",
              },
              paymentDetails: {
                paymentDate: payment.createdAt,
                paymentMode: "Online",
                transactionId: payment.paymentId,
                orderId: payment.orderId,
                razorpayPaymentId: payment.paymentId,
                academicYear:
                  payment.academicYear || payment.payload?.notes?.academicYear,
              },
              feeBreakdown: {
                tuitionFee: amountPaid,
              },
              paymentSummary: {
                totalFeeAmount: amountPaid,
                amountPaid: amountPaid,
                remainingBalance: 0,
                installmentNumber: payment.installmentNumber,
                isFullPayment: payment.isFullPayment || false,
              },
              institutionDetails: {
                name: "AGNEL SCHOOL OF LAW",
                address: "Sector 9A, Vashi, Navi Mumbai, Maharashtra 400703",
                phone: "02227771000",
                email: "asl.office2023@gmail.com",
                website: "www.agnelschooloflaw.com",
              },
              receiptStatus: "generated",
              downloadCount: 0,
              remarks:
                "Generated from payment payload - Original student record not found",
              createdAt: payment.createdAt,
              updatedAt: payment.updatedAt,
            };
          }
        }

        // ==================== APPLICATION RECEIPTS ====================
        else if (paymentType === "application") {
          const application = await applicationModel.findById(
            payment.applicationId,
          );
          const receiptNumber = await generateReceiptNumber(
            "application",
            1000,
          );

          if (application) {
            // Full data available
            receiptData = {
              receiptNumber,
              receiptType: "application",
              payment: payment._id,
              applicationId: application._id,
              user: payment.userId,
              studentDetails: {
                name: `${application.studentDetails.firstName} ${application.studentDetails.lastName}`,
                id: application.applicationNumber,
                idLabel: "Application Number",
                email: application.studentDetails.email,
                mobile: application.studentDetails.mobile,
                program: application.course,
              },
              paymentDetails: {
                paymentDate: payment.createdAt,
                paymentMode: "Online",
                transactionId: payment.paymentId,
                orderId: payment.orderId,
                razorpayPaymentId: payment.paymentId,
              },
              feeBreakdown: {
                applicationFee: amountPaid,
              },
              paymentSummary: {
                totalFeeAmount: amountPaid,
                amountPaid: amountPaid,
                isFullPayment: payment.isFullPayment !== false,
                installmentNumber: payment.installmentNumber,
              },
              institutionDetails: {
                name: "AGNEL SCHOOL OF LAW",
                address: "Sector 9A, Vashi, Navi Mumbai, Maharashtra 400703",
                phone: "02227771000",
                email: "asl.office2023@gmail.com",
                website: "www.agnelschooloflaw.com",
              },
              receiptStatus: "generated",
              downloadCount: 0,
              createdAt: payment.createdAt,
              updatedAt: payment.updatedAt,
            };
          } else {
            // Fallback: Use payload data with multiple fallback sources for name
            // Try to get user details as additional fallback
            let userDetails = null;
            if (payment.userId) {
              userDetails = await User.findById(payment.userId);
            }

            const applicantName =
              payment.payload?.notes?.studentName ||
              payment.payload?.notes?.applicantName ||
              payment.payload?.notes?.name ||
              (payment.payload?.notes?.firstName && payment.payload?.notes?.lastName
                ? `${payment.payload.notes.firstName} ${payment.payload.notes.lastName}`
                : null) ||
              payment.payload?.notes?.firstName ||
              (userDetails
                ? `${userDetails.firstName} ${userDetails.lastName}`
                : null) ||
              payment.payload?.description?.match(/for\s+([A-Za-z\s]+)/i)?.[1]?.trim() ||
              "Unknown Applicant";

            const applicantEmail =
              payment.payload?.email ||
              payment.payload?.notes?.email ||
              userDetails?.email ||
              "";

            const applicantMobile =
              payment.payload?.contact ||
              payment.payload?.notes?.mobile ||
              payment.payload?.notes?.phone ||
              userDetails?.mobile ||
              "";

            receiptData = {
              receiptNumber,
              receiptType: "application",
              payment: payment._id,
              user: payment.userId,
              studentDetails: {
                name: applicantName,
                id:
                  payment.payload?.notes?.applicationNumber ||
                  payment.payload?.notes?.appNumber ||
                  payment.applicationId?.toString() ||
                  "Unknown",
                idLabel: "Application Number",
                email: applicantEmail,
                mobile: applicantMobile,
                program: payment.payload?.notes?.course || payment.payload?.notes?.program || "Unknown Program",
              },
              paymentDetails: {
                paymentDate: payment.createdAt,
                paymentMode: "Online",
                transactionId: payment.paymentId,
                orderId: payment.orderId,
                razorpayPaymentId: payment.paymentId,
              },
              feeBreakdown: {
                applicationFee: amountPaid,
              },
              paymentSummary: {
                totalFeeAmount: amountPaid,
                amountPaid: amountPaid,
                isFullPayment: payment.isFullPayment !== false,
                installmentNumber: payment.installmentNumber,
              },
              institutionDetails: {
                name: "AGNEL SCHOOL OF LAW",
                address: "Sector 9A, Vashi, Navi Mumbai, Maharashtra 400703",
                phone: "02227771000",
                email: "asl.office2023@gmail.com",
                website: "www.agnelschooloflaw.com",
              },
              receiptStatus: "generated",
              downloadCount: 0,
              remarks:
                "Generated from payment payload - Original application record not found",
              createdAt: payment.createdAt,
              updatedAt: payment.updatedAt,
            };
          }
        }

        // ==================== ATKT RECEIPTS ====================
        else if (paymentType === "atkt") {
          const atktForm = await ATKTForm.findById(payment.atktFormId);
          const receiptNumber = await generateReceiptNumber("atkt", 1000);

          if (atktForm) {
            // Full data available
            receiptData = {
              receiptNumber,
              receiptType: "atkt",
              payment: payment._id,
              atktFormId: atktForm._id,
              studentDetails: {
                name: atktForm.studentName,
                id: atktForm.rollNumber,
                idLabel: "Roll Number",
                mobile: atktForm.contactNumber,
                course: atktForm.course,
                batch: atktForm.batch,
                pattern: atktForm.pattern,
                rollNumber: atktForm.rollNumber,
              },
              paymentDetails: {
                paymentDate: payment.createdAt,
                paymentMode: "Online",
                transactionId: payment.paymentId,
                orderId: payment.orderId,
                razorpayPaymentId: payment.paymentId,
              },
              feeBreakdown: {
                examinationFee: amountPaid,
              },
              subjects:
                atktForm.subjects
                  ?.filter((s) => s.type !== "section")
                  .map((s) => ({
                    id: s.id,
                    label: s.label,
                    name: s.label,
                    code: s.code || s.id,
                  })) || [],
              paymentSummary: {
                totalFeeAmount: amountPaid,
                amountPaid: amountPaid,
              },
              institutionDetails: {
                name: "AGNEL SCHOOL OF LAW",
                address: "Sector 9A, Vashi, Navi Mumbai, Maharashtra 400703",
                phone: "02227771000",
                email: "asl.office2023@gmail.com",
                website: "www.agnelschooloflaw.com",
              },
              receiptStatus: "generated",
              downloadCount: 0,
              createdAt: payment.createdAt,
              updatedAt: payment.updatedAt,
            };
          } else {
            // Fallback: Use payload data
            receiptData = {
              receiptNumber,
              receiptType: "atkt",
              payment: payment._id,
              studentDetails: {
                name: payment.payload?.notes?.studentName || "Unknown Student",
                id: payment.payload?.notes?.rollNumber || "Unknown",
                idLabel: "Roll Number",
                mobile: payment.payload?.contact || "",
                course: "Unknown Course",
                batch: "Unknown Batch",
                rollNumber: payment.payload?.notes?.rollNumber || "N/A",
              },
              paymentDetails: {
                paymentDate: payment.createdAt,
                paymentMode: "Online",
                transactionId: payment.paymentId,
                orderId: payment.orderId,
                razorpayPaymentId: payment.paymentId,
              },
              feeBreakdown: {
                examinationFee: amountPaid,
              },
              subjects: [],
              paymentSummary: {
                totalFeeAmount: amountPaid,
                amountPaid: amountPaid,
              },
              institutionDetails: {
                name: "AGNEL SCHOOL OF LAW",
                address: "Sector 9A, Vashi, Navi Mumbai, Maharashtra 400703",
                phone: "02227771000",
                email: "asl.office2023@gmail.com",
                website: "www.agnelschooloflaw.com",
              },
              receiptStatus: "generated",
              downloadCount: 0,
              remarks:
                "Generated from payment payload - Original ATKT form not found",
              createdAt: payment.createdAt,
              updatedAt: payment.updatedAt,
            };
          }
        }

        // Create the receipt
        if (receiptData) {
          await UnifiedReceipt.create(receiptData);
          stats.created++;
          stats.byType[paymentType].created++;

          if ((i + 1) % 100 === 0) {
            console.log(
              `⏳ Progress: ${i + 1}/${allPayments.length} payments processed...`,
            );
          }
        }
      } catch (error) {
        stats.errors++;
        stats.byType[paymentType].errors++;
        console.error(
          `❌ Error processing payment ${payment.paymentId}:`,
          error.message,
        );
      }
    }

    // ==================== FINAL REPORT ====================
    console.log("\n" + "=".repeat(70));
    console.log("🎉 FINAL MIGRATION COMPLETE");
    console.log("=".repeat(70));
    console.log(`\n📊 Overall Statistics:`);
    console.log(`   Total Payments Processed: ${stats.total}`);
    console.log(`   ✅ Receipts Created: ${stats.created}`);
    console.log(`   ⏭️  Skipped (₹0 amount): ${stats.skipped}`);
    console.log(`   ❌ Errors: ${stats.errors}`);

    console.log(`\n📚 Student Fee Receipts:`);
    console.log(`   Total: ${stats.byType.student_fee.total}`);
    console.log(`   ✅ Created: ${stats.byType.student_fee.created}`);
    console.log(`   ⏭️  Skipped: ${stats.byType.student_fee.skipped}`);
    console.log(`   ❌ Errors: ${stats.byType.student_fee.errors}`);

    console.log(`\n📝 Application Fee Receipts:`);
    console.log(`   Total: ${stats.byType.application.total}`);
    console.log(`   ✅ Created: ${stats.byType.application.created}`);
    console.log(`   ⏭️  Skipped: ${stats.byType.application.skipped}`);
    console.log(`   ❌ Errors: ${stats.byType.application.errors}`);

    console.log(`\n📋 ATKT Fee Receipts:`);
    console.log(`   Total: ${stats.byType.atkt.total}`);
    console.log(`   ✅ Created: ${stats.byType.atkt.created}`);
    console.log(`   ⏭️  Skipped: ${stats.byType.atkt.skipped}`);
    console.log(`   ❌ Errors: ${stats.byType.atkt.errors}`);

    // Final verification
    const finalCounts = {
      total: await UnifiedReceipt.countDocuments({}),
      studentFee: await UnifiedReceipt.countDocuments({
        receiptType: "student_fee",
      }),
      application: await UnifiedReceipt.countDocuments({
        receiptType: "application",
      }),
      atkt: await UnifiedReceipt.countDocuments({ receiptType: "atkt" }),
    };

    console.log(`\n✅ Database Verification:`);
    console.log(`   Total Receipts in DB: ${finalCounts.total}`);
    console.log(`   Student Fee: ${finalCounts.studentFee}`);
    console.log(`   Application: ${finalCounts.application}`);
    console.log(`   ATKT: ${finalCounts.atkt}`);

    const coveragePercent = (
      (finalCounts.total / (stats.total - stats.skipped)) *
      100
    ).toFixed(2);
    console.log(
      `\n   Coverage: ${finalCounts.total}/${stats.total - stats.skipped} valid payments (${coveragePercent}%)`,
    );

    if (stats.errors === 0 && coveragePercent === "100.00") {
      console.log("\n🎉 PERFECT! All valid payments have receipts!");
    } else if (stats.errors === 0) {
      console.log("\n✅ SUCCESS! All valid payments have receipts!");
    } else {
      console.log("\n⚠️  Completed with some errors - review above");
    }

    console.log("\n" + "=".repeat(70));
    console.log("✅ Migration Complete - System Ready for Production!");
    console.log("=".repeat(70) + "\n");

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB\n");
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the final migration
finalReceiptMigration();
