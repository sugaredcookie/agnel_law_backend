import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import JWT_SECRET from "../config/jwtConfig.js";
import NonTeachingStaff from "../models/nonTeachingStaffModel.js";

dotenv.config();

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Decode JWT from Authorization header. Returns decoded payload or null.
 */
const decodeToken = (req, res) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ message: "No token, authorization denied" });
    return null;
  }
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
    return null;
  }
};

/**
 * Determine the effective role from a decoded JWT payload.
 * Handles legacy examiner tokens (have `id` but no `role`).
 */
export const resolveRole = (decoded) => {
  if (decoded.role) return decoded.role; // faculty, examiner, admin, non-teaching-staff
  if (decoded.studentId) return "student";
  // Legacy examiner tokens: have `id` and `email` but no role/facultyId/studentId
  if (decoded.id && !decoded.facultyId && !decoded.studentId && !decoded.userId) {
    return "examiner";
  }
  return "unknown";
};

// ─── Generic auth (any valid JWT) ──────────────────────────────

const authMiddleware = (req, res, next) => {
  const decoded = decodeToken(req, res);
  if (!decoded) return;
  req.user = decoded;
  req.user._resolvedRole = resolveRole(decoded);
  next();
};

export default authMiddleware;

// ─── Faculty or Admin ──────────────────────────────────────────

export const facultyAuthMiddleware = (req, res, next) => {
  const decoded = decodeToken(req, res);
  if (!decoded) return;
  const role = resolveRole(decoded);
  if (role !== "faculty" && role !== "admin") {
    return res.status(403).json({ message: "Access denied: Faculty or Admin only" });
  }
  req.user = decoded;
  req.user._resolvedRole = role;
  next();
};

// ─── Examiner or Admin ─────────────────────────────────────────

export const examinerAuthMiddleware = (req, res, next) => {
  const decoded = decodeToken(req, res);
  if (!decoded) return;
  const role = resolveRole(decoded);
  if (role !== "examiner" && role !== "admin") {
    return res.status(403).json({ message: "Access denied: Examiner or Admin only" });
  }
  req.user = decoded;
  req.user._resolvedRole = role;
  next();
};

// ─── Student or Admin ──────────────────────────────────────────

export const studentAuthMiddleware = (req, res, next) => {
  const decoded = decodeToken(req, res);
  if (!decoded) return;
  const role = resolveRole(decoded);
  if (role !== "student" && role !== "admin") {
    return res.status(403).json({ message: "Access denied: Student or Admin only" });
  }
  req.user = decoded;
  req.user._resolvedRole = role;
  next();
};

// ─── Admin only ────────────────────────────────────────────────

export const adminAuthMiddleware = (req, res, next) => {
  const decoded = decodeToken(req, res);
  if (!decoded) return;
  const role = resolveRole(decoded);
  if (role !== "admin") {
    return res.status(403).json({ message: "Access denied: Admin only" });
  }
  req.user = decoded;
  req.user._resolvedRole = role;
  next();
};

// ─── Flexible role factory ─────────────────────────────────────

/**
 * Returns middleware that allows only the specified roles.
 * Usage: requireRole("faculty", "examiner", "admin")
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    const decoded = decodeToken(req, res);
    if (!decoded) return;
    const role = resolveRole(decoded);
    if (!roles.includes(role)) {
      return res
        .status(403)
        .json({ message: `Access denied: requires ${roles.join(" or ")}` });
    }
    req.user = decoded;
    req.user._resolvedRole = role;
    next();
  };
};

// ─── Non-teaching staff ────────────────────────────────────────

export const nonTeachingStaffAuthMiddleware = async (req, res, next) => {
  const decoded = decodeToken(req, res);
  if (!decoded) return;
  const role = resolveRole(decoded);
  if (role !== "non-teaching-staff") {
    return res.status(403).json({ message: "Access denied. Not a non-teaching staff member." });
  }
  try {
    const staff = await NonTeachingStaff.findById(decoded.nonTeachingStaffId).select("-password");
    if (!staff) {
      return res.status(401).json({ message: "Staff not found" });
    }
    req.user = { ...decoded, staffDetails: staff, _resolvedRole: role };
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};
