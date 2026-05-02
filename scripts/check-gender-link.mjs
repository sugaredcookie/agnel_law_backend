import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('=== DRY RUN MODE (no writes) ===\n');

await mongoose.connect(process.env.MONGO_DB_URI.trim());
const db = mongoose.connection.db;
const users = db.collection('users');
const students = db.collection('students');

// Build User _id -> gender map
const allUsers = await users.find({ gender: { $exists: true, $ne: null, $ne: '' } }).project({ gender: 1 }).toArray();
const genderMap = new Map();
allUsers.forEach(u => genderMap.set(u._id.toString(), u.gender));
console.log('Users with gender:', genderMap.size);

// Get students missing gender
const missingGender = await students.find({
  $or: [
    { 'studentDetails.gender': { $exists: false } },
    { 'studentDetails.gender': null },
    { 'studentDetails.gender': '' }
  ]
}).project({ loginStudentId: 1, 'studentDetails.firstName': 1, 'academicDetails.rollNumber': 1 }).toArray();

console.log('Students missing gender:', missingGender.length);

let updated = 0;
let skipped = 0;
for (const s of missingGender) {
  const lid = s.loginStudentId;
  if (!lid) { skipped++; continue; }
  const gender = genderMap.get(lid.toString());
  if (!gender) { skipped++; continue; }

  // Capitalize: "male" -> "Male", "female" -> "Female"
  const normalized = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();

  if (!DRY_RUN) {
    await students.updateOne({ _id: s._id }, { $set: { 'studentDetails.gender': normalized } });
  }
  updated++;
}

console.log('\nBackfilled:', updated);
console.log('Skipped (no matching User):', skipped);
if (DRY_RUN) console.log('\nRe-run WITHOUT --dry-run to apply changes.');

await mongoose.disconnect();
