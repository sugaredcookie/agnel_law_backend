import FeeStructure from "../models/feeStructureModel.js";
import Student from "../models/studentModel.js";
import paymentModel from "../models/paymentModel.js";
import mongoose from "mongoose";
import studentModel from "../models/studentModel.js";
import applicationModel from "../models/applicationModel.js";
import programModel from "../models/programModel.js";
import InstallmentSettings from "../models/installmentSettingsModel.js";

export const createFeeStructure = async (req, res) => {
  try {
    const {
      batchId,
      batchName,
      academicYear,
      fees,
      paymentStructure,
      paymentAcceptance,
    } = req.body;

    const totalAmount = Object.values(fees).reduce((sum, fee) => sum + fee, 0);

    const existingFee = await FeeStructure.findOne({
      "batch.id": batchId,
      academicYear,
    });

    if (existingFee) {
      return res.status(400).json({
        success: false,
        message:
          "Fee structure already exists for this batch and academic year",
      });
    }

    const feeStructure = new FeeStructure({
      batch: {
        id: batchId,
        name: batchName,
      },
      academicYear,
      fees,
      totalAmount,
      paymentStructure,
      paymentAcceptance,
    });

    await feeStructure.save();

    res.status(201).json({
      success: true,
      message:
        "Fee structure created successfully. This will automatically apply to all students in the batch.",
      data: feeStructure,
    });
  } catch (error) {
    console.error("Error creating fee structure:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create fee structure",
      error: error.message,
    });
  }
};

export const getFeeStructure = async (req, res) => {
  try {
    const { batchId, academicYear } = req.params;

    const feeStructure = await FeeStructure.findOne({
      "batch.id": batchId,
      academicYear,
      isActive: true,
    }).populate("batch.id");

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found for this batch and academic year",
      });
    }

    if (
      feeStructure.batch.id &&
      feeStructure.batch.id.batchName &&
      !feeStructure.batch.name
    ) {
      feeStructure.batch.name = feeStructure.batch.id.batchName;
    }

    res.status(200).json({
      success: true,
      data: feeStructure,
    });
  } catch (error) {
    console.error("Error fetching fee structure:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch fee structure",
      error: error.message,
    });
  }
};

export const getStudentFee = async (req, res) => {
  try {
    const { academicYear } = req.params;
    const loginStudentId = req.user.studentId;

    const student = await studentModel.findById(loginStudentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // First, check if student has existing payments for this academic year
    // This handles cases where student's batch may have changed or fee structure was modified
    const existingPayment = await paymentModel.findOne({
      studentId: student._id,
      academicYear,
      paymentType: "student_fee",
      isReversed: { $ne: true },
    });

    let feeStructure;

    if (existingPayment && existingPayment.feeStructureId) {
      // Use prior payment fee structure only if it matches the current batch
      feeStructure = await FeeStructure.findById(existingPayment.feeStructureId);

      const studentBatchId = student.academicDetails?.batch?.id?.toString();
      const feeBatchId = feeStructure?.batch?.id?.toString();

      if (studentBatchId && feeBatchId && feeBatchId !== studentBatchId) {
        feeStructure = null;
      }
    }

    // If no fee structure found via payments, look up by current batch
    if (!feeStructure) {
      feeStructure = await FeeStructure.findOne({
        "batch.id": new mongoose.Types.ObjectId(student.academicDetails.batch.id),
        academicYear,
        isActive: true,
      });
    }

    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "No fee structure found for this academic year",
      });
    }

    const payments = await paymentModel.find({
      studentId: student._id,
      feeStructureId: feeStructure._id,
      paymentType: "student_fee",
      isReversed: { $ne: true },
    });

    const totalPaid = payments.reduce((sum, payment) => {
      const amount = payment.amount || (payment.payload?.amount ? payment.payload.amount / 100 : 0);
      return sum + amount;
    }, 0);

    const remainingAmount = feeStructure.totalAmount - totalPaid;

    const installmentDetails =
      feeStructure.paymentStructure?.installments?.map((installment) => {
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
      }) || [];

    const paymentStatus =
      remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "pending";

    const studentFeeData = {
      _id: `${student._id}_${feeStructure._id}`,
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
    };

    res.status(200).json({
      success: true,
      data: studentFeeData,
    });
  } catch (error) {
    console.error("Error fetching student fee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch student fee",
      error: error.message,
    });
  }
};

export const getAllStudentFees = async (req, res) => {
  try {
    const loginStudentId = req.user.studentId;

    const student = await studentModel.findById(loginStudentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const feeStructures = await FeeStructure.find({
      "batch.id": new mongoose.Types.ObjectId(student.academicDetails.batch.id),
      isActive: true,
    }).sort({ academicYear: -1 });

    const studentFeesData = [];

    for (const feeStructure of feeStructures) {
      const payments = await paymentModel.find({
        studentId: student._id,
        feeStructureId: feeStructure._id,
        paymentType: "student_fee",
      });

      const totalPaid = payments.reduce((sum, payment) => {
        return sum + payment.payload.amount / 100;
      }, 0);

      const remainingAmount = feeStructure.totalAmount - totalPaid;
      const paymentStatus =
        remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "pending";

      studentFeesData.push({
        _id: `${student._id}_${feeStructure._id}`,
        feeStructure,
        academicYear: feeStructure.academicYear,
        totalAmount: feeStructure.totalAmount,
        paidAmount: totalPaid,
        remainingAmount,
        paymentStatus,
        paymentCount: payments.length,
        student: {
          _id: student._id,
          name: `${student.studentDetails.firstName} ${student.studentDetails.lastName}`,
          studentId: student.studentId,
          batch: student.academicDetails.batch,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: studentFeesData,
    });
  } catch (error) {
    console.error("Error fetching student fees:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch student fees",
      error: error.message,
    });
  }
};

export const controlPaymentAcceptance = async (req, res) => {
  try {
    const { feeStructureId } = req.params;
    const {
      isAcceptingPayments,
      startDate,
      endDate,
      latePaymentAllowed,
      latePaymentPenalty,
    } = req.body;

    const feeStructure = await FeeStructure.findById(feeStructureId);
    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found",
      });
    }

    feeStructure.paymentAcceptance = {
      ...feeStructure.paymentAcceptance,
      isAcceptingPayments:
        isAcceptingPayments !== undefined
          ? isAcceptingPayments
          : feeStructure.paymentAcceptance.isAcceptingPayments,
      startDate: startDate || feeStructure.paymentAcceptance.startDate,
      endDate: endDate || feeStructure.paymentAcceptance.endDate,
      latePaymentAllowed:
        latePaymentAllowed !== undefined
          ? latePaymentAllowed
          : feeStructure.paymentAcceptance.latePaymentAllowed,
      latePaymentPenalty:
        latePaymentPenalty !== undefined
          ? latePaymentPenalty
          : feeStructure.paymentAcceptance.latePaymentPenalty,
    };

    await feeStructure.save();

    res.status(200).json({
      success: true,
      message: "Payment acceptance settings updated successfully",
      data: feeStructure,
    });
  } catch (error) {
    console.error("Error updating payment acceptance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update payment acceptance settings",
      error: error.message,
    });
  }
};

export const getAllFeeStructures = async (req, res) => {
  try {
    const { academicYear, batchId } = req.query;

    const filter = {};
    if (academicYear) filter.academicYear = academicYear;
    if (batchId) filter["batch.id"] = batchId;

    const feeStructures = await FeeStructure.find(filter)
      .populate("batch.id")
      .sort({
        createdAt: -1,
      });

    const feeStructuresWithStatus = feeStructures.map((structure) => {
      const currentDate = new Date();
      const structureObj = structure.toObject();

      if (
        structureObj.batch.id &&
        structureObj.batch.id.batchName &&
        !structureObj.batch.name
      ) {
        structureObj.batch.name = structureObj.batch.id.batchName;
      }

      const isPaymentPeriodActive =
        structure.paymentAcceptance?.startDate &&
        structure.paymentAcceptance?.endDate &&
        currentDate >= structure.paymentAcceptance.startDate &&
        currentDate <= structure.paymentAcceptance.endDate;

      return {
        ...structureObj,
        paymentStatus: {
          canAcceptPayments:
            structure.paymentAcceptance?.isAcceptingPayments &&
            isPaymentPeriodActive,
          isPaymentPeriodActive,
          daysRemaining: structure.paymentAcceptance?.endDate
            ? Math.ceil(
                (structure.paymentAcceptance.endDate - currentDate) /
                  (1000 * 60 * 60 * 24),
              )
            : 0,
        },
      };
    });

    res.status(200).json({
      success: true,
      data: feeStructuresWithStatus,
    });
  } catch (error) {
    console.error("Error fetching fee structures:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch fee structures",
      error: error.message,
    });
  }
};

export const checkPaymentAllowed = async (req, res) => {
  try {
    const { feeStructureId } = req.params;

    const feeStructure = await FeeStructure.findById(feeStructureId);
    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found",
      });
    }

    const currentDate = new Date();
    const isPaymentPeriodActive =
      currentDate >= feeStructure.paymentAcceptance.startDate &&
      currentDate <= feeStructure.paymentAcceptance.endDate;

    const canAcceptPayments =
      feeStructure.paymentAcceptance.isAcceptingPayments &&
      isPaymentPeriodActive;

    const isLatePayment = currentDate > feeStructure.paymentAcceptance.endDate;
    const latePaymentAllowed =
      isLatePayment && feeStructure.paymentAcceptance.latePaymentAllowed;

    res.status(200).json({
      success: true,
      data: {
        canAcceptPayments: canAcceptPayments || latePaymentAllowed,
        isPaymentPeriodActive,
        isLatePayment,
        latePaymentAllowed,
        latePaymentPenalty: feeStructure.paymentAcceptance.latePaymentPenalty,
        paymentStartDate: feeStructure.paymentAcceptance.startDate,
        paymentEndDate: feeStructure.paymentAcceptance.endDate,
        daysRemaining: Math.ceil(
          (feeStructure.paymentAcceptance.endDate - currentDate) /
            (1000 * 60 * 60 * 24),
        ),
      },
    });
  } catch (error) {
    console.error("Error checking payment allowed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check payment status",
      error: error.message,
    });
  }
};

export const updateFeeStructure = async (req, res) => {
  try {
    const { feeStructureId } = req.params;
    const {
      batchId,
      batchName,
      academicYear,
      fees,
      paymentStructure,
      paymentAcceptance,
    } = req.body;

    const totalAmount = Object.values(fees).reduce((sum, fee) => sum + fee, 0);

    const feeStructure = await FeeStructure.findById(feeStructureId);
    if (!feeStructure) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found",
      });
    }

    feeStructure.batch = {
      id: batchId,
      name: batchName,
    };
    feeStructure.academicYear = academicYear;
    feeStructure.fees = fees;
    feeStructure.totalAmount = totalAmount;
    feeStructure.paymentStructure = paymentStructure;
    feeStructure.paymentAcceptance = paymentAcceptance;

    await feeStructure.save();

    res.status(200).json({
      success: true,
      message: "Fee structure updated successfully",
      data: feeStructure,
    });
  } catch (error) {
    console.error("Error updating fee structure:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update fee structure",
      error: error.message,
    });
  }
};

export const getStudentApplicationFee = async (req, res) => {
  try {
    const loginStudentId = req.user.studentId;

    const student = await studentModel.findById(loginStudentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    if (!student.loginStudentId || !mongoose.Types.ObjectId.isValid(student.loginStudentId)) {
      return res.status(404).json({ success: false, message: "No application fee found" });
    }

    const application = await applicationModel.findOne({
      loginStudentId: student.loginStudentId,
    });

    if (!application) {
      return res.status(404).json({ success: false, message: "No application found" });
    }

    const program = await programModel.findOne({ programName: application.course });
    if (!program || typeof program.applicationFee !== "number") {
      return res.status(404).json({ success: false, message: "Application fee not configured" });
    }

    const payments = await paymentModel.find({
      applicationId: application._id,
      paymentType: "application",
      isReversed: { $ne: true },
    });

    const totalPaid = payments.reduce((sum, p) => {
      const amount = p.amount || (p.payload?.amount ? p.payload.amount / 100 : 0);
      return sum + amount;
    }, 0);

    const totalAmount = program.applicationFee + (program.developmentFee || 0);
    const remainingAmount = Math.max(0, totalAmount - totalPaid);
    const paymentStatus = remainingAmount <= 0 ? "paid" : totalPaid > 0 ? "partial" : "pending";

    let installmentOptions = null;
    if (remainingAmount > 0) {
      const installmentSettings = await InstallmentSettings.getSettingsForProgram(program._id);
      if (installmentSettings?.isEnabled && installmentSettings?.applicableToApplicationFees) {
        const defaultPlan =
          installmentSettings.installmentPlans.find((plan) => plan.isDefault) ||
          installmentSettings.installmentPlans[0];

        if (defaultPlan) {
          const paidInstallments = payments.map((p) => p.installmentNumber).filter(Boolean);
          const pendingInstallments = defaultPlan.breakdown
            .filter((b) => !paidInstallments.includes(b.installmentNumber))
            .map((b) => ({
              installmentNumber: b.installmentNumber,
              percentage: b.percentage,
              amount: Math.min(
                Math.round((totalAmount * b.percentage) / 100),
                remainingAmount,
              ),
              description: b.description,
              dueAfterDays: b.dueAfterDays,
            }));

          installmentOptions = {
            isEnabled: true,
            pendingInstallments,
          };
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        applicationId: application._id,
        applicationNumber: application.applicationNumber,
        course: application.course,
        totalAmount,
        paidAmount: totalPaid,
        remainingAmount,
        paymentStatus,
        installmentOptions,
      },
    });
  } catch (error) {
    console.error("Error fetching student application fee:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch application fee",
      error: error.message,
    });
  }
};
