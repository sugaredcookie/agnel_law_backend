import Razorpay from "razorpay";
import dotenv from "dotenv";
import User from "../models/userModel.js";
import FeeStructure from "../models/feeStructureModel.js";
import paymentModel from "../models/paymentModel.js";
import applicationModel from "../models/applicationModel.js";
import programModel from "../models/programModel.js";
import InstallmentSettings from "../models/installmentSettingsModel.js";
import { createUnifiedReceipt } from "./ReceiptController.js";
import crypto from "crypto";
import axios from "axios";
import studentModel from "../models/studentModel.js";
import mongoose from "mongoose";
import ATKTForm from "../models/atktFormModel.js";
import RevalApplication from "../models/revalApplicationModel.js";
import userModel from "../models/userModel.js";
import { transporter, paymentConfirmationEmail } from "../NodeMailer.js";
import PAYMENT_TYPES from "../config/paymentTypes.js";
dotenv.config();

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY || "rzp_test_1DP5mmOlF5G5ag",
  key_secret: process.env.RAZORPAY_SECRET,
});

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

export const getPaymentTypes = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: PAYMENT_TYPES });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createCheckoutRazorpay = async (req, res) => {
  const { applicationNumber, installmentNumber, isFullPayment } = req.body;

  try {
    const application = await applicationModel.findById(applicationNumber);
    if (!application) {
      return res.status(404).json({ message: "Application not found." });
    }

    const program = await programModel.findOne({
      programName: application.course,
    });
    if (!program || typeof program.applicationFee !== "number") {
      return res
        .status(400)
        .json({ message: "Application fee not set for this course." });
    }

    const totalFee = program.applicationFee + (program.developmentFee || 0);

    let amount;
    if (isFullPayment) {
      amount = totalFee;
    } else {
      const installmentSettings =
        await InstallmentSettings.getSettingsForProgram(program._id);

      if (
        !installmentSettings ||
        !installmentSettings.isEnabled ||
        !installmentSettings.applicableToApplicationFees
      ) {
        return res.status(400).json({
          message: "Installment payments are not available for this course.",
        });
      }

      const defaultPlan =
        installmentSettings.installmentPlans.find((plan) => plan.isDefault) ||
        installmentSettings.installmentPlans[0];

      if (!defaultPlan) {
        return res.status(400).json({
          message: "No installment plans configured for this course.",
        });
      }

      const installmentBreakdown = defaultPlan.breakdown.find(
        (breakdown) => breakdown.installmentNumber === installmentNumber,
      );

      if (!installmentBreakdown) {
        return res.status(400).json({
          message: `Invalid installment number. Available installments: ${defaultPlan.breakdown.map((b) => b.installmentNumber).join(", ")}`,
        });
      }

      amount = Math.round(
        (totalFee * installmentBreakdown.percentage) / 100,
      );
    }

    const receiptId = `APP_${application._id}_${Date.now()
      .toString()
      .slice(-8)}`;

    const studentName = `${application.studentDetails.firstName} ${application.studentDetails.lastName}`;

    var options = {
      amount: amount * 100,
      currency: req.body?.currency || "INR",
      receipt: receiptId,
      notes: {
        paymentType: "application",
        applicationId: application._id.toString(),
        installmentNumber: installmentNumber?.toString() || null,
        isFullPayment: isFullPayment.toString(),
        studentName: studentName,
      },
    };

    const order = await instance.orders.create(options);
    res.status(200).json(order);
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({
      message: "Failed to create Razorpay order.",
      error: error.message,
    });
  }
};

export const getRazorPayKey = async (req, res) => {
  const loginStudentId = req.user.userId;

  const userDetails = await User.findOne({ _id: loginStudentId });

  if (!userDetails) {
    return res.status(404).json({ message: "User not found" });
  }
  res
    .status(200)
    .json({ key: process.env.RAZORPAY_KEY, userDetails: userDetails });
};

export const getRazorPayACCKeyStudent = async (req, res) => {
  const loginStudentId = req.user.studentId;
  const studentDetails = await studentModel.findById(loginStudentId);
  if (!studentDetails) {
    return res.status(404).json({ message: "Student not found" });
  }
  res.status(200).json({
    key: process.env.RAZORPAY_KEY,
    userDetails: {
      _id: studentDetails._id,
      name: `${studentDetails.studentDetails.firstName} ${studentDetails.studentDetails.lastName}`,
      studentId: studentDetails.studentId,
      email: studentDetails.studentDetails.email,
      mobile: studentDetails.studentDetails.mobile,
    },
  });
};

export const verifyHostedPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  try {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.redirect(
        `${frontendUrl}/payment-failed?reason=Missing required fields`,
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.redirect(
        `${frontendUrl}/payment-failed?reason=Invalid payment signature`,
      );
    }

    const paymentDetails = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        auth: {
          username: process.env.RAZORPAY_KEY,
          password: process.env.RAZORPAY_SECRET,
        },
      },
    );

    const status = paymentDetails.data.status;
    if (status !== "captured" && status !== "authorized") {
      return res.redirect(
        `${frontendUrl}/payment-failed?reason=Payment not captured`,
      );
    }

    const notes = paymentDetails.data.notes || {};
    const paymentType = notes?.paymentType || "application";

    if (paymentType === "student_fee") {
      const result = await handleStudentFeePayment(
        paymentDetails.data,
        razorpay_order_id,
        razorpay_signature,
      );
      if (!result) {
        return res.redirect(
          `${frontendUrl}/payment-failed?reason=Unable to process student fee payment`,
        );
      }
    } else if (paymentType === "atkt") {
      const result = await handleAtktPayment(
        paymentDetails.data,
        razorpay_order_id,
        razorpay_signature,
      );
      if (!result) {
        return res.redirect(
          `${frontendUrl}/payment-failed?reason=Unable to process ATKT payment`,
        );
      }
      return res.redirect(
        `${frontendUrl}/student/atkt-form?payment_status=success`,
      );
    } else if (paymentType === "revaluation") {
      const result = await handleRevalPayment(
        paymentDetails.data,
        razorpay_order_id,
        razorpay_signature,
      );
      if (!result) {
        return res.redirect(
          `${frontendUrl}/payment-failed?reason=Unable to process revaluation payment`,
        );
      }
      return res.redirect(
        `${frontendUrl}/student/revaluation?payment_status=success`,
      );
    } else {
      await handleApplicationPayment(
        paymentDetails.data,
        razorpay_order_id,
        razorpay_signature,
      );
    }

    return res.redirect(`${frontendUrl}/payment-success`);
  } catch (err) {
    console.error("Hosted Payment Verification Error:", err.message);
    return res.redirect(
      `${frontendUrl}/payment-failed?reason=` +
        encodeURIComponent("Server error: " + err.message),
    );
  }
};

export const captureRazorPayPayment = async (req, res) => {
  const {
    paymentId,
    orderId,
    signature,
    applicationId,
    feeStructureId,
    paymentType,
  } = req.body;
  const loginStudentId = req.user.userId || req.user.studentId;

  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(orderId + "|" + paymentId)
    .digest("hex");

  if (generatedSignature !== signature) {
    return res.status(400).json({ message: "Invalid payment signature" });
  }

  try {
    const paymentDetails = await axios.get(
      `https://api.razorpay.com/v1/payments/${paymentId}`,
      {
        auth: {
          username: process.env.RAZORPAY_KEY,
          password: process.env.RAZORPAY_SECRET,
        },
      },
    );

    if (paymentType === "student_fee" || feeStructureId) {
      return captureStudentFeePayment(req, res, paymentDetails.data);
    }

    return captureApplicationPayment(req, res, paymentDetails.data);
  } catch (error) {
    console.error("Payment capture error:", error);
    res
      .status(500)
      .json({ message: "Payment capture failed", error: error.message });
  }
};

export const captureStudentFeePayment = async (req, res, paymentData) => {
  const {
    paymentId,
    orderId,
    signature,
    feeStructureId,
    installmentNumber,
    isFullPayment,
    academicYear,
  } = req.body;
  const loginStudentId = req.user.studentId;

  try {
    const student = await studentModel.findById(loginStudentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const feeStructure = await FeeStructure.findById(feeStructureId);
    if (!feeStructure) {
      return res.status(404).json({ message: "Fee structure not found" });
    }

    if (
      feeStructure.batch.id.toString() !==
      student.academicDetails.batch.id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "Unauthorized access to fee structure" });
    }

    const paymentObj = {
      payload: paymentData,
      paymentId: paymentId,
      orderId: orderId,
      signature: signature,
      studentId: student._id,
      feeStructureId: feeStructureId,
      academicYear: academicYear,
      installmentNumber: installmentNumber || null,
      isFullPayment: isFullPayment || false,
      paymentType: "student_fee",
      amount: paymentData.amount / 100,
    };

    const payment = await paymentModel.create(paymentObj);

    if (payment) {
      try {
        const receipt = await createFeeReceipt(
          payment._id,
          `${student._id}_${feeStructureId}`,
        );

        res.status(201).json({
          success: true,
          message: "Student fee payment captured successfully",
          payment: payment,
          receipt: receipt,
          receiptGenerated: true,
        });
      } catch (receiptError) {
        console.error("Error generating receipt:", receiptError);

        res.status(201).json({
          success: true,
          message:
            "Student fee payment captured successfully, but receipt generation failed",
          payment: payment,
          receiptGenerated: false,
          receiptError: receiptError.message,
        });
      }
    } else {
      res.status(500).json({ message: "Failed to create payment record" });
    }
  } catch (error) {
    console.error("Student fee payment capture error:", error);
    res.status(500).json({
      success: false,
      message: "Student fee payment capture failed",
      error: error.message,
    });
  }
};

const captureApplicationPayment = async (req, res, paymentData) => {
  const {
    orderId,
    signature,
    applicationId,
    installmentNumber,
    isFullPayment,
  } = req.body;
  const loginUserId = req.user?.userId || null;

  const mergedNotes = {
    ...paymentData?.notes,
  };

  if (applicationId && !mergedNotes.applicationId) {
    mergedNotes.applicationId = applicationId;
  }
  if (
    installmentNumber !== undefined &&
    installmentNumber !== null &&
    mergedNotes.installmentNumber === undefined
  ) {
    mergedNotes.installmentNumber = installmentNumber.toString();
  }
  if (isFullPayment !== undefined && mergedNotes.isFullPayment === undefined) {
    mergedNotes.isFullPayment = String(isFullPayment);
  }

  const enrichedPaymentData = {
    ...paymentData,
    notes: mergedNotes,
  };

  try {
    const paymentRecord = await handleApplicationPayment(
      enrichedPaymentData,
      orderId,
      signature,
      {
        loginUserId,
        enforceUserAccess: true,
      },
    );

    return res.status(201).json({
      success: true,
      message: "Application fee payment captured successfully",
      payment: paymentRecord,
    });
  } catch (error) {
    console.error("Application payment capture error:", error);

    const message = error?.message || "Application payment capture failed";
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes("unauthorized")) {
      return res.status(403).json({ success: false, message });
    }

    if (normalizedMessage.includes("not found")) {
      return res.status(404).json({ success: false, message });
    }

    return res.status(500).json({
      success: false,
      message: "Application payment capture failed",
      error: message,
    });
  }
};

const handleStudentFeePayment = async (paymentData, orderId, signature) => {
  const notes = paymentData.notes || {};
  const studentId = notes?.studentId;
  const feeStructureId = notes?.feeStructureId;
  const academicYear = notes?.academicYear;
  const installmentNumber = notes?.installmentNumber
    ? parseInt(notes.installmentNumber)
    : null;
  const isFullPayment = notes?.isFullPayment === "true";
  const latePaymentPenalty = notes?.latePaymentPenalty
    ? parseFloat(notes.latePaymentPenalty)
    : 0;

  if (!studentId || !feeStructureId) {
    throw new Error("Student ID or Fee Structure ID not found");
  }

  const student = await studentModel.findById(studentId);
  if (!student) {
    throw new Error("Student not found");
  }

  const feeStructure = await FeeStructure.findById(feeStructureId);
  if (!feeStructure) {
    throw new Error("Fee structure not found");
  }

  const existing = await paymentModel.findOne({
    paymentId: paymentData.id,
  });
  if (existing) {
    console.log("Payment already exists, skipping creation");
    return existing;
  }

  const paymentObj = {
    payload: paymentData,
    paymentId: paymentData.id,
    orderId: orderId,
    signature: signature,
    studentId: studentId,
    feeStructureId: feeStructureId,
    academicYear: academicYear,
    installmentNumber: installmentNumber || null,
    isFullPayment,
    paymentType: "student_fee",
    amount: paymentData.amount / 100,
  };

  const payment = await paymentModel.create(paymentObj);

  try {
    const unifiedReceipt = await createUnifiedReceipt(
      payment._id,
      "student_fee",
    );
    console.log(`Unified receipt created: ${unifiedReceipt._id}`);
    return { payment, receipt: unifiedReceipt };
  } catch (unifiedError) {
    console.error("Error creating unified receipt:", unifiedError);
    return { payment, receiptError: unifiedError.message };
  }
};

const handleApplicationPayment = async (
  paymentData,
  orderId,
  signature,
  options = {},
) => {
  const notes = paymentData?.notes || {};
  const {
    loginUserId = null,
    enforceUserAccess = false,
    applicationId: fallbackApplicationId,
    installmentNumber: fallbackInstallmentNumber,
    isFullPayment: fallbackIsFullPayment,
  } = options;

  const applicationId =
    notes?.applicationId || fallbackApplicationId || paymentData?.applicationId;
  if (!applicationId) {
    throw new Error("Application ID not found");
  }

  const application = await applicationModel.findById(applicationId);
  if (!application) {
    throw new Error("Application not found");
  }

  if (
    enforceUserAccess &&
    loginUserId &&
    application.loginStudentId &&
    application.loginStudentId.toString() !== loginUserId.toString()
  ) {
    throw new Error("Unauthorized access to this application payment");
  }

  const rawInstallmentNumber =
    notes?.installmentNumber ?? fallbackInstallmentNumber ?? null;
  const parsedInstallment =
    rawInstallmentNumber !== undefined && rawInstallmentNumber !== null
      ? Number.parseInt(rawInstallmentNumber, 10)
      : null;
  const installmentNumber = Number.isNaN(parsedInstallment)
    ? null
    : parsedInstallment;

  const rawIsFullPayment =
    notes?.isFullPayment ?? fallbackIsFullPayment ?? null;
  const isFullPayment = rawIsFullPayment
    ? String(rawIsFullPayment).toLowerCase() === "true" ||
      rawIsFullPayment === true
    : false;

  const existing = await paymentModel.findOne({
    paymentId: paymentData.id,
  });
  if (existing) {
    console.log("Payment already exists, skipping creation");
    return existing;
  }

  let program = null;
  let defaultPlan = null;
  let expectedInstallments = isFullPayment ? 1 : 2;
  let dueDate = null;

  if (!isFullPayment && installmentNumber) {
    try {
      program = await programModel.findOne({
        programName: application.course,
      });

      if (program) {
        const installmentSettings =
          await InstallmentSettings.getSettingsForProgram(program._id);

        if (installmentSettings?.isEnabled) {
          defaultPlan =
            installmentSettings.installmentPlans.find(
              (plan) => plan.isDefault,
            ) ||
            installmentSettings.installmentPlans[0] ||
            null;

          if (defaultPlan) {
            expectedInstallments =
              defaultPlan.numberOfInstallments ||
              Math.max(installmentNumber + 1, 2);

            const nextInstallment = defaultPlan.breakdown?.find(
              (breakdown) =>
                breakdown.installmentNumber === installmentNumber + 1,
            );

            if (nextInstallment) {
              dueDate = new Date(
                Date.now() +
                  (nextInstallment.dueAfterDays || 0) * 24 * 60 * 60 * 1000,
              );
            }
          }
        }
      }

      if (!defaultPlan) {
        expectedInstallments = Math.max(installmentNumber + 1, 2);
      }

      if (!dueDate && installmentNumber === 1) {
        dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }
    } catch (error) {
      console.error("Error calculating installment details:", error);

      if (!dueDate && installmentNumber === 1) {
        dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }
    }
  }

  const effectiveUserId = (() => {
    if (
      application?.loginStudentId &&
      mongoose.Types.ObjectId.isValid(application.loginStudentId)
    ) {
      return application.loginStudentId;
    }
    return loginUserId || null;
  })();

  const paymentObj = {
    payload: paymentData,
    paymentId: paymentData.id,
    orderId,
    signature,
    applicationId,
    userId: effectiveUserId,
    installmentNumber: installmentNumber || null,
    isFullPayment,
    paymentType: "application",
    amount: paymentData.amount / 100,
    dueDate,
  };

  const paymentRecord = await paymentModel.create(paymentObj);

  const totalInstallments = await paymentModel.countDocuments({
    applicationId,
    paymentType: "application",
  });

  if (isFullPayment || totalInstallments >= expectedInstallments) {
    await applicationModel.findByIdAndUpdate(applicationId, {
      paymentStatus: "paid",
    });
  } else if (totalInstallments > 0) {
    await applicationModel.findByIdAndUpdate(applicationId, {
      paymentStatus: "partial",
    });
  }

  // try {
  //   if (effectiveUserId) {
  //     const user = await userModel.findById(effectiveUserId);
  //     if (user?.email) {
  //       let nextInstallmentInfo = null;

  //       if (
  //         !isFullPayment &&
  //         totalInstallments < expectedInstallments &&
  //         defaultPlan &&
  //         program
  //       ) {
  //         const nextInstallment = defaultPlan.breakdown?.find(
  //           (breakdown) =>
  //             breakdown.installmentNumber === (installmentNumber || 0) + 1,
  //         );

  //         if (nextInstallment) {
  //           const nextAmount = Math.round(
  //             (program.applicationFee * nextInstallment.percentage) / 100,
  //           );
  //           const nextDueDate =
  //             dueDate ||
  //             (nextInstallment.dueAfterDays
  //               ? new Date(
  //                   Date.now() +
  //                     nextInstallment.dueAfterDays * 24 * 60 * 60 * 1000,
  //                 )
  //               : null);

  //           nextInstallmentInfo = {
  //             installmentNumber: nextInstallment.installmentNumber,
  //             amount: nextAmount,
  //             dueDate: nextDueDate
  //               ? nextDueDate.toLocaleDateString("en-IN")
  //               : null,
  //           };
  //         }
  //       }

  //       // TODO: Uncomment this we need to similar theme design template
  //       // const emailHtml = paymentConfirmationEmail(
  //       //   `${application.studentDetails.firstName} ${application.studentDetails.lastName}`,
  //       //   application.applicationNumber,
  //       //   installmentNumber
  //       //     ? `${installmentNumber} of ${expectedInstallments}`
  //       //     : "Full Payment",
  //       //   paymentData.amount / 100,
  //       //   paymentData.id,
  //       //   nextInstallmentInfo,
  //       // );

  //       // await transporter.sendMail({
  //       //   from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
  //       //   to: user.email,
  //       //   subject: isFullPayment
  //       //     ? "Payment Confirmation - Application Fee Paid"
  //       //     : `Installment ${installmentNumber} Payment Confirmation`,
  //       //   html: emailHtml,
  //       // });

  //       // console.log(
  //       //   `Payment confirmation email sent to ${user.email} for application ${application.applicationNumber}`,
  //       // );
  //     }
  //   }
  // } catch (emailError) {
  //   console.error("Error sending payment confirmation email:", emailError);
  // }

  try {
    const unifiedReceipt = await createUnifiedReceipt(
      paymentRecord._id,
      "application",
    );
    console.log(`Unified application receipt created: ${unifiedReceipt._id}`);
  } catch (unifiedError) {
    console.error("Error creating unified application receipt:", unifiedError);
  }

  return paymentRecord;
};

const computeAtktAmount = (subjectCount) => {
  if (subjectCount <= 0) return 0;
  if (subjectCount === 1) return 320;
  if (subjectCount === 2) return 585;
  return 1255;
};

const handleAtktPayment = async (paymentData, orderId, signature) => {
  const notes = paymentData.notes || {};
  const atktFormId = notes?.atktFormId;

  if (!atktFormId) {
    throw new Error("ATKT Form ID not found in payment notes");
  }

  const form = await ATKTForm.findById(atktFormId);
  if (!form) {
    throw new Error("ATKT form not found");
  }

  // Idempotency: if payment already recorded, return existing
  const existing = await paymentModel.findOne({ paymentId: paymentData.id });
  if (existing) {
    // Ensure form is marked paid
    if (form.paymentStatus !== "paid") {
      await ATKTForm.findByIdAndUpdate(form._id, {
        paymentStatus: "paid",
        amount: existing.amount || paymentData.amount / 100,
        paymentRef: existing._id,
        paidAt: new Date(),
      });
    }
    return existing;
  }

  const expectedAmount = computeAtktAmount(form.subjects?.length || 0);
  const paidAmount = paymentData.amount / 100;

  // Optional strict check: amounts should match
  // if (expectedAmount > 0 && paidAmount !== expectedAmount) {
  //   console.error(
  //     `ATKT amount mismatch: expected ${expectedAmount}, got ${paidAmount} for form ${form._id}. Rejecting payment.`,
  //   );
  //   throw new Error("ATKT payment amount mismatch");
  // }
  const paymentObj = {
    payload: paymentData,
    paymentId: paymentData.id,
    orderId: orderId,
    signature: signature,
    paymentType: "atkt",
    atktFormId: form._id,
    amount: paidAmount,
  };

  const payment = await paymentModel.create(paymentObj);

  await ATKTForm.findByIdAndUpdate(form._id, {
    paymentStatus: "paid",
    amount: paidAmount,
    paymentRef: payment._id,
    paidAt: new Date(),
  });

  try {
    const unifiedReceipt = await createUnifiedReceipt(payment._id, "atkt");
    console.log(`Unified ATKT receipt created: ${unifiedReceipt._id}`);
  } catch (unifiedError) {
    console.error("Error creating unified ATKT receipt:", unifiedError);
  }

  return payment;
};

const handleRevalPayment = async (paymentData, orderId, signature) => {
  const notes = paymentData.notes || {};
  const revalApplicationId = notes?.revalApplicationId;

  if (!revalApplicationId) {
    throw new Error("Revaluation Application ID not found in payment notes");
  }

  const application = await RevalApplication.findById(revalApplicationId);
  if (!application) {
    throw new Error("Revaluation application not found");
  }

  // Idempotency check
  const existing = await paymentModel.findOne({ paymentId: paymentData.id });
  if (existing) {
    if (application.paymentStatus !== "paid") {
      await RevalApplication.findByIdAndUpdate(application._id, {
        paymentStatus: "paid",
        amount: existing.amount || paymentData.amount / 100,
        paymentRef: existing._id,
        paidAt: new Date(),
      });
    }
    return existing;
  }

  const paidAmount = paymentData.amount / 100;

  const paymentObj = {
    payload: paymentData,
    paymentId: paymentData.id,
    orderId: orderId,
    signature: signature,
    paymentType: "revaluation",
    revalApplicationId: application._id,
    amount: paidAmount,
  };

  const payment = await paymentModel.create(paymentObj);

  await RevalApplication.findByIdAndUpdate(application._id, {
    paymentStatus: "paid",
    amount: paidAmount,
    paymentRef: payment._id,
    paidAt: new Date(),
  });

  try {
    const unifiedReceipt = await createUnifiedReceipt(payment._id, "revaluation");
    console.log(`Unified revaluation receipt created: ${unifiedReceipt._id}`);
  } catch (unifiedError) {
    console.error("Error creating unified revaluation receipt:", unifiedError);
  }

  return payment;
};

export const getStudentFeePaymentStatus = async (req, res) => {
  try {
    const { feeStructureId, academicYear } = req.params;
    const loginStudentId = req.user.studentId;

    if (!feeStructureId || !academicYear) {
      return res
        .status(400)
        .json({ message: "Fee structure ID and academic year are required" });
    }

    const student = await studentModel.findById(loginStudentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const feeStructure = await FeeStructure.findById(feeStructureId);
    if (!feeStructure) {
      return res.status(404).json({ message: "Fee structure not found" });
    }

    if (
      feeStructure.batch.id.toString() !==
      student.academicDetails.batch.id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "Unauthorized access to fee structure" });
    }

    const payments = await paymentModel
      .find({
        studentId: student._id,
        feeStructureId: feeStructureId,
        academicYear: academicYear,
        paymentType: "student_fee",
        isReversed: { $ne: true },
      })
      .sort({ createdAt: -1 });

    const totalPaid = payments.reduce((sum, payment) => {
      const amount = payment.amount || (payment.payload?.amount ? payment.payload.amount / 100 : 0);
      return sum + amount;
    }, 0);

    const remainingAmount = feeStructure.totalAmount - totalPaid;
    const paymentStatus =
      remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "pending";

    const installmentDetails = feeStructure.paymentStructure.installments.map(
      (installment) => {
        const installmentPayment = payments.find(
          (p) => p.installmentNumber === installment.installmentNumber,
        );
        return {
          installmentNumber: installment.installmentNumber,
          amount: installment.amount,
          dueDate: installment.dueDate,
          status: installmentPayment ? "paid" : "pending",
          paidDate: installmentPayment ? installmentPayment.createdAt : null,
          paymentId: installmentPayment ? installmentPayment._id : null,
        };
      },
    );

    return res.status(200).json({
      success: true,
      data: {
        student: {
          _id: student._id,
          name: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
          studentId: student.studentId,
          batch: student.academicDetails.batch,
        },
        feeStructure,
        academicYear,
        totalAmount: feeStructure.totalAmount,
        paidAmount: totalPaid,
        remainingAmount,
        paymentStatus,
        installmentDetails,
        payments,
      },
    });
  } catch (error) {
    console.error("Error fetching student fee payment status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const createStudentFeeCheckout = async (req, res) => {
  try {
    const { feeStructureId, installmentNumber, isFullPayment, academicYear } =
      req.body;
    const loginStudentId = req.user.studentId;

    const student = await studentModel.findById(loginStudentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const feeStructure = await FeeStructure.findById(feeStructureId);
    if (!feeStructure) {
      return res.status(404).json({ message: "Fee structure not found" });
    }

    if (
      feeStructure.batch.id.toString() !==
      student.academicDetails.batch.id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "Unauthorized access to fee structure" });
    }

    let amount;
    if (isFullPayment) {
      amount = feeStructure.totalAmount;
    } else {
      if (
        feeStructure.paymentStructure?.allowInstallments &&
        feeStructure.paymentStructure?.installments?.length > 0
      ) {
        const installment = feeStructure.paymentStructure.installments.find(
          (inst) => inst.installmentNumber === installmentNumber,
        );
        if (!installment) {
          return res
            .status(400)
            .json({ message: "Invalid installment number" });
        }
        amount = installment.amount;
      } else {
        const installmentSettings =
          await InstallmentSettings.getSettingsForProgram(null);

        if (
          !installmentSettings ||
          !installmentSettings.isEnabled ||
          !installmentSettings.applicableToStudentFees
        ) {
          return res.status(400).json({
            message: "Installment payments are not available for student fees.",
          });
        }

        const defaultPlan =
          installmentSettings.installmentPlans.find((plan) => plan.isDefault) ||
          installmentSettings.installmentPlans[0];

        if (!defaultPlan) {
          return res.status(400).json({
            message: "No installment plans configured for student fees.",
          });
        }

        const installmentBreakdown = defaultPlan.breakdown.find(
          (breakdown) => breakdown.installmentNumber === installmentNumber,
        );

        if (!installmentBreakdown) {
          return res.status(400).json({
            message: `Invalid installment number. Available installments: ${defaultPlan.breakdown.map((b) => b.installmentNumber).join(", ")}`,
          });
        }

        amount = Math.round(
          (feeStructure.totalAmount * installmentBreakdown.percentage) / 100,
        );
      }
    }

    const year = academicYear.split("-")[0].slice(-2);
    const timestamp = Date.now().toString().slice(-6);
    let receiptId = `FEE_${year}_${student.studentId}_${timestamp}`;

    if (receiptId.length > 40) {
      const shortReceiptId = `F${year}${student.studentId.slice(
        -4,
      )}${timestamp}`;
      receiptId = shortReceiptId.slice(0, 40);
    }

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: receiptId,
      notes: {
        paymentType: "student_fee",
        studentId: student._id.toString(),
        feeStructureId: feeStructureId,
        academicYear: academicYear,
        installmentNumber: installmentNumber?.toString() || null,
        isFullPayment: isFullPayment.toString(),
        studentName: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
      },
    };

    const order = await instance.orders.create(options);
    if (order) {
      res.status(200).json({
        success: true,
        order,
        student: {
          _id: student._id,
          name: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
          studentId: student.studentId,
          email: student.studentDetails.email,
          mobile: student.studentDetails.mobile,
        },
      });
    } else {
      res.status(500).json({ message: "Failed to create Razorpay order." });
    }
  } catch (error) {
    console.error("Error creating student fee checkout:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create student fee checkout",
      error: error.message,
    });
  }
};

export const createApplicationFeeCheckoutStudent = async (req, res) => {
  try {
    const { applicationId, installmentNumber, isFullPayment } = req.body;
    const loginStudentId = req.user.studentId;

    const student = await studentModel.findById(loginStudentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const application = await applicationModel.findById(applicationId);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (
      !student.loginStudentId ||
      application.loginStudentId?.toString() !== student.loginStudentId.toString()
    ) {
      return res.status(403).json({ message: "Unauthorized access to application" });
    }

    const program = await programModel.findOne({ programName: application.course });
    if (!program || typeof program.applicationFee !== "number") {
      return res
        .status(400)
        .json({ message: "Application fee not set for this course." });
    }

    const totalFee = program.applicationFee + (program.developmentFee || 0);

    let amount;
    if (isFullPayment) {
      amount = totalFee;
    } else {
      const installmentSettings =
        await InstallmentSettings.getSettingsForProgram(program._id);

      if (
        !installmentSettings ||
        !installmentSettings.isEnabled ||
        !installmentSettings.applicableToApplicationFees
      ) {
        return res.status(400).json({
          message: "Installment payments are not available for this course.",
        });
      }

      const defaultPlan =
        installmentSettings.installmentPlans.find((plan) => plan.isDefault) ||
        installmentSettings.installmentPlans[0];

      if (!defaultPlan) {
        return res.status(400).json({
          message: "No installment plans configured for this course.",
        });
      }

      const installmentBreakdown = defaultPlan.breakdown.find(
        (breakdown) => breakdown.installmentNumber === installmentNumber,
      );

      if (!installmentBreakdown) {
        return res.status(400).json({
          message: `Invalid installment number. Available: ${defaultPlan.breakdown.map((b) => b.installmentNumber).join(", ")}`,
        });
      }

      amount = Math.round(
        (totalFee * installmentBreakdown.percentage) / 100,
      );
    }

    const receiptId = `APP_${application._id}_${Date.now().toString().slice(-8)}`;
    const studentName = `${student.studentDetails.firstName} ${student.studentDetails.lastName}`;

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: receiptId,
      notes: {
        paymentType: "application",
        applicationId: application._id.toString(),
        installmentNumber: installmentNumber?.toString() || null,
        isFullPayment: isFullPayment.toString(),
        studentName,
      },
    };

    const order = await instance.orders.create(options);
    if (order) {
      res.status(200).json({
        success: true,
        order,
        student: {
          _id: student._id,
          name: studentName,
          studentId: student.studentId,
          email: student.studentDetails.email,
          mobile: student.studentDetails.mobile,
        },
      });
    } else {
      res.status(500).json({ message: "Failed to create Razorpay order." });
    }
  } catch (error) {
    console.error("Error creating application fee checkout:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create application fee checkout",
      error: error.message,
    });
  }
};

export const getPaymentStatus = async (req, res) => {
  try {
    const { paymentType, referenceId } = req.params;
    const loginUserId = req.user?.userId;
    const loginStudentId = req.user?.studentId;

    if (!paymentType || !referenceId) {
      return res.status(400).json({
        message: "Payment type and reference ID are required",
      });
    }

    let payments = [];
    let statusData = {};

    if (paymentType === "application") {
      payments = await paymentModel
        .find({
          applicationId: referenceId,
          paymentType: "application",
        })
        .sort({ createdAt: -1 });

      const application = await applicationModel.findById(referenceId);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      if (
        application.loginStudentId &&
        loginUserId &&
        application.loginStudentId.toString() !== loginUserId.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Unauthorized to view this application payment" });
      }

      const totalPaid = payments.reduce((sum, payment) => {
        return sum + (payment.amount || payment.payload.amount / 100);
      }, 0);

      const program = await programModel.findOne({
        programName: application.course,
      });
      const totalAmount = program?.applicationFee || 0;
      const remainingAmount = totalAmount - totalPaid;

      statusData = {
        referenceId,
        paymentType: "application",
        application,
        totalAmount,
        paidAmount: totalPaid,
        remainingAmount,
        paymentStatus: application.paymentStatus,
        payments,
      };
    } else if (paymentType === "student_fee") {
      payments = await paymentModel
        .find({
          feeStructureId: referenceId,
          paymentType: "student_fee",
          isReversed: { $ne: true },
        })
        .sort({ createdAt: -1 });

      const feeStructure = await FeeStructure.findById(referenceId);
      if (!feeStructure) {
        return res.status(404).json({ message: "Fee structure not found" });
      }

      if (loginStudentId) {
        const isOwner = payments.some(
          (payment) =>
            payment.studentId &&
            payment.studentId.toString() === loginStudentId.toString(),
        );
        if (!isOwner) {
          return res.status(403).json({
            message: "Unauthorized to view this fee structure payment",
          });
        }
      }

      const totalPaid = payments.reduce((sum, payment) => {
        const amount = payment.amount || (payment.payload?.amount ? payment.payload.amount / 100 : 0);
        return sum + amount;
      }, 0);

      const remainingAmount = feeStructure.totalAmount - totalPaid;
      const paymentStatus =
        remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "pending";

      statusData = {
        referenceId,
        paymentType: "student_fee",
        feeStructure,
        totalAmount: feeStructure.totalAmount,
        paidAmount: totalPaid,
        remainingAmount,
        paymentStatus,
        payments,
      };
    } else {
      return res.status(400).json({ message: "Invalid payment type" });
    }

    return res.status(200).json({
      success: true,
      data: statusData,
    });
  } catch (error) {
    console.error("Error fetching payment status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getStudentFeeStatus = async (
  studentId,
  feeStructureId,
  academicYear,
) => {
  try {
    const payments = await paymentModel
      .find({
        studentId: studentId,
        feeStructureId: feeStructureId,
        academicYear: academicYear,
        paymentType: "student_fee",
        isReversed: { $ne: true },
      })
      .sort({ createdAt: -1 });

    const feeStructure = await FeeStructure.findById(feeStructureId);
    if (!feeStructure) {
      throw new Error("Fee structure not found");
    }

    const totalPaid = payments.reduce((sum, payment) => {
      const amount = payment.amount || (payment.payload?.amount ? payment.payload.amount / 100 : 0);
      return sum + amount;
    }, 0);

    const remainingAmount = feeStructure.totalAmount - totalPaid;
    const paymentStatus =
      remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "pending";

    const installmentDetails = feeStructure.paymentStructure.installments.map(
      (installment) => {
        const installmentPayment = payments.find(
          (p) => p.installmentNumber === installment.installmentNumber,
        );
        return {
          installmentNumber: installment.installmentNumber,
          amount: installment.amount,
          dueDate: installment.dueDate,
          status: installmentPayment ? "paid" : "pending",
          paidDate: installmentPayment ? installmentPayment.createdAt : null,
          paymentId: installmentPayment ? installmentPayment._id : null,
        };
      },
    );

    return {
      totalAmount: feeStructure.totalAmount,
      paidAmount: totalPaid,
      remainingAmount,
      paymentStatus,
      installmentDetails,
      payments,
      lastPaymentDate: payments.length > 0 ? payments[0].createdAt : null,
    };
  } catch (error) {
    console.error("Error getting student fee status:", error);
    throw error;
  }
};

export const checkStudentFeePaymentStatus = async (req, res) => {
  try {
    const { studentId, academicYear } = req.params;
    const loginStudentId = req.user.studentId;

    if (loginStudentId !== studentId) {
      const student = await studentModel.findById(studentId);
      if (
        !student ||
        student.loginStudentId.toString() !== loginStudentId.toString()
      ) {
        return res.status(403).json({ message: "Unauthorized access" });
      }
    }

    const student = await studentModel.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const feeStructure = await FeeStructure.findOne({
      "batch.id": student.academicDetails.batch.id,
      academicYear: academicYear,
    });

    if (!feeStructure) {
      return res.status(404).json({
        message: "Fee structure not found for this batch and academic year",
      });
    }

    const feeStatus = await getStudentFeeStatus(
      studentId,
      feeStructure._id,
      academicYear,
    );

    return res.status(200).json({
      success: true,
      data: {
        student: {
          _id: student._id,
          name: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
          studentId: student.studentId,
          batch: student.academicDetails.batch,
        },
        feeStructure,
        academicYear,
        ...feeStatus,
      },
    });
  } catch (error) {
    console.error("Error checking student fee payment status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getAllStudentsFeeStatus = async (req, res) => {
  try {
    const { batchId, academicYear } = req.query;

    if (!batchId || !academicYear) {
      return res.status(400).json({
        message: "Batch ID and academic year are required",
      });
    }

    const students = await studentModel.find({
      "academicDetails.batch.id": batchId,
    });

    const feeStructure = await FeeStructure.findOne({
      "batch.id": batchId,
      academicYear: academicYear,
    });

    if (!feeStructure) {
      return res.status(404).json({
        message: "Fee structure not found for this batch and academic year",
      });
    }

    const studentsWithFeeStatus = await Promise.all(
      students.map(async (student) => {
        try {
          const feeStatus = await getStudentFeeStatus(
            student._id,
            feeStructure._id,
            academicYear,
          );
          return {
            student: {
              _id: student._id,
              name: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
              studentId: student.studentId,
              email: student.studentDetails.email,
              mobile: student.studentDetails.mobile,
            },
            ...feeStatus,
          };
        } catch (error) {
          console.error(
            `Error getting fee status for student ${student.studentId}:`,
            error,
          );
          return {
            student: {
              _id: student._id,
              name: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
              studentId: student.studentId,
              email: student.studentDetails.email,
              mobile: student.studentDetails.mobile,
            },
            paymentStatus: "error",
            error: error.message,
          };
        }
      }),
    );

    return res.status(200).json({
      success: true,
      data: {
        feeStructure,
        academicYear,
        students: studentsWithFeeStatus,
        summary: {
          totalStudents: students.length,
          paidStudents: studentsWithFeeStatus.filter(
            (s) => s.paymentStatus === "paid",
          ).length,
          partialStudents: studentsWithFeeStatus.filter(
            (s) => s.paymentStatus === "partial",
          ).length,
          pendingStudents: studentsWithFeeStatus.filter(
            (s) => s.paymentStatus === "pending",
          ).length,
        },
      },
    });
  } catch (error) {
    console.error("Error getting all students fee status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const handleWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("Webhook signature mismatch");
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;

    if (event.event === "payment.captured") {
      const paymentData = event.payload.payment.entity;
      const notes = paymentData.notes || {};
      const paymentType = notes?.paymentType || "application";
      const orderId = paymentData.order_id;
      const webhookSignature = "verified_by_webhook";

      console.log(
        `Processing webhook for payment type: ${paymentType}, payment ID: ${paymentData.id}`,
      );

      let result;
      if (paymentType === "student_fee") {
        result = await handleStudentFeePayment(
          paymentData,
          orderId,
          webhookSignature,
        );
      } else if (paymentType === "atkt") {
        result = await handleAtktPayment(
          paymentData,
          orderId,
          webhookSignature,
        );
      } else if (paymentType === "revaluation") {
        result = await handleRevalPayment(
          paymentData,
          orderId,
          webhookSignature,
        );
      } else {
        result = await handleApplicationPayment(
          paymentData,
          orderId,
          webhookSignature,
        );
      }

      console.log(
        `Webhook for ${paymentType} payment processed:`,
        result?.payment?._id || result?._id || "No result ID",
      );
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Error in webhook handler:", error.message);
    res.status(500).send("Webhook processing failed");
  }
};

export const getInstallmentOptions = async (req, res) => {
  try {
    const { programId, paymentType = "application" } = req.params;

    const installmentSettings =
      await InstallmentSettings.getSettingsForProgram(programId);

    if (!installmentSettings || !installmentSettings.isEnabled) {
      return res.status(200).json({
        success: true,
        data: {
          isEnabled: false,
          options: [],
          message: "Installment payments are not available",
        },
      });
    }

    const isApplicable =
      paymentType === "application"
        ? installmentSettings.applicableToApplicationFees
        : installmentSettings.applicableToStudentFees;

    if (!isApplicable) {
      return res.status(200).json({
        success: true,
        data: {
          isEnabled: false,
          options: [],
          message: `Installment payments are not available for ${paymentType} fees`,
        },
      });
    }

    const program = await programModel.findById(programId);
    const baseAmount = program?.applicationFee || 0;

    const installmentOptions = installmentSettings.installmentPlans.map(
      (plan) => ({
        planId: plan.planId,
        name: plan.name,
        numberOfInstallments: plan.numberOfInstallments,
        isDefault: plan.isDefault,
        breakdown: plan.breakdown.map((breakdown) => ({
          installmentNumber: breakdown.installmentNumber,
          percentage: breakdown.percentage,
          amount: Math.round((baseAmount * breakdown.percentage) / 100),
          dueAfterDays: breakdown.dueAfterDays,
          description:
            breakdown.description ||
            `Installment ${breakdown.installmentNumber}`,
        })),
      }),
    );

    res.status(200).json({
      success: true,
      data: {
        isEnabled: true,
        programId,
        paymentType,
        baseAmount,
        options: installmentOptions,
        defaultPlan:
          installmentOptions.find((plan) => plan.isDefault) ||
          installmentOptions[0],
      },
    });
  } catch (error) {
    console.error("Error fetching installment options:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch installment options",
      error: error.message,
    });
  }
};
