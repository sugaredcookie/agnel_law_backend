import mongoose from "mongoose";

const unifiedReceiptSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
    },
    receiptType: {
      type: String,
      enum: ["student_fee", "application", "atkt", "revaluation"],
      required: true,
    },
    revalApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RevalApplication",
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "payment",
      required: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "application",
    },
    atktFormId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ATKTForm",
    },
    feeStructureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeStructure",
    },
    academicYear: {
      type: String,
    },
    studentDetails: {
      name: String,
      id: String,
      idLabel: String,
      email: String,
      mobile: String,
      program: String,
      batch: String,
      rollNumber: String,
      course: String,
      pattern: String,
    },
    paymentDetails: {
      paymentDate: {
        type: Date,
        required: true,
      },
      paymentMode: {
        type: String,
        default: "Online",
      },
      transactionId: String,
      orderId: String,
      razorpayPaymentId: String,
      academicYear: String,
    },
    feeBreakdown: {
      tuitionFee: { type: Number, default: 0 },
      developmentFee: { type: Number, default: 0 },
      applicationFee: { type: Number, default: 0 },
      examinationFee: { type: Number, default: 0 },
      latePaymentPenalty: { type: Number, default: 0 },
    },
    paymentSummary: {
      totalFeeAmount: Number,
      amountPaid: {
        type: Number,
        required: true,
      },
      remainingBalance: {
        type: Number,
        default: 0,
      },
      installmentNumber: Number,
      isFullPayment: {
        type: Boolean,
        default: false,
      },
    },
    subjects: [
      {
        id: String,
        label: String,
        name: String,
        code: String,
      },
    ],
    institutionDetails: {
      name: {
        type: String,
        default: "Agnel School of Law",
      },
      address: String,
      phone: String,
      email: String,
      website: String,
    },
    receiptStatus: {
      type: String,
      enum: ["generated", "viewed", "downloaded", "emailed", "reversed"],
      default: "generated",
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    lastDownloadedAt: Date,
    emailedTo: [String],
    remarks: String,
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

unifiedReceiptSchema.index({ receiptNumber: 1 }, { unique: true });
unifiedReceiptSchema.index({ payment: 1 }, { unique: true });
unifiedReceiptSchema.index({ receiptType: 1 });
unifiedReceiptSchema.index({ student: 1 });
unifiedReceiptSchema.index({ user: 1 });
unifiedReceiptSchema.index({ academicYear: 1 });
unifiedReceiptSchema.index({ createdAt: -1 });
unifiedReceiptSchema.index({ "paymentDetails.paymentDate": -1 });
unifiedReceiptSchema.index({ "studentDetails.batch": 1 });
unifiedReceiptSchema.index({ "studentDetails.program": 1 });
unifiedReceiptSchema.index({ receiptType: 1, academicYear: 1 });
unifiedReceiptSchema.index({ student: 1, receiptType: 1 });

const UnifiedReceipt = mongoose.model("UnifiedReceipt", unifiedReceiptSchema);

export default UnifiedReceipt;
