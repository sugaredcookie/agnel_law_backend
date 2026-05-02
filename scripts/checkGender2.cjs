const mongoose = require("mongoose");
require("dotenv").config();
const { Schema } = mongoose;

const studentSchema = new Schema({
  studentDetails: { firstName: String, middleName: String, lastName: String, gender: String },
  academicDetails: { rollNumber: String },
}, { collection: "students", strict: false });
const Student = mongoose.model("Student", studentSchema);

(async () => {
  const uri = process.env.MONGO_DB_URI || "mongodb://localhost:27017/data_db";
  await mongoose.connect(uri);

  const s = await Student.findOne({ "academicDetails.rollNumber": "A23506" }).lean();
  if (!s) {
    console.log("NOT FOUND: A23506");
  } else {
    console.log("Found A23506:", s.studentDetails?.firstName, s.studentDetails?.lastName);
    console.log("Gender value:", JSON.stringify(s.studentDetails?.gender));
    console.log("Gender type:", typeof s.studentDetails?.gender);
  }

  // Also try regex to find any roll containing 23506
  const regex = await Student.find({
    "academicDetails.rollNumber": { $regex: "23506" }
  }).select("academicDetails.rollNumber studentDetails.firstName studentDetails.gender").lean();
  console.log("\nAll records containing 23506:");
  regex.forEach(st => {
    console.log("  Roll:", st.academicDetails?.rollNumber, "| Name:", st.studentDetails?.firstName, "| Gender:", JSON.stringify(st.studentDetails?.gender));
  });

  await mongoose.disconnect();
})();
