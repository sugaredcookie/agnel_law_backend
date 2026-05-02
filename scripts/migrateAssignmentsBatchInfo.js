/**
 * Migration script to add batch info to existing assignments and notes
 * that don't have proper batch associations.
 * 
 * Run with: node scripts/migrateAssignmentsBatchInfo.js
 * 
 * What this script does:
 * 1. Finds assignments/notes without batch.id
 * 2. Looks up which batches have the subject
 * 3. If only one batch found, auto-assigns it
 * 4. If multiple batches found, reports for manual resolution
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Assignment from "../models/assignmentModel.js";
import Note from "../models/noteModel.js";
import Batch from "../models/batchesModel.js";
import Subject from "../models/subjectModel.js";

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
  console.log("\n========== MIGRATING ASSIGNMENTS ==========\n");

  // Find assignments without batch.id
  const assignmentsWithoutBatch = await Assignment.find({
    $or: [
      { "batch.id": { $exists: false } },
      { "batch.id": null },
      { batch: { $exists: false } },
    ],
  });

  console.log(`Found ${assignmentsWithoutBatch.length} assignments without batch info\n`);

  const needsManualReview = [];
  let autoFixed = 0;
  let failed = 0;

  for (const assignment of assignmentsWithoutBatch) {
    const subjectId = assignment.subject?.id;

    if (!subjectId) {
      console.log(`- Assignment "${assignment.title}" has no subject ID, skipping...`);
      failed++;
      continue;
    }

    const batches = await findBatchesForSubject(subjectId);

    if (batches.length === 0) {
      console.log(`- Assignment "${assignment.title}" - Subject not found in any batch`);
      needsManualReview.push({
        id: assignment._id,
        title: assignment.title,
        subject: assignment.subject.name,
        reason: "Subject not found in any batch",
      });
      continue;
    }

    if (batches.length === 1) {
      // Auto-assign the single batch
      const batch = batches[0];
      await Assignment.findByIdAndUpdate(assignment._id, {
        "batch.id": batch._id,
        "batch.name": batch.batchName,
      });
      console.log(`+ Auto-fixed: "${assignment.title}" -> ${batch.batchName}`);
      autoFixed++;
    } else {
      // Multiple batches - needs manual review
      console.log(`? Assignment "${assignment.title}" - Found in ${batches.length} batches:`);
      batches.forEach((b) => console.log(`    - ${b.batchName}`));
      needsManualReview.push({
        id: assignment._id,
        title: assignment.title,
        subject: assignment.subject.name,
        reason: `Subject found in ${batches.length} batches`,
        batches: batches.map((b) => ({ id: b._id, name: b.batchName })),
      });
    }
  }

  console.log("\n--- ASSIGNMENT MIGRATION SUMMARY ---");
  console.log(`Total without batch: ${assignmentsWithoutBatch.length}`);
  console.log(`Auto-fixed: ${autoFixed}`);
  console.log(`Needs manual review: ${needsManualReview.length}`);
  console.log(`Failed (no subject): ${failed}`);

  return needsManualReview;
}

async function migrateNotes() {
  console.log("\n========== MIGRATING NOTES ==========\n");

  // Find notes without batch.id (notes should always have batch since model requires it)
  const notesWithoutBatch = await Note.find({
    $or: [
      { "batch.id": { $exists: false } },
      { "batch.id": null },
      { batch: { $exists: false } },
    ],
  });

  console.log(`Found ${notesWithoutBatch.length} notes without batch info\n`);

  const needsManualReview = [];
  let autoFixed = 0;
  let failed = 0;

  for (const note of notesWithoutBatch) {
    const subjectId = note.subject?.id;

    if (!subjectId) {
      console.log(`- Note "${note.title}" has no subject ID, skipping...`);
      failed++;
      continue;
    }

    const batches = await findBatchesForSubject(subjectId);

    if (batches.length === 0) {
      console.log(`- Note "${note.title}" - Subject not found in any batch`);
      needsManualReview.push({
        id: note._id,
        title: note.title,
        subject: note.subject.name,
        reason: "Subject not found in any batch",
      });
      continue;
    }

    if (batches.length === 1) {
      const batch = batches[0];
      await Note.findByIdAndUpdate(note._id, {
        "batch.id": batch._id,
        "batch.name": batch.batchName,
      });
      console.log(`+ Auto-fixed: "${note.title}" -> ${batch.batchName}`);
      autoFixed++;
    } else {
      console.log(`? Note "${note.title}" - Found in ${batches.length} batches:`);
      batches.forEach((b) => console.log(`    - ${b.batchName}`));
      needsManualReview.push({
        id: note._id,
        title: note.title,
        subject: note.subject.name,
        reason: `Subject found in ${batches.length} batches`,
        batches: batches.map((b) => ({ id: b._id, name: b.batchName })),
      });
    }
  }

  console.log("\n--- NOTE MIGRATION SUMMARY ---");
  console.log(`Total without batch: ${notesWithoutBatch.length}`);
  console.log(`Auto-fixed: ${autoFixed}`);
  console.log(`Needs manual review: ${needsManualReview.length}`);
  console.log(`Failed (no subject): ${failed}`);

  return needsManualReview;
}

async function printManualReviewItems(assignmentReview, noteReview) {
  if (assignmentReview.length === 0 && noteReview.length === 0) {
    console.log("\n[SUCCESS] All items have been migrated successfully!");
    return;
  }

  console.log("\n========== ITEMS NEEDING MANUAL REVIEW ==========\n");

  if (assignmentReview.length > 0) {
    console.log("ASSIGNMENTS:");
    console.log(JSON.stringify(assignmentReview, null, 2));
  }

  if (noteReview.length > 0) {
    console.log("\nNOTES:");
    console.log(JSON.stringify(noteReview, null, 2));
  }

  console.log("\n--- HOW TO FIX MANUALLY ---");
  console.log("For items with multiple batches, decide which batch to assign:");
  console.log(`
db.assignments.updateOne(
  { _id: ObjectId("ASSIGNMENT_ID") },
  { $set: { "batch.id": ObjectId("BATCH_ID"), "batch.name": "BATCH_NAME" } }
)
`);
}

async function main() {
  console.log("=================================================");
  console.log("  Assignment & Notes Batch Migration Script");
  console.log("=================================================\n");

  await connectDB();

  const assignmentReview = await migrateAssignments();
  const noteReview = await migrateNotes();

  await printManualReviewItems(assignmentReview, noteReview);

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
