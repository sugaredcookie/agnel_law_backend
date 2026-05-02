import facultyModel from "../models/facultyModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  transporter,
  newUserFacultyRegisterEmailWithLoginDetails,
  birthdayWishesEmail,
  formattedDate,
} from "../NodeMailer.js";
import Subject from "../models/subjectModel.js";
import Batch from "../models/batchesModel.js";
import JWT_SECRET from "../config/jwtConfig.js";
import {
  createWorkbook,
  createStandardWorksheet,
  sendExcelResponse,
} from "../utils/excelHelper.js";

const generatePassword = () => {
  return crypto.randomBytes(6).toString("hex");
};

export const forgotFacultyPassword = async (req, res) => {
  const { email } = req.body;
  const newPassword = generatePassword();
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  try {
    let faculty = await facultyModel.findOne({ email });
    if (!faculty) {
      return res.status(400).json({ message: "Faculty not found" });
    }
    faculty.password = hashedPassword;
    await faculty.save();

    await transporter.sendMail({
      from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: "Password Reset - Agnel School of Law",
      text: `Your new password is: ${newPassword}`,
      html: `<p>Your new password is: <b>${newPassword}</b></p>`,
    });
    res.json({ message: "New password sent to your email." });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

export const createFaculty = async (req, res) => {
  try {
    const { facultyName, department, email, phone, dateOfBirth } = req.body;
    const uniqueId = uuidv4();
    const password = generatePassword();
    console.log(password);
    const hashedPassword = await bcrypt.hash(password, 10);

    const faculty = new facultyModel({
      facultyName,
      department,
      email,
      phone,
      dateOfBirth,
      password: hashedPassword,
      uniqueId,
    });

    await faculty.save();
    res.json({ faculty });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const facultyLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const faculty = await facultyModel.findOne({ email });
    if (!faculty) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, faculty.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { facultyId: faculty._id, role: "faculty" },
      JWT_SECRET,
      {
        expiresIn: "12h",
      },
    );
    res.status(200).json({
      token,
      data: {
        _id: faculty._id,
        facultyName: faculty.facultyName,
        email: faculty.email,
        department: faculty.department,
        phone: faculty.phone,
        dateOfBirth: faculty.dateOfBirth,
        uniqueId: faculty.uniqueId,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateFacultyById = async (req, res) => {
  try {
    const { id } = req.params;
    const { facultyName, department, email, phone, dateOfBirth } = req.body;

    const faculty = await facultyModel.findByIdAndUpdate(
      id,
      { facultyName, department, email, phone, dateOfBirth },
      { new: true },
    );

    if (!faculty) {
      return res.status(404).json({ error: "Faculty not found" });
    }

    res.json({ faculty });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteFacultyById = async (req, res) => {
  try {
    const { id } = req.params;

    const faculty = await facultyModel.findByIdAndDelete(id);

    if (!faculty) {
      return res.status(404).json({ error: "Faculty not found" });
    }

    res.json({ message: "Faculty deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllFaculties = async (req, res) => {
  try {
    const faculties = await facultyModel.find();
    res.json({ faculties });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getFacultyById = async (req, res) => {
  try {
    const { id } = req.params;

    const faculty = await facultyModel.findById(id);

    if (!faculty) {
      return res.status(404).json({ error: "Faculty not found" });
    }

    res.json({ faculty });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getFacultyDetails = async (req, res) => {
  try {
    const facultyId = req.user.facultyId;
    const subjects = await Subject.find({ faculty: facultyId });
    const batches = await Batch.find({
      subjects: { $in: subjects.map((s) => s._id) },
    });
    res.json({ subjects, batches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getFacultySubjectsByBatch = async (req, res) => {
  try {
    const facultyId = req.user.facultyId;
    const { batchId } = req.params;

    const batch = await Batch.findById(batchId).populate("subjects");
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const facultySubjects = await Subject.find({
      faculty: facultyId,
      _id: { $in: batch.subjects },
    });

    res.json({ subjects: facultySubjects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const mailFacultyLoginDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const faculty = await facultyModel.findById(id);
    if (!faculty) {
      return res.status(404).json({ error: "Faculty not found" });
    }
    const password = generatePassword();
    console.log(password);
    const hashedPassword = await bcrypt.hash(password, 10);
    const updatedFaculty = await facultyModel.findByIdAndUpdate(id, {
      password: hashedPassword,
    });
    const info = await transporter.sendMail({
      from: `${process.env.SMTP_COMPANY} < ${process.env.SMTP_EMAIL_USER} >`,
      to: faculty.email,
      subject: `Hey, ${faculty.facultyName} Register ...`,
      text: "New Faculty Register",
      html: newUserFacultyRegisterEmailWithLoginDetails(
        faculty.facultyName,
        faculty.email,
        password,
        formattedDate,
      ),
    });
    res.json({ message: "Mail sent successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

export const sendBirthdayWishesToFaculty = async () => {
  try {
    const today = new Date();

    const facultyMembers = await facultyModel.aggregate([
      {
        $match: {
          $expr: {
            $and: [
              { $eq: [{ $month: "$dateOfBirth" }, today.getMonth() + 1] },
              { $eq: [{ $dayOfMonth: "$dateOfBirth" }, today.getDate()] },
            ],
          },
        },
      },
    ]);

    for (const faculty of facultyMembers) {
      await transporter.sendMail({
        from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
        to: faculty.email,
        subject: "Happy Birthday! 🎉",
        text: "Happy Birthday!",
        html: birthdayWishesEmail(faculty.facultyName, formattedDate),
      });
      console.log(`Birthday wish sent to ${faculty.facultyName}`);
    }

    return {
      success: true,
      message: `Birthday wishes sent to ${facultyMembers.length} faculty members`,
      recipients: facultyMembers.map((f) => f.facultyName),
    };
  } catch (error) {
    console.error("Error sending birthday wishes to faculty:", error);
    return {
      success: false,
      message: error.message,
    };
  }
};

export const downloadFacultiesExcel = async (req, res) => {
  try {
    const faculties = await facultyModel.find({});

    const headers = [
      { label: "Faculty Name", key: "facultyName", width: 25 },
      { label: "Department", key: "department", width: 20 },
      { label: "Email", key: "email", width: 30 },
      { label: "Phone", key: "phone", width: 15 },
      { label: "Unique ID", key: "uniqueId", width: 20 },
      { label: "Date of Birth", key: "dateOfBirth", width: 15 },
    ];

    const data = faculties.map((faculty) => ({
      facultyName: faculty?.facultyName || "",
      department: faculty?.department || "",
      email: faculty?.email || "",
      phone: faculty?.phone || "",
      uniqueId: faculty?.uniqueId || "",
      dateOfBirth: faculty?.dateOfBirth
        ? new Date(faculty.dateOfBirth).toLocaleDateString()
        : "",
    }));

    const workbook = createWorkbook();
    createStandardWorksheet(workbook, "Faculties", headers, data);

    await sendExcelResponse(res, workbook, "faculties.xlsx");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateFacultiesFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return res
        .status(400)
        .json({ message: "No worksheet found in the file" });
    }

    const results = [];
    const headers = [];

    worksheet.getRow(1).eachCell((cell) => {
      headers.push(cell.value);
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        if (Object.keys(rowData).length > 0) {
          results.push(rowData);
        }
      }
    });

    const stats = { updated: 0, created: 0, failed: 0, skipped: 0 };

    try {
      for (const row of results) {
        try {
          let faculty = await facultyModel.findOne({
            $or: [{ email: row["Email"] }, { phone: row["Phone"] }],
          });

          const facultyData = {
            facultyName: row["Faculty Name"],
            department: row["Department"],
            email: row["Email"],
            phone: row["Phone"],
            dateOfBirth: row["Date of Birth"]
              ? new Date(row["Date of Birth"])
              : undefined,
          };

          if (faculty) {
            Object.assign(faculty, facultyData);
            await faculty.save();
            stats.updated++;
          } else {
            const password = generatePassword();
            const hashedPassword = await bcrypt.hash(password, 10);
            const uniqueId = uuidv4();

            const newFaculty = new facultyModel({
              ...facultyData,
              uniqueId,
              password: hashedPassword,
            });

            await newFaculty.save();

            await transporter.sendMail({
              from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
              to: newFaculty.email,
              subject: "Faculty Registration Details",
              html: newUserFacultyRegisterEmailWithLoginDetails(
                newFaculty.facultyName,
                newFaculty.email,
                password,
                formattedDate,
              ),
            });

            stats.created++;
          }
        } catch (error) {
          console.error(`Error processing faculty row:`, error);
          stats.failed++;
        }
      }
      console.log("Excel processing completed");

      res.json({
        message: `Processed ${results.length} faculty records`,
        stats: {
          total: results.length,
          updated: stats.updated,
          created: stats.created,
          failed: stats.failed,
          skipped: stats.skipped,
        },
      });
    } catch (error) {
      console.error("Error processing Excel data:", error);
      res.status(500).json({
        message: "Error processing Excel data",
        error: error.message,
      });
    }
  } catch (error) {
    console.error("Error handling Excel upload:", error);
    res.status(500).json({
      message: "Error handling Excel upload",
      error: error.message,
    });
  }
};
