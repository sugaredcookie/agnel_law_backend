// Migration: Move ElectiveSession from batch -> batchGroup, remove electiveSubjects
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const mongoDBuri = process.env.MONGO_DB_URI || "mongodb://localhost:27017/data_db";

async function migrate() {
  await mongoose.connect(mongoDBuri);
  console.log("Connected to DB");

  const Batch = (await import("../models/batchesModel.js")).default;
  const BatchGroup = (await import("../models/batchGroupModel.js")).default;
  await import("../models/subjectModel.js");

  const ESCollection = mongoose.connection.collection("electivesessions");

  const sessions = await ESCollection.find({ batch: { $exists: true } }).toArray();
  console.log(`Found ${sessions.length} session(s) with legacy 'batch' field`);

  let migrated = 0;
  let groupsCreated = 0;

  for (const session of sessions) {
    const batchId = session.batch;

    let group = await BatchGroup.findOne({ batches: batchId });

    if (!group) {
      const batch = await Batch.findById(batchId);
      if (!batch) {
        console.warn(`  Session ${session._id}: batch ${batchId} not found, skipping`);
        continue;
      }
      group = await BatchGroup.create({
        groupName: `${batch.batchName} (auto-migrated)`,
        description: `Auto-created during elective session migration`,
        batches: [batchId],
        program: batch.program,
        department: batch.department,
      });
      groupsCreated++;
      console.log(`  Created batch group "${group.groupName}" for batch "${batch.batchName}"`);
    }

    await ESCollection.updateOne(
      { _id: session._id },
      {
        $set: { batchGroup: group._id },
        $unset: { batch: "", electiveSubjects: "" },
      }
    );

    migrated++;
    console.log(`  Migrated session "${session.name}" -> group "${group.groupName}"`);
  }

  // Also drop the old index on batch+status if it exists
  try {
    await ESCollection.dropIndex("batch_1_status_1");
    console.log("Dropped old batch_1_status_1 index");
  } catch {
    console.log("Old batch_1_status_1 index not found (already removed or never existed)");
  }

  console.log(`\nDone. Migrated: ${migrated}, Groups created: ${groupsCreated}`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
