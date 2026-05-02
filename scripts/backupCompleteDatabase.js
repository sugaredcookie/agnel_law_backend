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

const createBackup = async () => {
  try {
    console.log("=".repeat(60));
    console.log("COMPLETE DATABASE BACKUP SCRIPT");
    console.log("=".repeat(60));

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const backupDir = path.join(
      __dirname,
      "..",
      "backups",
      `db-backup-${timestamp}`,
    );

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log(`\nBackup directory: ${backupDir}`);
    console.log(
      `Database URI: ${mongoDBuri.split("@")[1]?.split("?")[0] || "localhost"}\n`,
    );

    const dbInfo = parseMongoUri(mongoDBuri);
    const isAtlas = mongoDBuri.includes("mongodb+srv");

    console.log("Starting mongodump...");
    console.log("This may take several minutes depending on database size.\n");

    // Build mongodump command
    let dumpCommand;
    if (isAtlas) {
      // For MongoDB Atlas
      dumpCommand = `mongodump --uri="${mongoDBuri}" --out="${backupDir}"`;
    } else {
      // For local MongoDB
      dumpCommand = `mongodump --host="${dbInfo.host}" --db="${dbInfo.database}" --username="${dbInfo.username}" --password="${dbInfo.password}" --out="${backupDir}"`;
    }

    try {
      const { stdout, stderr } = await execAsync(dumpCommand, {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      if (stdout) console.log(stdout);
      if (stderr && !stderr.includes("done dumping")) console.error(stderr);

      console.log("✓ Database dump completed\n");
    } catch (error) {
      if (error.message.includes("mongodump")) {
        console.error("\n✗ mongodump command not found!");
        console.error("\nPlease install MongoDB Database Tools:");
        console.error(
          "  Windows: https://www.mongodb.com/try/download/database-tools",
        );
        console.error("  Download and add to PATH\n");
        throw new Error("mongodump not available");
      }
      throw error;
    }

    // Create backup summary
    const summary = {
      timestamp: new Date().toISOString(),
      database: dbInfo.database,
      host: dbInfo.host,
      backupType: "full",
      backupMethod: "mongodump",
      backupLocation: backupDir,
    };

    fs.writeFileSync(
      path.join(backupDir, "backup-info.json"),
      JSON.stringify(summary, null, 2),
    );

    // Check backup size
    const getDirectorySize = (dirPath) => {
      let totalSize = 0;
      const files = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
          totalSize += getDirectorySize(filePath);
        } else {
          totalSize += fs.statSync(filePath).size;
        }
      }
      return totalSize;
    };

    const backupSize = getDirectorySize(backupDir);
    const backupSizeMB = (backupSize / (1024 * 1024)).toFixed(2);

    console.log("=".repeat(60));
    console.log("BACKUP COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log(`Backup Location: ${backupDir}`);
    console.log(`Backup Size: ${backupSizeMB} MB`);
    console.log(`Database: ${dbInfo.database}`);
    console.log(`Timestamp: ${summary.timestamp}`);
    console.log("=".repeat(60) + "\n");

    console.log("✓ Complete database backup created");
    console.log("✓ Safe to proceed with migration\n");
    console.log("Next steps:");
    console.log("  1. Run: node scripts/migrateAtktForms.js");
    console.log(
      `  2. To restore if needed: node scripts/restoreAtktBackup.js "${backupDir}"\n`,
    );
  } catch (error) {
    console.error("\n✗ Backup failed:", error.message);
    throw error;
  }
};

createBackup()
  .then(() => {
    console.log("\nBackup script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nBackup script failed:", error);
    process.exit(1);
  });
