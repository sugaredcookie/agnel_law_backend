import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    payload: {
      type: Object,
      required: true,
    },
    paymentId: {
      type: String,
      required: true,
      unique: true,
    },
    orderId: {
      type: String,
      required: true,
    },
    signature: {
      type: String,
      required: function () {
        return !this.isManualPayment;
      },
    },
    isManualPayment: {
      type: Boolean,
      default: false,
    },
    manualPaymentDetails: {
      paymentMode: {
        type: String,
        enum: ["cash", "cheque", "bank_transfer", "dd", "upi", "other"],
      },
      referenceNumber: String,
      paymentDate: Date,
      remarks: String,
      recordedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      recordedAt: Date,
    },
    isReversed: {
      type: Boolean,
      default: false,
    },
    reversalDetails: {
      reversedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reversedAt: Date,
      reason: String,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "application",
      index: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      index: true,
    },
    feeStructureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeStructure",
      index: true,
    },
    academicYear: {
      type: String,
      index: true,
    },
    paymentType: {
      type: String,
      enum: ["application", "student_fee", "atkt", "revaluation"],
      required: true,
      default: "application",
    },
    revalApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RevalApplication",
      index: true,
    },
    atktFormId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ATKTForm",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    installmentNumber: {
      type: Number,
    },
    isFullPayment: {
      type: Boolean,
      default: false,
    },
    amount: {
      type: Number,
    },
    dueDate: {
      type: Date,
    },
    lastReminderSent: {
      type: Date,
    },
    remindersSent: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

paymentSchema.index({ studentId: 1, feeStructureId: 1, paymentType: 1 });
paymentSchema.index({ paymentType: 1, isReversed: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ isManualPayment: 1 });

const paymentModel = mongoose.model("payment", paymentSchema);

export default paymentModel;
