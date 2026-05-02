import InstallmentSettings from "../models/installmentSettingsModel.js";
import programModel from "../models/programModel.js";
import mongoose from "mongoose";

export const getAllInstallmentSettings = async (req, res) => {
  try {
    const { program } = req.query;

    let filter = { isActive: true };
    if (program && program !== "all") {
      filter.program = program === "global" ? null : program;
    }

    const settings = await InstallmentSettings.find(filter)
      .populate("program", "programName")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching installment settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch installment settings",
      error: error.message,
    });
  }
};

export const getInstallmentSettingsById = async (req, res) => {
  try {
    const { id } = req.params;

    const settings = await InstallmentSettings.findById(id)
      .populate("program", "programName")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Installment settings not found",
      });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching installment settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch installment settings",
      error: error.message,
    });
  }
};

export const getSettingsForProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    const { paymentType = "application" } = req.query;

    const settings = await InstallmentSettings.getSettingsForProgram(programId);

    if (!settings) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No installment settings configured for this program",
      });
    }

    const isApplicable =
      paymentType === "application"
        ? settings.applicableToApplicationFees
        : settings.applicableToStudentFees;

    const availablePlans = isApplicable
      ? settings.installmentPlans.filter((plan) => plan.breakdown.length > 0)
      : [];

    res.status(200).json({
      success: true,
      data: {
        isEnabled: settings.isEnabled && isApplicable,
        settings: settings,
        availablePlans: availablePlans,
      },
    });
  } catch (error) {
    console.error("Error fetching program installment settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch program installment settings",
      error: error.message,
    });
  }
};

export const createInstallmentSettings = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const {
      program,
      programName,
      isEnabled,
      applicableToApplicationFees,
      applicableToStudentFees,
      installmentPlans,
      reminderSettings,
    } = req.body;

    if (program && program !== null) {
      const programExists = await programModel.findById(program);
      if (!programExists) {
        return res.status(404).json({
          success: false,
          message: "Program not found",
        });
      }
    }

    const existingSettings = await InstallmentSettings.findOne({
      program: program || null,
      isActive: true,
    });

    if (existingSettings) {
      return res.status(400).json({
        success: false,
        message: program
          ? "Installment settings already exist for this program"
          : "Global installment settings already exist",
      });
    }

    for (let plan of installmentPlans) {
      const totalPercentage = plan.breakdown.reduce(
        (sum, installment) => sum + installment.percentage,
        0,
      );
      if (totalPercentage !== 100) {
        return res.status(400).json({
          success: false,
          message: `Plan "${plan.name}" percentages must add up to 100%. Current: ${totalPercentage}%`,
        });
      }
    }

    const newSettings = new InstallmentSettings({
      program: program || null,
      programName,
      isEnabled,
      applicableToApplicationFees,
      applicableToStudentFees,
      installmentPlans,
      reminderSettings,
      createdBy: adminId,
      updatedBy: adminId,
    });

    await newSettings.save();

    const populatedSettings = await InstallmentSettings.findById(
      newSettings._id,
    )
      .populate("program", "programName")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.status(201).json({
      success: true,
      message: "Installment settings created successfully",
      data: populatedSettings,
    });
  } catch (error) {
    console.error("Error creating installment settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create installment settings",
      error: error.message,
    });
  }
};

export const updateInstallmentSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id || req.user._id;
    const updateData = req.body;

    if (updateData.installmentPlans) {
      for (let plan of updateData.installmentPlans) {
        const totalPercentage = plan.breakdown.reduce(
          (sum, installment) => sum + installment.percentage,
          0,
        );
        if (totalPercentage !== 100) {
          return res.status(400).json({
            success: false,
            message: `Plan "${plan.name}" percentages must add up to 100%. Current: ${totalPercentage}%`,
          });
        }
      }
    }

    updateData.updatedBy = adminId;

    const updatedSettings = await InstallmentSettings.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    )
      .populate("program", "programName")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!updatedSettings) {
      return res.status(404).json({
        success: false,
        message: "Installment settings not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Installment settings updated successfully",
      data: updatedSettings,
    });
  } catch (error) {
    console.error("Error updating installment settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update installment settings",
      error: error.message,
    });
  }
};

export const deleteInstallmentSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id || req.user._id;

    const deletedSettings = await InstallmentSettings.findByIdAndUpdate(
      id,
      {
        $set: {
          isActive: false,
          updatedBy: adminId,
        },
      },
      { new: true },
    );

    if (!deletedSettings) {
      return res.status(404).json({
        success: false,
        message: "Installment settings not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Installment settings deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting installment settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete installment settings",
      error: error.message,
    });
  }
};

export const toggleInstallmentSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id || req.user._id;

    const settings = await InstallmentSettings.findById(id);

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Installment settings not found",
      });
    }

    const updatedSettings = await InstallmentSettings.findByIdAndUpdate(
      id,
      {
        $set: {
          isEnabled: !settings.isEnabled,
          updatedBy: adminId,
        },
      },
      { new: true },
    )
      .populate("program", "programName")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.status(200).json({
      success: true,
      message: `Installment settings ${updatedSettings.isEnabled ? "enabled" : "disabled"} successfully`,
      data: updatedSettings,
    });
  } catch (error) {
    console.error("Error toggling installment settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle installment settings",
      error: error.message,
    });
  }
};
