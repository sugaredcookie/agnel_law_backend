import mongoose from "mongoose";

const installmentSettingsSchema = new mongoose.Schema(
  {
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      default: null,
    },
    programName: {
      type: String,
      default: null,
    },

    isEnabled: {
      type: Boolean,
      default: false,
    },

    applicableToApplicationFees: {
      type: Boolean,
      default: true,
    },
    applicableToStudentFees: {
      type: Boolean,
      default: false,
    },

    installmentPlans: [
      {
        planId: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        numberOfInstallments: {
          type: Number,
          required: true,
          min: 2,
          max: 6,
        },
        breakdown: [
          {
            installmentNumber: {
              type: Number,
              required: true,
            },
            percentage: {
              type: Number,
              required: true,
              min: 1,
              max: 99,
            },
            dueAfterDays: {
              type: Number,
              required: true,
              min: 0,
              max: 365,
            },
            description: {
              type: String,
              default: "",
            },
          },
        ],
        isDefault: {
          type: Boolean,
          default: false,
        },
      },
    ],

    reminderSettings: {
      enableReminders: {
        type: Boolean,
        default: true,
      },
      reminderDays: [
        {
          daysBefore: {
            type: Number,
            required: true,
          },
          reminderType: {
            type: String,
            enum: ["upcoming", "due_today", "overdue"],
            required: true,
          },
          isActive: {
            type: Boolean,
            default: true,
          },
        },
      ],
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

installmentSettingsSchema.pre("save", function (next) {
  for (let plan of this.installmentPlans) {
    const totalPercentage = plan.breakdown.reduce(
      (sum, installment) => sum + installment.percentage,
      0,
    );
    if (totalPercentage !== 100) {
      const error = new Error(
        `Installment plan "${plan.name}" percentages must add up to 100%. Current total: ${totalPercentage}%`,
      );
      return next(error);
    }
  }
  next();
});

installmentSettingsSchema.index({ program: 1 });
installmentSettingsSchema.index({ isEnabled: 1, isActive: 1 });
installmentSettingsSchema.index({ "installmentPlans.isDefault": 1 });

installmentSettingsSchema.statics.getSettingsForProgram = async function (
  programId,
) {
  let settings = await this.findOne({
    program: programId,
    isEnabled: true,
    isActive: true,
  });

  if (!settings) {
    settings = await this.findOne({
      program: null,
      isEnabled: true,
      isActive: true,
    });
  }

  return settings;
};

installmentSettingsSchema.statics.getAvailablePlans = async function (
  programId,
  paymentType = "application",
) {
  const settings = await this.getSettingsForProgram(programId);

  if (!settings) return [];

  const isApplicable =
    paymentType === "application"
      ? settings.applicableToApplicationFees
      : settings.applicableToStudentFees;

  if (!isApplicable) return [];

  return settings.installmentPlans.filter((plan) => plan.breakdown.length > 0);
};

const InstallmentSettings = mongoose.model(
  "InstallmentSettings",
  installmentSettingsSchema,
);

export default InstallmentSettings;
