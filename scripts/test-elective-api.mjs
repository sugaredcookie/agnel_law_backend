/**
 * Test the elective selection API endpoints.
 * Run: node scripts/test-elective-api.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
dotenv.config();

const MONGO_URI = process.env.MONGO_DB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const BASE = `http://127.0.0.1:${process.env.PORT || 8001}/api/students`;

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  // Find a test student in SYLLB-A (has 3 electives)
  const student = await db.collection("students").findOne({
    "academicDetails.batch.name": "SYLLB-A",
    status: "active",
  });

  if (!student) {
    console.log("No active student in SYLLB-A");
    process.exit(1);
  }

  console.log(`Test student: ${student.studentDetails.firstName} ${student.studentDetails.lastName}`);
  console.log(`ID: ${student._id}`);
  console.log(`Batch: ${student.academicDetails.batch.name}\n`);

  // Generate a valid JWT
  const token = jwt.sign({ studentId: student._id.toString() }, JWT_SECRET, {
    expiresIn: "1h",
  });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 1. Test GET /my-profile
  console.log("=== GET /my-profile ===");
  try {
    const res = await fetch(`${BASE}/my-profile`, { headers });
    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Name: ${data.studentDetails?.firstName} ${data.studentDetails?.lastName}`);
    console.log(`Batch: ${data.academicDetails?.batch?.name}`);
    console.log(`Selected electives: ${data.selectedElectives?.length || 0}\n`);
  } catch (err) {
    console.log("ERROR:", err.message, "\n");
  }

  // 2. Test GET /my-electives
  console.log("=== GET /my-electives ===");
  let electiveIds = [];
  try {
    const res = await fetch(`${BASE}/my-electives`, { headers });
    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Batch: ${data.batch?.batchName}`);
    console.log(`Available electives (${data.electives?.length}):`);
    for (const e of data.electives || []) {
      console.log(`  - ${e._id} | ${e.subjectName} (${e.subjectCode})`);
      electiveIds.push(e._id);
    }
    console.log(`Already selected: [${data.selectedElectives?.join(", ")}]\n`);
  } catch (err) {
    console.log("ERROR:", err.message, "\n");
  }

  // 3. Test POST /my-electives (select first elective)
  if (electiveIds.length > 0) {
    console.log("=== POST /my-electives ===");
    const selection = [electiveIds[0]]; // Select just the first one
    console.log(`Submitting: [${selection.join(", ")}]`);
    try {
      const res = await fetch(`${BASE}/my-electives`, {
        method: "POST",
        headers,
        body: JSON.stringify({ subjectIds: selection }),
      });
      const data = await res.json();
      console.log(`Status: ${res.status}`);
      console.log(`Message: ${data.message}`);
      console.log(`Saved electives: ${data.selectedElectives?.length}\n`);
    } catch (err) {
      console.log("ERROR:", err.message, "\n");
    }

    // 4. Verify it was saved
    console.log("=== Verify: GET /my-electives ===");
    try {
      const res = await fetch(`${BASE}/my-electives`, { headers });
      const data = await res.json();
      console.log(`Selected after save: [${data.selectedElectives?.join(", ")}]`);
    } catch (err) {
      console.log("ERROR:", err.message, "\n");
    }

    // 5. Clean up - remove selection
    console.log("\n=== Cleanup: reverting selection ===");
    await db.collection("students").updateOne(
      { _id: student._id },
      { $unset: { selectedElectives: "" } }
    );
    console.log("Cleared selectedElectives for test student.");
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
