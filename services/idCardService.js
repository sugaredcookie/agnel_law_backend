import IDCardQueue from "../utils/idCardQueue.js";
import { createJob } from "../utils/jobManager.js";
import { v4 as uuidv4 } from "uuid";

class IDCardService {
  constructor() {
    this.queue = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      console.log("Initializing ID Card Service...");

      this.queue = new IDCardQueue({
        concurrency: 1,
        chunkSize: 1,
        maxBrowsers: 1,
        maxPagesPerBrowser: 1,
        retryAttempts: 3,
        retryDelay: 1000,
      });

      await this.queue.initialize();
      this.initialized = true;

      console.log("ID Card Service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize ID Card Service:", error);
      throw error;
    }
  }

  async generateIdCards(studentIds, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const jobId = uuidv4();

    createJob(jobId, {
      totalStudents: studentIds.length,
      type: "id_card_generation",
      requestedAt: new Date(),
      ...options,
    });

    await this.queue.addJob(jobId, studentIds);

    console.log(
      `ID card generation job ${jobId} queued for ${studentIds.length} students`,
    );

    return jobId;
  }

  getQueueStats() {
    if (!this.initialized || !this.queue) {
      return { error: "Service not initialized" };
    }

    return this.queue.getStats();
  }

  async shutdown() {
    if (this.queue) {
      await this.queue.shutdown();
    }
    this.initialized = false;
  }

  isHealthy() {
    return this.initialized && this.queue !== null;
  }
}

const idCardService = new IDCardService();

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down ID Card Service...");
  await idCardService.shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down ID Card Service...");
  await idCardService.shutdown();
  process.exit(0);
});

export default idCardService;
