import cron from "node-cron";
import paymentModel from "../models/paymentModel.js";
import applicationModel from "../models/applicationModel.js";
import userModel from "../models/userModel.js";
import InstallmentSettings from "../models/installmentSettingsModel.js";
import {
  transporter,
  paymentReminderUpcoming,
  paymentReminderDueToday,
  paymentReminderOverdue,
} from "../NodeMailer.js";

const calculateDaysBetween = (date1, date2) => {
  const diffTime = Math.abs(date2 - date1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const formatDate = (date) => {
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const generatePaymentLink = (applicationId, installmentNumber) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/forms?action=pay&app=${applicationId}&installment=${installmentNumber}`;
};

const sendUpcomingReminders = async () => {
  try {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const upcomingPayments = await paymentModel.find({
      paymentType: "application",
      dueDate: {
        $gte: new Date(sevenDaysFromNow.getTime() - 24 * 60 * 60 * 1000),
        $lte: new Date(sevenDaysFromNow.getTime() + 24 * 60 * 60 * 1000),
      },
      installmentNumber: { $exists: true, $gt: 1 },

      _id: {
        $nin: await paymentModel
          .find({
            paymentType: "application",
            paymentId: { $exists: true },
          })
          .distinct("_id"),
      },
    });

    const reminderResults = [];

    for (const payment of upcomingPayments) {
      try {
        const application = await applicationModel.findById(
          payment.applicationId,
        );
        if (!application) continue;

        const user = await userModel.findById(application.loginStudentId);
        if (!user || !user.email) continue;

        const lastReminderSent = payment.lastReminderSent;
        if (
          lastReminderSent &&
          calculateDaysBetween(new Date(), lastReminderSent) < 3
        ) {
          continue;
        }

        const paymentLink = generatePaymentLink(
          application._id,
          payment.installmentNumber,
        );
        const dueDate = formatDate(payment.dueDate);

        const emailHtml = paymentReminderUpcoming(
          `${application.studentDetails.firstName} ${application.studentDetails.lastName}`,
          application.applicationNumber,
          `${payment.installmentNumber} of 2`,
          payment.payload?.amount ? payment.payload.amount / 100 : 0,
          dueDate,
          paymentLink,
        );

        await transporter.sendMail({
          from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
          to: user.email,
          subject: "Payment Reminder - Due Soon",
          html: emailHtml,
        });

        await paymentModel.findByIdAndUpdate(payment._id, {
          lastReminderSent: new Date(),
          $inc: { remindersSent: 1 },
        });

        reminderResults.push({
          applicationId: application._id,
          applicationNumber: application.applicationNumber,
          studentEmail: user.email,
          installment: payment.installmentNumber,
          type: "upcoming",
          status: "sent",
        });
      } catch (error) {
        console.error(
          `Error sending upcoming reminder for payment ${payment._id}:`,
          error,
        );
        reminderResults.push({
          applicationId: payment.applicationId,
          installment: payment.installmentNumber,
          type: "upcoming",
          status: "failed",
          error: error.message,
        });
      }
    }

    return {
      type: "upcoming",
      count: reminderResults.length,
      results: reminderResults,
    };
  } catch (error) {
    console.error("Error in sendUpcomingReminders:", error);
    return { type: "upcoming", count: 0, error: error.message };
  }
};

const sendDueTodayReminders = async () => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const dueTodayPayments = await paymentModel.find({
      paymentType: "application",
      dueDate: { $gte: startOfDay, $lte: endOfDay },
      installmentNumber: { $exists: true, $gt: 1 },

      _id: {
        $nin: await paymentModel
          .find({
            paymentType: "application",
            paymentId: { $exists: true },
          })
          .distinct("_id"),
      },
    });

    const reminderResults = [];

    for (const payment of dueTodayPayments) {
      try {
        const application = await applicationModel.findById(
          payment.applicationId,
        );
        if (!application) continue;

        const user = await userModel.findById(application.loginStudentId);
        if (!user || !user.email) continue;

        const paymentLink = generatePaymentLink(
          application._id,
          payment.installmentNumber,
        );

        const emailHtml = paymentReminderDueToday(
          `${application.studentDetails.firstName} ${application.studentDetails.lastName}`,
          application.applicationNumber,
          `${payment.installmentNumber} of 2`,
          payment.payload?.amount ? payment.payload.amount / 100 : 0,
          paymentLink,
        );

        await transporter.sendMail({
          from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
          to: user.email,
          subject: "Payment Due Today - Immediate Action Required",
          html: emailHtml,
        });

        await paymentModel.findByIdAndUpdate(payment._id, {
          lastReminderSent: new Date(),
          $inc: { remindersSent: 1 },
        });

        reminderResults.push({
          applicationId: application._id,
          applicationNumber: application.applicationNumber,
          studentEmail: user.email,
          installment: payment.installmentNumber,
          type: "due_today",
          status: "sent",
        });
      } catch (error) {
        console.error(
          `Error sending due today reminder for payment ${payment._id}:`,
          error,
        );
        reminderResults.push({
          applicationId: payment.applicationId,
          installment: payment.installmentNumber,
          type: "due_today",
          status: "failed",
          error: error.message,
        });
      }
    }

    return {
      type: "due_today",
      count: reminderResults.length,
      results: reminderResults,
    };
  } catch (error) {
    console.error("Error in sendDueTodayReminders:", error);
    return { type: "due_today", count: 0, error: error.message };
  }
};

const sendOverdueReminders = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overduePayments = await paymentModel.find({
      paymentType: "application",
      dueDate: { $lt: today },
      installmentNumber: { $exists: true, $gt: 1 },

      _id: {
        $nin: await paymentModel
          .find({
            paymentType: "application",
            paymentId: { $exists: true },
          })
          .distinct("_id"),
      },
    });

    const reminderResults = [];

    for (const payment of overduePayments) {
      try {
        const application = await applicationModel.findById(
          payment.applicationId,
        );
        if (!application) continue;

        const user = await userModel.findById(application.loginStudentId);
        if (!user || !user.email) continue;

        const daysPastDue = calculateDaysBetween(today, payment.dueDate);

        const reminderDays = [1, 3, 7, 14];
        const shouldSendReminder = reminderDays.includes(daysPastDue);

        if (!shouldSendReminder) continue;

        const lastReminderSent = payment.lastReminderSent;
        if (
          lastReminderSent &&
          calculateDaysBetween(new Date(), lastReminderSent) < 1
        ) {
          continue;
        }

        const paymentLink = generatePaymentLink(
          application._id,
          payment.installmentNumber,
        );

        const emailHtml = paymentReminderOverdue(
          `${application.studentDetails.firstName} ${application.studentDetails.lastName}`,
          application.applicationNumber,
          `${payment.installmentNumber} of 2`,
          payment.payload?.amount ? payment.payload.amount / 100 : 0,
          daysPastDue,
          paymentLink,
        );

        const subjectPrefix = daysPastDue >= 7 ? "URGENT: " : "";

        await transporter.sendMail({
          from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
          to: user.email,
          subject: `${subjectPrefix}Payment Overdue - ${daysPastDue} Day${daysPastDue > 1 ? "s" : ""} Past Due`,
          html: emailHtml,
        });

        await paymentModel.findByIdAndUpdate(payment._id, {
          lastReminderSent: new Date(),
          $inc: { remindersSent: 1 },
        });

        reminderResults.push({
          applicationId: application._id,
          applicationNumber: application.applicationNumber,
          studentEmail: user.email,
          installment: payment.installmentNumber,
          daysPastDue: daysPastDue,
          type: "overdue",
          status: "sent",
        });
      } catch (error) {
        console.error(
          `Error sending overdue reminder for payment ${payment._id}:`,
          error,
        );
        reminderResults.push({
          applicationId: payment.applicationId,
          installment: payment.installmentNumber,
          type: "overdue",
          status: "failed",
          error: error.message,
        });
      }
    }

    return {
      type: "overdue",
      count: reminderResults.length,
      results: reminderResults,
    };
  } catch (error) {
    console.error("Error in sendOverdueReminders:", error);
    return { type: "overdue", count: 0, error: error.message };
  }
};

export const sendPaymentReminders = async () => {
  console.log("Starting payment reminder cron job...");

  try {
    const globalSettings = await InstallmentSettings.findOne({
      program: null,
      isEnabled: true,
      isActive: true,
      "reminderSettings.enableReminders": true,
    });

    if (!globalSettings) {
      console.log("Payment reminders are disabled globally");
      return { status: "disabled", message: "Payment reminders are disabled" };
    }

    const [upcomingResults, dueTodayResults, overdueResults] =
      await Promise.all([
        sendUpcomingReminders(),
        sendDueTodayReminders(),
        sendOverdueReminders(),
      ]);

    const totalSent =
      (upcomingResults.count || 0) +
      (dueTodayResults.count || 0) +
      (overdueResults.count || 0);

    console.log("Payment reminder cron job completed:", {
      totalReminders: totalSent,
      upcoming: upcomingResults.count || 0,
      dueToday: dueTodayResults.count || 0,
      overdue: overdueResults.count || 0,
    });

    return {
      status: "completed",
      totalReminders: totalSent,
      results: {
        upcoming: upcomingResults,
        dueToday: dueTodayResults,
        overdue: overdueResults,
      },
    };
  } catch (error) {
    console.error("Error in payment reminder cron job:", error);
    return { status: "error", error: error.message };
  }
};

export const initPaymentReminders = () => {
  cron.schedule("0 9 * * *", sendPaymentReminders);

  console.log("Payment reminder cron job initialized - runs daily at 9:00 AM");
};
