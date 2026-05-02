import nonTeachingStaffModel from "../models/nonTeachingStaffModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  transporter,
  newUserNonTeachingStaffRegisterEmailWithLoginDetails,
  formattedDate,
} from "../NodeMailer.js";
import JWT_SECRET from "../config/jwtConfig.js";
import {
  createWorkbook,
  createStandardWorksheet,
  sendExcelResponse,
} from "../utils/excelHelper.js";

const generatePassword = () => {
  return crypto.randomBytes(6).toString("hex");
};

export const forgotNonTeachingStaffPassword = async (req, res) => {
  const { email } = req.body;
  const newPassword = generatePassword();
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  try {
    let staff = await nonTeachingStaffModel.findOne({ email });
    if (!staff) {
      return res.status(400).json({ message: "Staff not found" });
    }
    
    staff.password = hashedPassword;
    await staff.save();

    await transporter.sendMail({
      from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: "Password Reset - Non-Teaching Staff - Agnel School of Law",
      text: `Your new password is: ${newPassword}`,
      html: `<p>Your new password is: <b>${newPassword}</b></p>`,
    });
    
    res.json({ message: "New password sent to your email." });
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export const createNonTeachingStaff = async (req, res) => {
  try {
    const { name, designation, salary, email, salaryDisbursementDate } = req.body;
    
    const uniqueId = uuidv4();
    const password = generatePassword();
    console.log(password);
    const hashedPassword = await bcrypt.hash(password, 10);

    const staff = new nonTeachingStaffModel({
      name,
      designation,
      salary,
      email,
      salaryDisbursementDate,
      password: hashedPassword,
      uniqueId,
    });

    await staff.save();

    // Send email with login details
    try {
      await transporter.sendMail({
        from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
        to: staff.email,
        subject: `Welcome ${staff.name} - Non-Teaching Staff Registration`,
        html: newUserNonTeachingStaffRegisterEmailWithLoginDetails(
          staff.name,
          staff.email,
          password,
          formattedDate,
        ),
      });
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
    }

    res.json({ 
      message: "Non-teaching staff created successfully",
      staff: {
        _id: staff._id,
        name: staff.name,
        designation: staff.designation,
        email: staff.email,
        salary: staff.salary,
        salaryDisbursementDate: staff.salaryDisbursementDate,
        uniqueId: staff.uniqueId
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: error.message });
  }
};

export const nonTeachingStaffLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const staff = await nonTeachingStaffModel.findOne({ email });
    if (!staff) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { nonTeachingStaffId: staff._id, role: "non-teaching-staff" },
      JWT_SECRET,
      {
        expiresIn: "12h",
      },
    );
    
    res.status(200).json({
      token,
      data: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        designation: staff.designation,
        salary: staff.salary,
        salaryDisbursementDate: staff.salaryDisbursementDate,
        uniqueId: staff.uniqueId,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

export const updateNonTeachingStaffById = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, designation, salary, email, salaryDisbursementDate } = req.body;

    const staff = await nonTeachingStaffModel.findByIdAndUpdate(
      id,
      { name, designation, salary, email, salaryDisbursementDate },
      { new: true },
    );

    if (!staff) {
      return res.status(404).json({ error: "Staff not found" });
    }

    res.json({ staff });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: error.message });
  }
};

export const deleteNonTeachingStaffById = async (req, res) => {
  try {
    const { id } = req.params;

    const staff = await nonTeachingStaffModel.findByIdAndDelete(id);

    if (!staff) {
      return res.status(404).json({ error: "Staff not found" });
    }

    res.json({ message: "Staff deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllNonTeachingStaff = async (req, res) => {
  try {
    const staff = await nonTeachingStaffModel.find();
    res.json({ staff });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getNonTeachingStaffById = async (req, res) => {
  try {
    const { id } = req.params;

    const staff = await nonTeachingStaffModel.findById(id);

    if (!staff) {
      return res.status(404).json({ error: "Staff not found" });
    }

    res.json({ staff });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const mailNonTeachingStaffLoginDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const staff = await nonTeachingStaffModel.findById(id);
    
    if (!staff) {
      return res.status(404).json({ error: "Staff not found" });
    }
    
    const password = generatePassword();
    console.log(password);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const updatedStaff = await nonTeachingStaffModel.findByIdAndUpdate(id, {
      password: hashedPassword,
    });
    
    const info = await transporter.sendMail({
      from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
      to: staff.email,
      subject: `Hey, ${staff.name} - Non-Teaching Staff Login Details`,
      text: "Non-Teaching Staff Login Details",
      html: newUserNonTeachingStaffRegisterEmailWithLoginDetails(
        staff.name,
        staff.email,
        password,
        formattedDate,
      ),
    });
    
    res.json({ message: "Login details sent successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

export const downloadNonTeachingStaffExcel = async (req, res) => {
  try {
    const staff = await nonTeachingStaffModel.find({});

    const headers = [
      { label: "Name", key: "name", width: 25 },
      { label: "Designation", key: "designation", width: 20 },
      { label: "Email", key: "email", width: 30 },
      { label: "Salary", key: "salary", width: 15 },
      { label: "Salary Disbursement Date", key: "salaryDisbursementDate", width: 25 },
      { label: "Unique ID", key: "uniqueId", width: 20 },
    ];

    const data = staff.map((member) => ({
      name: member?.name || "",
      designation: member?.designation || "",
      email: member?.email || "",
      salary: member?.salary || "",
      salaryDisbursementDate: member?.salaryDisbursementDate || "",
      uniqueId: member?.uniqueId || "",
    }));

    const workbook = createWorkbook();
    createStandardWorksheet(workbook, "NonTeachingStaff", headers, data);

    await sendExcelResponse(res, workbook, "non_teaching_staff.xlsx");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateNonTeachingStaffFromExcel = async (req, res) => {
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
          let staff = await nonTeachingStaffModel.findOne({
            $or: [{ email: row["Email"] }],
          });

          const staffData = {
            name: row["Name"],
            designation: row["Designation"],
            email: row["Email"],
            salary: row["Salary"],
            salaryDisbursementDate: row["Salary Disbursement Date"],
          };

          if (staff) {
            Object.assign(staff, staffData);
            await staff.save();
            stats.updated++;
          } else {
            const password = generatePassword();
            const hashedPassword = await bcrypt.hash(password, 10);
            const uniqueId = uuidv4();

            const newStaff = new nonTeachingStaffModel({
              ...staffData,
              uniqueId,
              password: hashedPassword,
            });

            await newStaff.save();

            await transporter.sendMail({
              from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
              to: newStaff.email,
              subject: "Non-Teaching Staff Registration Details",
              html: newUserNonTeachingStaffRegisterEmailWithLoginDetails(
                newStaff.name,
                newStaff.email,
                password,
                formattedDate,
              ),
            });

            stats.created++;
          }
        } catch (error) {
          console.error(`Error processing staff row:`, error);
          stats.failed++;
        }
      }
      console.log("Excel processing completed");

      res.json({
        message: `Processed ${results.length} staff records`,
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