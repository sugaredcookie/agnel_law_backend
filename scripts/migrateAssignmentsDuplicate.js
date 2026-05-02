/**
 * Migration script that DUPLICATES assignments for each batch they belong to.
 * 
 * Run with: node scripts/migrateAssignmentsDuplicate.js
 * 
 * This is recommended when same subject exists in multiple batches (A/B divisions)
 * and faculty intended the assignment for all divisions.
 * 
 * What this script does:
 * 1. Finds assignments without batch.id
 * 2. Looks up which batches have the subject
 * 3. Creates a copy of the assignment for EACH batch
 * 4. Deletes the original assignment without batch
 * 5. Reports orphaned assignments (subject not in any batch) for manual deletion
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Assignment from "../models/assignmentModel.js";
import Batch from "../models/batchesModel.js";

dotenv.config();

const MONGODB_URI = process.env.MONGO_DB_URI;

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

async function findBatchesForSubject(subjectId) {
  const batches = await Batch.find({ subjects: subjectId });
  return batches;
}

async function migrateAssignments() {
  console.log("\n========== DUPLICATING ASSIGNMENTS FOR BATCHES ==========\n");

  const assignmentsWithoutBatch = await Assignment.find({
    $or: [
      { "batch.id": { $exists: false } },
      { "batch.id": null },
      { batch: { $exists: false } },
    ],
  });

  console.log(`Found ${assignmentsWithoutBatch.length} assignments without batch info\n`);

  const orphaned = [];
  let duplicated = 0;
  let totalCreated = 0;
  let deleted = 0;

  for (const assignment of assignmentsWithoutBatch) {
    const subjectId = assignment.subject?.id;

    if (!subjectId) {
      console.log(`[SKIP] "${assignment.title}" - No subject ID`);
      orphaned.push({
        id: assignment._id,
        title: assignment.title,
        reason: "No subject ID",
      });
      continue;
    }

    const batches = await findBatchesForSubject(subjectId);

    if (batches.length === 0) {
      console.log(`[ORPHAN] "${assignment.title}" - Subject not in any batch`);
      orphaned.push({
        id: assignment._id,
        title: assignment.title,
        subject: assignment.subject.name,
        reason: "Subject not found in any batch",
      });
      continue;
    }

    // Create a copy for each batch
    console.log(`\n[DUPLICATE] "${assignment.title}" -> ${batches.length} batches:`);
    
    for (const batch of batches) {
      const newAssignment = {
        title: assignment.title,
        description: assignment.description,
        subject: assignment.subject,
        batch: {
          id: batch._id,
          name: batch.batchName,
        },
        dueDate: assignment.dueDate,
        fileUrl: assignment.fileUrl,
        fileName: assignment.fileName,
        publicId: assignment.publicId,
        type: assignment.type,
        faculty: assignment.faculty,
        submissions: [], // Don't copy submissions - they would be invalid for other batches
        createdAt: assignment.createdAt,
        updatedAt: new Date(),
      };

      await Assignment.create(newAssignment);
      console.log(`   + Created for: ${batch.batchName}`);
      totalCreated++;
    }

    // Delete original assignment without batch
    await Assignment.findByIdAndDelete(assignment._id);
    console.log(`   - Deleted original (no batch)`);
    deleted++;
    duplicated++;
  }

  console.log("\n========== MIGRATION SUMMARY ==========");
  console.log(`Original assignments processed: ${assignmentsWithoutBatch.length}`);
  console.log(`Duplicated to batches: ${duplicated}`);
  console.log(`New assignments created: ${totalCreated}`);
  console.log(`Originals deleted: ${deleted}`);
  console.log(`Orphaned (need manual review): ${orphaned.length}`);

  return orphaned;
}

async function printOrphanedItems(orphaned) {
  if (orphaned.length === 0) {
    console.log("\n[SUCCESS] All assignments have been migrated!");
    return;
  }

  console.log("\n========== ORPHANED ASSIGNMENTS ==========");
  console.log("These assignments have subjects not linked to any batch.");
  console.log("You may want to DELETE them or fix the subject-batch linkage:\n");

  for (const item of orphaned) {
    console.log(`  ID: ${item.id}`);
    console.log(`  Title: ${item.title}`);
    if (item.subject) console.log(`  Subject: ${item.subject}`);
    console.log(`  Reason: ${item.reason}`);
    console.log("");
  }

  console.log("To DELETE orphaned assignments:");
  console.log(`
db.assignments.deleteMany({
  _id: { $in: [
    ${orphaned.map((o) => `ObjectId("${o.id}")`).join(",\n    ")}
  ]}
})
`);
}

async function main() {
  console.log("=================================================");
  console.log("  Assignment Duplication Migration Script");
  console.log("=================================================");
  console.log("This will create separate copies for each batch.\n");

  await connectDB();

  const orphaned = await migrateAssignments();
  await printOrphanedItems(orphaned);

  console.log("\n=================================================");
  console.log("  Migration Complete");
  console.log("=================================================\n");

  await mongoose.disconnect();
  console.log("Disconnected from MongoDB");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
