import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import applicationRouter from "./routes/applicationRoutes.js";
import dotenv from "dotenv";
import userRouter from "./routes/userRoutes.js";
import authMiddleware, {
  facultyAuthMiddleware,
} from "./middlewares/AuthMiddleware.js";
import path from "path";
import { fileURLToPath } from "url";
import leadCaptureRouter from "./routes/leadCaptureRoutes.js";
import paymentRouter from "./routes/paymentsRoutes.js";
import landingPageRouter from "./routes/landingPageRoutes.js";
import departmentRouter from "./routes/departmentRoutes.js";
import programRouter from "./routes/programRoutes.js";
import batchRouter from "./routes/batchRoutes.js";
import facultyRouter from "./routes/facultyRoutes.js";
import subjectRouter from "./routes/subjectRoutes.js";
import gradeRouter from "./routes/gradeSchemeRoutes.js";
import examinerRoutes from "./routes/examinerRoutes.js";
import eventRouter from "./routes/eventRoutes.js";
import { notificationEmail, transporter } from "./NodeMailer.js";
import feedbackRouter from "./routes/feedbackRoutes.js";
import attendanceRouter from "./routes/attendanceRoutes.js";
import assignmentRouter from "./routes/assignmentRoutes.js";
import reportCardRouter from "./routes/reportCardRoutes.js";
import feeRouter from "./routes/feeRoutes.js";
import { initBirthdayWishes } from "./cron/birthdayWishes.js";
import { initPaymentReminders } from "./cron/paymentReminders.js";
import { initElectiveSessionCron } from "./cron/electiveSessions.js";
import receiptRouter from "./routes/receiptRoutes.js";
import studentRouter from "./routes/studentRoutes.js";
import rubricsRouter from "./routes/rubricsRoutes.js";
import groupbyStudentsRouter from "./routes/groupbyStudentsRoutes.js";
import noteRouter from "./routes/noteRoutes.js";
import atktRouter from "./routes/atktRoutes.js";
import atktSessionRouter from "./routes/atktSessionRoutes.js";
import regularExamRouter from "./routes/regularExamRoutes.js";
import examResultRouter from "./routes/examResultRoutes.js";
import batchGroupRouter from "./routes/batchGroupRoutes.js";
import revalRouter from "./routes/revalRoutes.js";
import revalSessionRouter from "./routes/revalSessionRoutes.js";
import leaveRouter from "./routes/leaveRoutes.js";
import nonTeachingStaffRouter from "./routes/nonTeachingStaffRoutes.js";
import multiResultRouter from "./routes/multiResultRoutes.js";
import resultConfigRouter from "./routes/resultConfigRoutes.js";
import profileRequestRouter from "./routes/profileRequestRoutes.js";
import electiveSessionRouter from "./routes/electiveSessionRoutes.js";
import markChangeRequestRouter from "./routes/markChangeRequestRoutes.js";
// [REMOVED] preloadAll + ResultConfig import -- no longer needed after Excel→DB migration

dotenv.config();

const PORT = process.env.PORT || 8000;
const mongoDBuri =
  process.env.MONGO_DB_URI || "mongodb://localhost:27017/data_db";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const cors = require("cors");

const allowedOrigins = [
  "https://lms.raphaedu.com",
  "https://law.raphaedu.com",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:8001",
  "https://agnel-law-frontend.vercel.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (Postman, mobile apps, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Explicitly handle all preflight requests
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin);
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  return res.sendStatus(204);
});

app.options("*", cors());

app.use("/api/rubrics", rubricsRouter);
app.use("/api/groupby-students", groupbyStudentsRouter);

try {
  var db = mongoose.connect(mongoDBuri, {});
  console.log("success connection");
} catch (error) {
  console.log("Error connection: " + error);
}

initBirthdayWishes();
initPaymentReminders();
initElectiveSessionCron();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.status(200).send("Welcome, Node API Server is running...");
});

app.post("/api/sendmail", async (req, res) => {
  const { recipientEmails, subject, message } = req.body;
  console.log("Sending email to:", recipientEmails);
  const info = await transporter.sendMail({
    from: `${process.env.SMTP_COMPANY} < ${process.env.SMTP_EMAIL_USER} >`,
    to: recipientEmails.join(","),
    subject,
    text: message,
    html: notificationEmail(message),
  });
  res.status(200).send("Mail Sent");
});

app.use("/api/form", authMiddleware, applicationRouter);

app.use("/api/user", userRouter);

app.use("/api/lead", facultyAuthMiddleware, leadCaptureRouter);

app.use("/api/department", facultyAuthMiddleware, departmentRouter);

app.use("/api/program", programRouter);

app.use("/api/batch", batchRouter);

app.use("/api/batch-groups", batchGroupRouter);

app.use("/api/faculty", facultyRouter);

app.use("/api/attendance", attendanceRouter);

app.use("/api/students", studentRouter);

app.use("/api/subject", subjectRouter);

app.use("/api/examiner", examinerRoutes);

app.use("/api/assignments", assignmentRouter);

app.use("/api/grade", authMiddleware, gradeRouter);

app.use("/api/reportCard", reportCardRouter);

app.use("/api/feedback", feedbackRouter);

app.use("/api/events", eventRouter);

app.use("/api/payments", paymentRouter);

app.use("/api/fees", feeRouter);

app.use("/api/receipts", receiptRouter);

app.use("/api/landing", landingPageRouter);

app.use("/api/notes", noteRouter);
app.use("/api/atkt", atktRouter);
app.use("/api/atkt-admin", atktSessionRouter);
app.use("/api/regular-exams", regularExamRouter);
app.use("/api/exam-results", examResultRouter);
app.use("/api/reval", revalRouter);
app.use("/api/reval-admin", revalSessionRouter);

app.use("/api/leaves/", leaveRouter);

app.use("/api/non-teaching-staff", nonTeachingStaffRouter);

app.use("/api/results", multiResultRouter);
app.use("/api/result-configs", resultConfigRouter);

app.use("/api/profile-requests", profileRequestRouter);

app.use("/api/elective-sessions", electiveSessionRouter);

app.use("/api/mark-change-requests", markChangeRequestRouter);

// Legacy QR code redirects — old printed QR codes point to /api/result-cards/pdf/:token
app.get("/api/result-cards/pdf/:token", (req, res) => res.redirect(301, `/api/results/pdf/${req.params.token}`));
app.get("/api/result-cards/verify/:token", (req, res) => res.redirect(301, `/api/results/verify/${req.params.token}`));

//server
app.listen(PORT, () => {
  console.log(`Server is Running on ${PORT}`);
});