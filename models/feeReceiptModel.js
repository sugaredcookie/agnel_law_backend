import mongoose from "mongoose";

const feeReceiptSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
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
    academicYear: {
      type: String,
      required: true,
    },
    receiptDetails: {
      studentName: String,
      studentId: String,
      batchName: String,
      program: String,
      department: String,
      paymentDate: {
        type: Date,
        required: true,
      },
      paymentMode: {
        type: String,
        default: "Online",
      },
      transactionId: String,
      razorpayPaymentId: String,
    },
    feeBreakdown: {
      tuitionFee: { type: Number, default: 0 },
      developmentFee: { type: Number, default: 0 },
      latePaymentPenalty: { type: Number, default: 0 },
    },
    paymentSummary: {
      totalFeeAmount: {
        type: Number,
        required: true,
      },
      amountPaid: {
        type: Number,
        required: true,
      },
      previouslyPaid: {
        type: Number,
        default: 0,
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
    institutionDetails: {
      name: {
        type: String,
        default: "Agnel's College",
      },
      address: String,
      phone: String,
      email: String,
      website: String,
      logo: String,
    },
    receiptStatus: {
      type: String,
      enum: ["generated", "viewed"],
      default: "generated",
    },
    remarks: String,
  },
  { timestamps: true },
);

feeReceiptSchema.index({ receiptNumber: 1 }, { unique: true });
feeReceiptSchema.index({ payment: 1 });
feeReceiptSchema.index({ student: 1, academicYear: 1 });
feeReceiptSchema.index({ user: 1 });
feeReceiptSchema.index({ createdAt: -1 });
feeReceiptSchema.index({ academicYear: 1 });
feeReceiptSchema.index({ "receiptDetails.batchName": 1 });
feeReceiptSchema.index({ "receiptDetails.paymentDate": -1 });
feeReceiptSchema.index({ "receiptDetails.studentName": "text", "receiptDetails.studentId": "text", receiptNumber: "text" });

const FeeReceipt = mongoose.model("FeeReceipt", feeReceiptSchema);

export default FeeReceipt;
