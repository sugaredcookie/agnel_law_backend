
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function migrateParsedResults() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_DB_URI);
    console.log('Connected successfully.\n');

    // Mongoose will use the collection 'parsedresults' by default for the 'ParsedResult' model
    const collection = mongoose.connection.collection('parsedresults');
    
    // Find all documents where rollNo contains non-digits
    const query = { rollNo: { $regex: /\D/ } };
    const docs = await collection.find(query).toArray();
    
    console.log(`Found ${docs.length} documents in parsedresults with non-numeric rollNo.`);
    
    let updatedCount = 0;
    let collisionCount = 0;

    for (const doc of docs) {
      const originalRoll = String(doc.rollNo);
      const normalizedRoll = originalRoll.replace(/\D/g, '');

      if (normalizedRoll === '') {
        console.log(`Skipping ID ${doc._id} - No digits found in roll "${originalRoll}"`);
        continue;
      }

      if (normalizedRoll !== originalRoll) {
        try {
          const configId = doc.resultConfigId;

          // Search for collision
          const existing = await collection.findOne({ 
            resultConfigId: configId, 
            rollNo: normalizedRoll 
          });

          if (existing) {
            console.log(`COLLISION: Config ${configId} - Can't rename ${originalRoll} to ${normalizedRoll} as it exists. Deleting redundant entry.`);
            await collection.deleteOne({ _id: doc._id });
            collisionCount++;
            continue;
          }

          const res = await collection.updateOne(
            { _id: doc._id },
            { $set: { rollNo: normalizedRoll } }
          );
          if (res.modifiedCount > 0) {
            updatedCount++;
            if (updatedCount % 50 === 0) console.log(` - Progress: Updated ${updatedCount}...`);
          }
        } catch (err) {
          console.error(`ERROR on ID ${doc._id}: ${err.message}`);
        }
      }
    }

    console.log(`\n--- PARSED RESULTS MIGRATION SUMMARY ---`);
    console.log(`Total documents scanned with alpha: ${docs.length}`);
    console.log(`Successfully updated: ${updatedCount}`);
    console.log(`Collisions skipped:    ${collisionCount}`);

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

migrateParsedResults();
