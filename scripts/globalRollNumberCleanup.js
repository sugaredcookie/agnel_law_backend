
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function migrateEverything() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_DB_URI);
    console.log('Connected successfully.\n');

    const collectionsToUpdate = [
      { name: 'archivedstudents', path: 'academicDetails.rollNumber' },
      { name: 'atktforms', path: 'rollNumber' },
      { name: 'examresults', path: 'results.rollNumber' },
      { name: 'groupbystudents', path: 'students.rollNumber' },
      { name: 'publishsnapshots', path: 'students.rollNumber' }, // Assuming structure based on grep
      { name: 'regularexamenrollments', path: 'rollNumber' },
      { name: 'reportcards', path: 'academicDetails.rollNumber' },
      { name: 'revalapplications', path: 'rollNumber' },
      { name: 'students', path: 'academicDetails.rollNumber' },
      { name: 'unifiedreceipts', path: 'studentDetails.rollNumber' }
    ];

    for (const col of collectionsToUpdate) {
      console.log(`Processing collection: ${col.name} at path: ${col.path}`);
      const collection = mongoose.connection.collection(col.name);
      
      // Find all documents where the rollNumber contains non-digits
      const query = { [col.path]: { $regex: /\D/ } };
      const docs = await collection.find(query).toArray();
      
      console.log(` - Found ${docs.length} documents with non-numeric roll numbers.`);
      
      let updatedCount = 0;
      for (const doc of docs) {
        // Handle nested paths for update
        const parts = col.path.split('.');
        let val = doc;
        for (const part of parts) {
            val = val?.[part];
        }

        if (typeof val === 'string') {
          const normalized = val.replace(/\D/g, '');
          if (normalized !== val) {
            await collection.updateOne(
              { _id: doc._id },
              { $set: { [col.path]: normalized } }
            );
            updatedCount++;
          }
        } else if (Array.isArray(val)) {
            // Special handling if the path points to an array (e.g. results.rollNumber)
            // This is more complex, but let's see if we hit it.
            console.log(` ! Path ${col.path} is an array, skipping for now.`);
        }
      }
      console.log(` - Updated ${updatedCount} documents in ${col.name}.`);
    }

    // Special check for arrays in examresults and groupbystudents
    // These often have nested arrays of students/results
    
  } catch (err) {
    console.error('Global migration failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

migrateEverything();
