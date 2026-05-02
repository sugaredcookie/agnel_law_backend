
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const studentSchema = new mongoose.Schema({
  academicDetails: {
    rollNumber: String,
    batch: { name: String }
  }
}, { strict: false });

const Student = mongoose.model('Student', studentSchema);

async function migrateDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_DB_URI);
    console.log('Connected successfully.\n');

    const students = await Student.find({}, { 'academicDetails.rollNumber': 1, 'academicDetails.batch.name': 1 }).lean();
    
    let updatedCount = 0;
    let collisions = [];
    let processedRolls = new Map(); // Roll -> BatchName

    console.log('Analyzing for collisions and normalization...');

    for (const s of students) {
      const originalRoll = s.academicDetails?.rollNumber;
      if (!originalRoll) continue;

      // Extract only digits
      const normalizedRoll = originalRoll.replace(/\D/g, '');
      const batchName = s.academicDetails?.batch?.name || 'Unknown';

      if (normalizedRoll === '') {
          console.log(`Skipping student ${s._id} - No digits found in roll "${originalRoll}"`);
          continue;
      }

      // Check for collision within the same batch (or globally if you prefer)
      const key = `${normalizedRoll}_${batchName}`;
      if (processedRolls.has(key)) {
          collisions.push({
              roll: normalizedRoll,
              batch: batchName,
              originalA: processedRolls.get(key),
              originalB: originalRoll
          });
      }
      processedRolls.set(key, originalRoll);

      if (originalRoll !== normalizedRoll) {
        await Student.updateOne(
          { _id: s._id },
          { $set: { 'academicDetails.rollNumber': normalizedRoll } }
        );
        updatedCount++;
      }
    }

    console.log(`\n--- DATABASE MIGRATION SUMMARY ---`);
    console.log(`Students updated: ${updatedCount}`);
    
    if (collisions.length > 0) {
      console.log(`\nWARNING: ${collisions.length} potential collisions detected (same normalized roll in same batch):`);
      collisions.forEach(c => {
          console.log(` - Roll ${c.roll} in ${c.batch}: was "${c.originalA}" vs "${c.originalB}"`);
      });
    } else {
        console.log('No roll number collisions detected.');
    }

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

migrateDatabase();
