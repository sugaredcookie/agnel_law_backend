import mongoose from "mongoose";
import dotenv from "dotenv";
import batchModel from "../models/batchesModel.js";
import batchGroupModel from "../models/batchGroupModel.js";

dotenv.config();

const mongoDBuri = process.env.MONGO_DB_URI || "mongodb://localhost:27017/data_db";

async function createBatchGroups() {
  try {
    await mongoose.connect(mongoDBuri);
    console.log("Connected to MongoDB");

    // Fetch all batches
    const batches = await batchModel.find({});
    console.log(`Found ${batches.length} batches\n`);

    // Group batches by their prefix (cut the last -X part)
    const groupMap = {};

    for (const batch of batches) {
      const batchName = batch.batchName;
      
      // Find the last hyphen and extract the group name
      const lastHyphenIndex = batchName.lastIndexOf("-");
      
      // No hyphen found - skip this batch
      if (lastHyphenIndex === -1) {
        console.log(`Skipping "${batchName}" - no hyphen found`);
        continue;
      }

      const suffix = batchName.substring(lastHyphenIndex + 1);
      
      // Only group if suffix is a single letter (A, B, C, etc.) or short identifier
      if (suffix.length <= 2) {
        const groupName = batchName.substring(0, lastHyphenIndex);
        
        if (!groupMap[groupName]) {
          groupMap[groupName] = {
            batches: [],
            program: batch.program,
            department: batch.department,
          };
        }
        groupMap[groupName].batches.push(batch);
      } else {
        // Suffix too long - use full batch name as group name (single batch group)
        const groupName = batchName;
        if (!groupMap[groupName]) {
          groupMap[groupName] = {
            batches: [],
            program: batch.program,
            department: batch.department,
          };
        }
        groupMap[groupName].batches.push(batch);
        console.log(`Using full name as group: "${batchName}"`);
      }
    }

    console.log("\n--- Detected Groups ---");
    for (const [groupName, data] of Object.entries(groupMap)) {
      console.log(`\n${groupName}:`);
      data.batches.forEach((b) => console.log(`  - ${b.batchName}`));
    }

    // Create batch groups
    console.log("\n--- Creating Batch Groups ---");
    let created = 0;
    let skipped = 0;

    for (const [groupName, data] of Object.entries(groupMap)) {
      // Only create group if there's more than 1 batch
      if (data.batches.length < 2) {
        console.log(`Skipping "${groupName}" - only 1 batch, no need for group`);
        skipped++;
        continue;
      }

      // Check if group already exists
      const existing = await batchGroupModel.findOne({ groupName });
      if (existing) {
        console.log(`Group "${groupName}" already exists, skipping`);
        skipped++;
        continue;
      }

      const batchGroup = new batchGroupModel({
        groupName,
        description: `Auto-generated group for ${groupName} batches`,
        batches: data.batches.map((b) => b._id),
        program: data.program,
        department: data.department,
      });

      await batchGroup.save();
      console.log(`Created group: ${groupName} (${data.batches.length} batches)`);
      created++;
    }

    console.log(`\n--- Summary ---`);
    console.log(`Created: ${created} groups`);
    console.log(`Skipped: ${skipped} groups`);

    await mongoose.disconnect();
    console.log("\nDone!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

createBatchGroups();
