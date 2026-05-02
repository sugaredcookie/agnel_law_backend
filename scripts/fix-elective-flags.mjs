/**
 * Fix: Set isElective=true on two V.Y.BA LLB subjects that are incorrectly flagged.
 * Run: node scripts/fix-elective-flags.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_DB_URI;

const FIXES = [
  { _id: new mongoose.Types.ObjectId("687a10e918ce1a5cfed6385d"), name: "Intellectual Property Law" },
  { _id: new mongoose.Types.ObjectId("687a111218ce1a5cfed638bd"), name: "Conflict of Law" },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const subjects = db.collection("subjects");

  for (const fix of FIXES) {
    const before = await subjects.findOne({ _id: fix._id });
    console.log(`BEFORE: "${before.subjectName}" => isElective=${before.isElective}`);

    const result = await subjects.updateOne(
      { _id: fix._id },
      { $set: { isElective: true } }
    );

    const after = await subjects.findOne({ _id: fix._id });
    console.log(`AFTER:  "${after.subjectName}" => isElective=${after.isElective} (matched=${result.matchedCount}, modified=${result.modifiedCount})`);
    console.log();
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
