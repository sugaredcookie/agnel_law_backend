import mongoose from "mongoose";

const feeStructureSchema = new mongoose.Schema(
  {
    batch: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
        required: true,
      },
      name: String,
    },
    academicYear: {
      type: String,
      required: true,
    },
    fees: {
      tuitionFee: {
        type: Number,
        required: true,
        default: 0,
      },
      developmentFee: {
        type: Number,
        default: 0,
      },
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    paymentStructure: {
      allowInstallments: {
        type: Boolean,
        default: false,
      },
      installments: [
        {
          installmentNumber: {
            type: Number,
            required: true,
          },
          amount: {
            type: Number,
            required: true,
          },
          dueDate: {
            type: Date,
          },
          description: String,
        },
      ],
    },
    paymentAcceptance: {
      startDate: {
        type: Date,
        required: true,
        default: Date.now,
      },
      endDate: {
        type: Date,
        required: true,
      },
      isAcceptingPayments: {
        type: Boolean,
        default: false,
      },
      latePaymentAllowed: {
        type: Boolean,
        default: false,
      },
      latePaymentPenalty: {
        type: Number,
        default: 0,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

feeStructureSchema.index({ "batch.id": 1, academicYear: 1 });

const FeeStructure = mongoose.model("FeeStructure", feeStructureSchema);

export default FeeStructure;
