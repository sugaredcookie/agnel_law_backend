import Examiner from "../models/examinerModel.js";
import jwt from "jsonwebtoken";
import JWT_SECRET from "../config/jwtConfig.js";

export const loginExaminer = async (req, res) => {
  const { email, password } = req.body;
  try {
    const examiner = await Examiner.findOne({ email: email?.toLowerCase()?.trim() });
    if (!examiner) {
      return res.status(400).json({ message: "Examiner not found" });
    }
    const isMatch = await examiner.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }
    const token = jwt.sign(
      { id: examiner._id, email: examiner.email, role: "examiner" },
      JWT_SECRET,
      { expiresIn: "1d" },
    );
    res.json({ message: "Login successful", token, data: examiner });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const createExaminer = async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const examiner = new Examiner({ email, password, name });
    await examiner.save();
    res.json({ message: "Examiner created", data: examiner });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
