const mongoose = require("mongoose");
require("dotenv").config();
const { Schema } = mongoose;

// Inline minimal Student schema since the project uses ESM
const studentSchema = new Schema({
  studentDetails: { firstName: String, middleName: String, lastName: String, gender: String },
  academicDetails: { rollNumber: String },
}, { collection: "students", strict: false });
const Student = mongoose.model("Student", studentSchema);

(async () => {
  const uri = process.env.MONGO_DB_URI || "mongodb://localhost:27017/data_db";
  await mongoose.connect(uri);

  // Check specific student
  const s = await Student.findOne({ "academicDetails.rollNumber": "23302" }).lean();
  if (!s) {
    console.log("NO Student record for rollNumber 23302");
  } else {
    console.log("Name:", s.studentDetails?.firstName, s.studentDetails?.lastName);
    console.log("Gender:", JSON.stringify(s.studentDetails?.gender));
    console.log("Roll:", s.academicDetails?.rollNumber);
  }

  // Stats
  const total = await Student.countDocuments();
  const withGender = await Student.countDocuments({
    "studentDetails.gender": { $exists: true, $nin: [null, ""] },
  });
  console.log("\nTotal students:", total);
  console.log("With gender:", withGender);
  console.log("Without gender:", total - withGender);

  // Sample a few students to see what gender values look like
  const samples = await Student.find({ "studentDetails.gender": { $exists: true, $nin: [null, ""] } })
    .limit(5)
    .select("studentDetails.firstName studentDetails.lastName studentDetails.gender academicDetails.rollNumber")
    .lean();
  console.log("\nSample students with gender:");
  samples.forEach((st) => {
    console.log(`  Roll: ${st.academicDetails?.rollNumber} | ${st.studentDetails?.firstName} ${st.studentDetails?.lastName} | Gender: ${st.studentDetails?.gender}`);
  });

  // Check roll 23302 range
  const near = await Student.find({
    "academicDetails.rollNumber": { $gte: "23200", $lte: "23400" }
  }).select("academicDetails.rollNumber studentDetails.firstName studentDetails.lastName studentDetails.gender").lean();
  console.log("\nStudents in 23200-23400 range:", near.length);
  near.slice(0, 10).forEach(st => {
    console.log(`  Roll: ${st.academicDetails?.rollNumber} | ${st.studentDetails?.firstName} ${st.studentDetails?.lastName} | Gender: ${st.studentDetails?.gender}`);
  });

  // Check what roll ranges exist
  const allRolls = await Student.find({}).select("academicDetails.rollNumber").lean();
  const numRolls = allRolls.map(s => parseInt(s.academicDetails?.rollNumber)).filter(n => !isNaN(n)).sort((a,b) => a-b);
  if (numRolls.length > 0) {
    console.log("\nRoll number range:", numRolls[0], "-", numRolls[numRolls.length-1]);
    // Group by prefix
    const prefixes = {};
    numRolls.forEach(r => { const p = String(r).slice(0,3); prefixes[p] = (prefixes[p]||0)+1; });
    console.log("Roll prefixes:", JSON.stringify(prefixes));
  }

  await mongoose.disconnect();
})();
