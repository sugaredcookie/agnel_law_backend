import jwt from "jsonwebtoken";
import JWT_SECRET from "../config/jwtConfig.js";
import Faculty from "../models/facultyModel.js";
import NonTeachingStaff from "../models/nonTeachingStaffModel.js";

export const combinedAuthMiddleware = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.role === "faculty" && decoded.facultyId) {
      const faculty = await Faculty.findById(decoded.facultyId).select("-password");
      if (!faculty) {
        return res.status(401).json({ message: "Faculty not found" });
      }
      req.user = {
        ...decoded,
        facultyId: decoded.facultyId,
        userType: 'Faculty',
        userData: faculty
      };
      return next();
    }
    
    if (decoded.role === "non-teaching-staff" && decoded.nonTeachingStaffId) {
      const staff = await NonTeachingStaff.findById(decoded.nonTeachingStaffId).select("-password");
      if (!staff) {
        return res.status(401).json({ message: "Staff not found" });
      }
      req.user = {
        ...decoded,
        nonTeachingStaffId: decoded.nonTeachingStaffId,
        userType: 'NonTeachingStaff',
        userData: staff
      };
      return next();
    }
    
    if (decoded.role === "admin") {
      req.user = decoded;
      return next();
    }
    
    return res.status(403).json({ message: "Access denied. Invalid user type." });
    
  } catch (error) {
    console.error("JWT Verification Error:", error);
    res.status(401).json({ message: "Token is not valid" });
  }
};