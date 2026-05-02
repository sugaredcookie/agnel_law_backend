import BrowserPool from "./browserPool.js";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { updateJob, getJob } from "./jobManager.js";
import IdCardTemplate from "../IdCardTemplate.js";
import Student from "../models/studentModel.js";
import Application from "../models/applicationModel.js";
import mongoose from "mongoose";

const __dirname = path.resolve();

class IDCardQueue {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 4;
    this.chunkSize = options.chunkSize || 20;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.browserPool = new BrowserPool({
      maxBrowsers: options.maxBrowsers || 3,
      maxPagesPerBrowser: options.maxPagesPerBrowser || 2,
    });

    this.queue = [];
    this.processing = false;
    this.activeWorkers = 0;

    this.staticAssets = null;
  }

  async initialize() {
    await this.browserPool.initialize();
    await this.loadStaticAssets();
    console.log("ID Card Queue initialized");
  }

  async loadStaticAssets() {
    try {
      console.log("Loading static assets...");

      const [
        logoResponse,
        rubikRegular,
        rubikBold,
        collegeSeal,
        principalSign,
        fallbackImage,
        naacLogo,
      ] = await Promise.all([
        fetch("https://lms.raphaedu.com/agnel-logo.png"),
        fs.promises.readFile(
          path.join(__dirname, "fonts/Rubik/Rubik-Regular.ttf"),
        ),
        fs.promises.readFile(
          path.join(__dirname, "fonts/Rubik/Rubik-Bold.ttf"),
        ),
        fs.promises.readFile(
          path.join(__dirname, "uploads/images/clg_seal.png"),
        ),
        fs.promises.readFile(
          path.join(__dirname, "uploads/images/principal_sign.png"),
        ),
        fs.promises.readFile(
          path.join(__dirname, "uploads/images/fallback-image.png"),
        ),
        fs.promises.readFile(
          path.join(__dirname, "uploads/images/b_plus_nac.png"),
        ),
      ]);

      const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());

      this.staticAssets = {
        agnelLogoBase64: `data:image/png;base64,${logoBuffer.toString("base64")}`,
        rubikRegularBase64: `data:font/ttf;base64,${rubikRegular.toString(
          "base64",
        )}`,
        rubikBoldBase64: `data:font/ttf;base64,${rubikBold.toString("base64")}`,
        collegeSealBase64: `data:image/png;base64,${collegeSeal.toString(
          "base64",
        )}`,
        principalSignBase64: `data:image/png;base64,${principalSign.toString(
          "base64",
        )}`,
        fallbackImageBase64: `data:image/png;base64,${fallbackImage.toString(
          "base64",
        )}`,
        naacLogoBase64: `data:image/png;base64,${naacLogo.toString("base64")}`,
      };

      console.log("Static assets loaded successfully");
    } catch (error) {
      console.error("Error loading static assets:", error);
      throw error;
    }
  }

  async addJob(jobId, studentIds) {
    const job = {
      id: jobId,
      studentIds,
      status: "queued",
      createdAt: new Date(),
      attempts: 0,
    };

    this.queue.push(job);
    console.log(
      `Job ${jobId} added to queue with ${studentIds.length} students`,
    );

    if (!this.processing) {
      this.startProcessing();
    }

    return job;
  }

  async startProcessing() {
    if (this.processing) return;

    this.processing = true;
    console.log("Starting ID card queue processing");

    while (this.queue.length > 0 && this.processing) {
      if (this.activeWorkers >= this.concurrency) {
        await this.delay(100);
        continue;
      }

      const job = this.queue.shift();
      if (job) {
        this.activeWorkers++;
        this.processJob(job).finally(() => {
          this.activeWorkers--;
        });
      }
    }

    this.processing = false;
    console.log("Queue processing completed");
  }

  async processJob(job) {
    try {
      console.log(
        `Processing job ${job.id} with ${job.studentIds.length} students`,
      );
      updateJob(job.id, { status: "in_progress", progress: 0 });

      const students = await Student.find({ _id: { $in: job.studentIds } });
      if (students.length === 0) {
        throw new Error("No students found");
      }

      const chunks = this.chunkArray(students, this.chunkSize);
      const totalChunks = chunks.length;
      let completedChunks = 0;

      const zipFilePath = await this.createZipFile(job.id);
      const { archive, output } = this.createArchiver(zipFilePath);
      const allChunkResults = [];

      for (const [chunkIndex, chunk] of chunks.entries()) {
        const currentJob = getJob(job.id);
        if (currentJob && currentJob.status === "cancelled") {
          console.log(`Job ${job.id} was cancelled. Halting chunk processing.`);
          throw new Error("Job cancelled by user");
        }

        const chunkResults = await this.processStudentChunk(
          chunk,
          job.id,
          chunkIndex,
        );
        allChunkResults.push(chunkResults);

        for (const result of chunkResults) {
          if (result.success) {
            archive.append(result.buffer, { name: result.filename });
          }
        }

        completedChunks++;
        const progress = Math.round((completedChunks / totalChunks) * 100);
        updateJob(job.id, { progress });

        console.log(
          `Chunk ${chunkIndex + 1}/${totalChunks} completed for job ${job.id}`,
        );
      }

      const allResults = allChunkResults.flat();

      await archive.finalize();

      const successCount = allResults.filter((r) => r.success).length;
      const failureCount = students.length - successCount;

      updateJob(job.id, {
        status: "completed",
        progress: 100,
        result: zipFilePath,
        metadata: {
          totalStudents: students.length,
          successCount,
          failureCount,
        },
      });

      console.log(
        `Job ${job.id} completed successfully. Success: ${successCount}, Failed: ${failureCount}`,
      );
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);

      if (error.message === "Job cancelled by user") {
        updateJob(job.id, {
          status: "cancelled",
          error: "Job was cancelled by the user.",
        });
        return;
      }

      if (job.attempts < this.retryAttempts) {
        job.attempts++;
        console.log(
          `Retrying job ${job.id}, attempt ${job.attempts}/${this.retryAttempts}`,
        );
        await this.delay(this.retryDelay * job.attempts);
        this.queue.unshift(job);
      } else {
        updateJob(job.id, {
          status: "failed",
          error: error.message,
          metadata: { attempts: job.attempts },
        });
      }
    }
  }

  async processStudentChunk(students, jobId, chunkIndex) {
    const results = [];
    const chunkPromises = students.map(async (student, index) => {
      let pageInfo = null;
      try {
        pageInfo = await this.browserPool.getPage();
        const result = await this.generateIdCard(student, pageInfo.page);
        results.push({
          success: true,
          filename: `ID_CARD_${student.studentDetails.firstName}_${student.studentDetails.lastName}.pdf`,
          buffer: result,
        });

        console.log(
          `Generated ID card for ${student.studentDetails.firstName} ${student.studentDetails.lastName} (Chunk ${chunkIndex + 1}, Student ${index + 1})`,
        );
      } catch (error) {
        console.error(
          `Error generating ID card for student ${student._id}:`,
          error,
        );
        results.push({
          success: false,
          error: error.message,
          studentId: student._id,
        });
      } finally {
        if (pageInfo) {
          await this.browserPool.releasePage(pageInfo);
        }
      }
    });

    await Promise.all(chunkPromises);
    return results;
  }

  async generateIdCard(student, page) {
    const getCourseDuration = (programName) => {
      if (!programName) return 1;
      const durationMap = {
        LLB: 3,
        LLM: 2,
        BALLB: 5,
      };
      const normalizedProgram = programName
        .toUpperCase()
        .replace(/[\s.-]+/g, "");

      const sortedKeys = Object.keys(durationMap).sort(
        (a, b) => b.length - a.length,
      );
      const key = sortedKeys.find((k) => normalizedProgram.includes(k));
      return key ? durationMap[key] : 1;
    };

    let yearOfJoining = student.academicDetails?.yearOfJoining;
    if (!yearOfJoining) {
      const rollNumber = student.academicDetails?.rollNumber;
      if (rollNumber) {
        const numericPart = rollNumber.replace(/^[A-Za-z]+/, "");
        if (numericPart.length >= 2) {
          yearOfJoining = `20${numericPart.substring(0, 2)}`;
        }
      }
    }

    let academicYear = "";
    if (yearOfJoining) {
      const startYear = parseInt(yearOfJoining);
      const programName = student.academicDetails?.program;
      const duration = getCourseDuration(programName);
      const endYear = startYear + duration;
      academicYear = `AY ${startYear}-${String(endYear).slice(-2)}`;
    }

    const getImageUrl = async (student, type) => {
      // Priority 1: Check studentDetails first
      let url =
        student.studentDetails[
          type === "candidatePhoto" ? "studentImage" : "studentSign"
        ];

      // Priority 2: Check certificates array (only if not found in studentDetails)
      if (!url) {
        url = student.certificates?.find((c) => c.type === type)?.fileUrl;
      }

      // Priority 3: Check application form (only if still not found)
      if (!url) {
        const query = mongoose.Types.ObjectId.isValid(student.loginStudentId)
          ? { loginStudentId: student.loginStudentId }
          : {
              "studentDetails.emailAddress":
                student.studentDetails.emailAddress,
            };
        const application = await Application.findOne(query).lean();
        if (application && application.certificates) {
          url =
            application.certificates.find((c) => c.type === type)?.fileUrl ||
            "";
        }
      }
      return url;
    };

    const backendBaseUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, "");
    const studentPhotoUrl =
      (await getImageUrl(student, "candidatePhoto")) ||
      `${backendBaseUrl}/api/students/student-photo/${student.academicDetails.rollNumber}`;
    const studentSignUrl =
      (await getImageUrl(student, "candidateSignature")) ||
      `${backendBaseUrl}/api/students/student-sign/${student.academicDetails.rollNumber}`;

    const studentDataForCard = {
      ...student.toObject(),
      academicDetails: {
        ...student.toObject().academicDetails,
        yearOfJoining: yearOfJoining,
      },
      academicYear,
      ...this.staticAssets,
      studentPhotoUrl: await this.urlToBase64(
        studentPhotoUrl,
        this.staticAssets.fallbackImageBase64,
      ),
      studentSignUrl: await this.urlToBase64(
        studentSignUrl,
        this.staticAssets.fallbackImageBase64,
      ),
    };

    const htmlContent = IdCardTemplate(studentDataForCard);
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    return await page.pdf({
      width: "85.6mm",
      height: "54mm",
      printBackground: true,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
    });
  }

  async findApplicationImage(loginStudentId, certificateType) {
    const application = await Application.findOne({ loginStudentId }).lean();
    if (application && application.certificates) {
      return (
        application.certificates.find((c) => c.type === certificateType)
          ?.fileUrl || ""
      );
    }
    return "";
  }

  async urlToBase64(url, fallback) {
    if (!url) return fallback;
    try {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const mimeType = response.headers.get("content-type") || "image/png";
      return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
    } catch (error) {
      console.error(`Error converting URL to base64 for ${url}:`, error);
      return fallback;
    }
  }

  async createZipFile(jobId) {
    const zipFileName = `${jobId}.zip`;
    const zipFilePath = path.join(__dirname, "temp", zipFileName);

    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    return zipFilePath;
  }

  createArchiver(zipFilePath) {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("Archiver error:", err);
      throw err;
    });

    archive.pipe(output);
    return { archive, output };
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async shutdown() {
    console.log("Shutting down ID card queue");
    this.processing = false;
    await this.browserPool.closeAll();
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      activeWorkers: this.activeWorkers,
      processing: this.processing,
      browserStats: this.browserPool.getStats(),
    };
  }
}

export default IDCardQueue;
