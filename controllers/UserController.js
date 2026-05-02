import User from "../models/userModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  formattedDate,
  newUserStudentPasswordEmailWithLoginDetails,
  newUserStudentRegisterEmailWithLoginDetails,
  transporter,
} from "../NodeMailer.js";
import JWT_SECRET from "../config/jwtConfig.js";

const generatePassword = () => {
  return crypto.randomBytes(6).toString("hex");
};

import dotenv from "dotenv";

dotenv.config();

export const register = async (req, res) => {
  const {
    firstName,
    middleName,
    lastName,
    dateOfBirth,
    gender,
    email,
    mobile,
    isAdmin,
    pass,
  } = req.body;

  let adminIs = false;
  if (isAdmin) {
    adminIs = true;
  }
  let password = "";

  let midName = middleName;
  if (middleName === "") {
    midName = null;
  }

  if (!adminIs && !pass) {
    password = generatePassword();
  } else {
    password = pass || "Admin";
  }
  console.log(password);
  const hashedPassword = await bcrypt.hash(password, 10);
  let newUser;
  try {
    newUser = await User.create({
      firstName,
      midName,
      lastName,
      dateOfBirth,
      gender,
      email,
      mobile,
      password: hashedPassword,
      isAdmin: adminIs,
    });

    if (!adminIs) {
      try {
        const info = await transporter.sendMail({
          from: `${process.env.SMTP_COMPANY} < ${process.env.SMTP_EMAIL_USER} >`,
          to: email,
          subject: "Hey, User Register ...",
          text: "New User Register",
          html: newUserStudentRegisterEmailWithLoginDetails(
            firstName,
            email,
            password,
            formattedDate,
          ),
        });
      } catch (emailError) {
        if (newUser && newUser._id) {
          await User.findByIdAndDelete(newUser._id);
        }
        throw emailError;
      }
    }

    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error(error);
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      res.status(400).json({
        error: "Duplicate Account, Email is Already Register with us",
      });
    } else if (
      error.code === 11000 &&
      error.keyPattern &&
      error.keyPattern.mobile
    ) {
      res.status(400).json({
        error: "Duplicate Account, Mobile Number is Already Register with us",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email: email?.toLowerCase()?.trim() });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "12h",
    });
    res.status(200).json({
      message: "User logged in successfully!",
      token,
      isAdmin: user.isAdmin,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const newPassword = generatePassword();
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  try {
    let findUser = await User.findOne({ email });
    if (findUser.isAdmin) {
      return res
        .status(400)
        .json({ message: "Admin's Can not use this feature, sorry." });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { password: hashedPassword },
    );
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const info = await transporter.sendMail({
      from: `${process.env.SMTP_COMPANY} < ${process.env.SMTP_EMAIL_USER} >`,
      to: email,
      subject: "New Password",
      text: "Your new password for login",
      html: newUserStudentPasswordEmailWithLoginDetails(
        user.name,
        email,
        newPassword,
        formattedDate,
      ),
    });

    res.status(200).json({ message: "Password reset successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
