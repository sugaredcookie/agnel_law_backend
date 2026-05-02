
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from one level up (workspace root)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const studentSchema = new mongoose.Schema({
  academicDetails: {
    rollNumber: String
  }
}, { strict: false });

const Student = mongoose.model('Student', studentSchema);

async function runAudit() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_DB_URI);
    console.log('Connected successfully.\n');

    const allStudents = await Student.find({}, { 'academicDetails.rollNumber': 1 }).lean();
    
    let total = allStudents.length;
    let numericOnly = 0;
    let withAlpha = 0;
    let empty = 0;
    let patterns = {};

    allStudents.forEach(s => {
      const roll = s.academicDetails?.rollNumber;
      if (!roll) {
        empty++;
        return;
      }

      if (/^\d+$/.test(roll)) {
        numericOnly++;
      } else {
        withAlpha++;
        const match = roll.match(/^([A-Za-z]+)/);
        const prefix = match ? match[1] : 'Mixed/Other';
        patterns[prefix] = (patterns[prefix] || 0) + 1;
      }
    });

    console.log('--- DATABASE ROLL NUMBER SUMMARY ---');
    console.log(`Total Students: ${total}`);
    console.log(`Numeric Only:   ${numericOnly}`);
    console.log(`With Alpha/Non-digit: ${withAlpha}`);
    console.log(`Missing Roll No: ${empty}`);
    console.log('\nPrefix Patterns (Top 10):');
    Object.entries(patterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([prefix, count]) => {
        console.log(`${prefix}: ${count}`);
      });

    // --- FILE SYSTEM AUDIT ---
    const checkDir = (dirName) => {
        const dirPath = path.join(__dirname, '..', 'uploads', dirName);
        console.log(`Checking directory: ${dirPath}`);
        if (!fs.existsSync(dirPath)) {
            console.log(`Directory does not exist: ${dirPath}`);
            return { total: 0, alpha: 0 };
        }
        
        const files = fs.readdirSync(dirPath);
        let alphaCount = 0;
        files.forEach(f => {
            if (/^[A-Za-z]/.test(f)) alphaCount++;
        });
        return { total: files.length, alpha: alphaCount };
    };

    const photoAudit = checkDir('collected_photos');
    const signAudit = checkDir('collected_signs');

    console.log('\n--- FILE SYSTEM SUMMARY ---');
    console.log(`Collected Photos: ${photoAudit.total} total, ${photoAudit.alpha} with alpha prefix`);
    console.log(`Collected Signs:  ${signAudit.total} total, ${signAudit.alpha} with alpha prefix`);

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

runAudit();
