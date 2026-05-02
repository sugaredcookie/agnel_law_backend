
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const targets = [
  { collection: 'parsedresults', field: 'rollNo', uniqueWith: 'resultConfigId' },
  { collection: 'parsedresultaudits', field: 'rollNo' },
  { collection: 'semesterresults', field: 'rollNo', uniqueWith: ['programId', 'semesterNumber'] },
  { collection: 'studentattendances', field: 'rollNo' },
  { collection: 'regularexamenrollments', field: 'hallTicketNumber' },
  { collection: 'atktforms', field: 'rollNumber', uniqueWith: 'examSessionId' },
  { collection: 'archivedstudents', field: 'academicDetails.rollNumber' },
  { collection: 'unifiedreceipts', field: 'studentDetails.rollNumber' },
  { collection: 'students', field: 'academicDetails.rollNumber' }
];

async function finalDeepMigration() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_DB_URI);
    console.log('Connected successfully.\n');

    for (const target of targets) {
      console.log(`Processing: ${target.collection} -> ${target.field}`);
      const collection = mongoose.connection.collection(target.collection);
      
      const query = { [target.field]: { $regex: /\D/ } };
      const docs = await collection.find(query).toArray();
      
      if (docs.length === 0) {
        console.log(` - No alpha-prefixed items found.`);
        continue;
      }
      
      console.log(` - Found ${docs.length} items with non-numeric fields.`);
      let updatedCount = 0;
      let collisionDeletedCount = 0;

      for (const doc of docs) {
        // Deep value extraction
        const parts = target.field.split('.');
        let originalValue = doc;
        for (const p of parts) originalValue = originalValue?.[p];
        
        if (!originalValue || typeof originalValue !== 'string') continue;
        
        const normalizedValue = originalValue.replace(/\D/g, '');
        if (normalizedValue === '') continue;
        if (normalizedValue === originalValue) continue;

        // Collision Check for Unique Constraints
        if (target.uniqueWith) {
          const collisionQuery = { [target.field]: normalizedValue };
          if (Array.isArray(target.uniqueWith)) {
            target.uniqueWith.forEach(f => collisionQuery[f] = doc[f]);
          } else {
            collisionQuery[target.uniqueWith] = doc[target.uniqueWith];
          }

          const existing = await collection.findOne(collisionQuery);
          if (existing) {
            console.log(`   COLLISION: ${target.collection} [${originalValue} -> ${normalizedValue}]. Deleting redundant entry.`);
            await collection.deleteOne({ _id: doc._id });
            collisionDeletedCount++;
            continue;
          }
        }

        const res = await collection.updateOne(
          { _id: doc._id },
          { $set: { [target.field]: normalizedValue } }
        );
        if (res.modifiedCount > 0) updatedCount++;
      }
      console.log(` - Result: ${updatedCount} updated, ${collisionDeletedCount} collisions merged/deleted.`);
    }
    console.log('\n--- FINAL DEEP MIGRATION COMPLETE ---');
  } catch (err) {
    console.error('Final migration failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

finalDeepMigration();
