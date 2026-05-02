import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mongoDBuri =
  process.env.MONGO_DB_URI || "mongodb://localhost:27017/data_db";

const parseMongoUri = (uri) => {
  const match = uri.match(
    /mongodb(?:\+srv)?:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)/,
  );
  if (!match) {
    throw new Error("Invalid MongoDB URI format");
  }
  return {
    username: match[1],
    password: match[2],
    host: match[3],
    database: match[4],
  };
};

const restoreBackup = async (backupPath) => {
  try {
    console.log("=".repeat(60));
    console.log("COMPLETE DATABASE RESTORE SCRIPT");
    console.log("=".repeat(60));

    if (!fs.existsSync(backupPath)) {
      console.error(`✗ Backup directory not found: ${backupPath}`);
      process.exit(1);
    }

    const infoPath = path.join(backupPath, "backup-info.json");
    if (!fs.existsSync(infoPath)) {
      console.error(`✗ Backup info not found: ${infoPath}`);
      console.error("This doesn't appear to be a valid backup directory.");
      process.exit(1);
    }

    const backupInfo = JSON.parse(fs.readFileSync(infoPath, "utf8"));
    console.log(`\nBackup Information:`);
    console.log(`  Created: ${backupInfo.timestamp}`);
    console.log(`  Database: ${backupInfo.database}`);
    console.log(`  Host: ${backupInfo.host}`);
    console.log(`  Type: ${backupInfo.backupType}`);

    console.log("\n" + "⚠".repeat(60));
    console.log("WARNING: This will REPLACE all data in the current database!");
    console.log("Make sure you have the correct backup and database.");
    console.log("⚠".repeat(60) + "\n");

    const dbInfo = parseMongoUri(mongoDBuri);
    const isAtlas = mongoDBuri.includes("mongodb+srv");

    // Check if mongorestore is available
    try {
      await execAsync("mongorestore --version");
    } catch (error) {
      console.error("\n✗ mongorestore command not found!");
      console.error("\nPlease install MongoDB Database Tools:");
      console.error(
        "  Windows: https://www.mongodb.com/try/download/database-tools",
      );
      console.error("  Download and add to PATH\n");
      throw new Error("mongorestore not available");
    }

    console.log("Starting mongorestore...");
    console.log("This may take several minutes depending on database size.\n");

    // Find the actual database folder in the backup
    const dbBackupPath = path.join(backupPath, backupInfo.database);

    if (!fs.existsSync(dbBackupPath)) {
      console.error(`✗ Database backup folder not found: ${dbBackupPath}`);
      process.exit(1);
    }

    // Build mongorestore command
    let restoreCommand;
    if (isAtlas) {
      // For MongoDB Atlas - drop existing and restore
      restoreCommand = `mongorestore --uri="${mongoDBuri}" --drop "${dbBackupPath}"`;
    } else {
      // For local MongoDB
      restoreCommand = `mongorestore --host="${dbInfo.host}" --db="${dbInfo.database}" --username="${dbInfo.username}" --password="${dbInfo.password}" --authenticationDatabase=admin --drop "${dbBackupPath}"`;
    }

    const { stdout, stderr } = await execAsync(restoreCommand, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });

    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes("done")) console.error(stderr);

    console.log("\n✓ Database restore completed\n");

    console.log("=".repeat(60));
    console.log("RESTORE COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log(`Database: ${dbInfo.database}`);
    console.log(`Restored from: ${backupPath}`);
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("\n✗ Restore failed:", error.message);
    throw error;
  }
};

const backupDir = process.argv[2];

if (!backupDir) {
  console.error(
    "Usage: node scripts/restoreAtktBackup.js <backup-directory-path>",
  );
  console.error("\nExample:");
  console.error(
    "  node scripts/restoreAtktBackup.js backups/db-backup-2025-11-03T10-30-00",
  );
  process.exit(1);
}

restoreBackup(backupDir)
  .then(() => {
    console.log("\nRestore script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nRestore script failed:", error);
    process.exit(1);
  });
