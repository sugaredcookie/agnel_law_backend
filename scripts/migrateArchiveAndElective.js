// Migration: Add permissions to existing ArchivedStudent docs + create ElectiveSession for batches with maxElectives > 0
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const mongoDBuri = process.env.MONGO_DB_URI || "mongodb://localhost:27017/data_db";

async function migrate() {
  await mongoose.connect(mongoDBuri);
  console.log("Connected to DB");

  const ArchivedStudent = (await import("../models/archivedStudentModel.js")).default;
  const Batch = (await import("../models/batchesModel.js")).default;
  await import("../models/subjectModel.js");
  const ElectiveSession = (await import("../models/electiveSessionModel.js")).default;

  // 1. Add default permissions to all existing archived students
  const permResult = await ArchivedStudent.updateMany(
    { permissions: { $exists: false } },
    {
      $set: {
        permissions: {
          canLogin: false,
          canResetPassword: false,
          canViewResults: false,
          canViewNotes: false,
          canSelectElectives: false,
        },
      },
    },
  );
  console.log(`Archived students updated with permissions: ${permResult.modifiedCount}`);

  // 2. Create ElectiveSession for batches that have maxElectives > 0
  const batches = await Batch.find({ maxElectives: { $gt: 0 } }).populate("subjects");
  let sessionsCreated = 0;
  for (const batch of batches) {
    const existing = await ElectiveSession.findOne({ batch: batch._id });
    if (existing) {
      console.log(`Session already exists for batch ${batch.batchName}, skipping`);
      continue;
    }
    const electiveSubjects = batch.subjects.filter((s) => s.isElective).map((s) => s._id);
    await ElectiveSession.create({
      name: `${batch.batchName} Elective Selection`,
      batch: batch._id,
      status: "open",
      maxSelectionsPerStudent: batch.maxElectives,
      electiveSubjects,
      allowReselection: true,
    });
    sessionsCreated++;
    console.log(`Created session for batch ${batch.batchName} (${electiveSubjects.length} electives, max ${batch.maxElectives})`);
  }
  console.log(`\nMigration complete: ${permResult.modifiedCount} archived students, ${sessionsCreated} sessions created`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
