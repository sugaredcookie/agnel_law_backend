const jobs = new Map();
const jobHistory = new Map();

export const createJob = (jobId, metadata = {}) => {
  const job = {
    id: jobId,
    status: "pending",
    progress: 0,
    result: null,
    error: null,
    metadata: {
      totalStudents: 0,
      processedStudents: 0,
      successCount: 0,
      failureCount: 0,
      estimatedTimeRemaining: null,
      ...metadata,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    completedAt: null,
  };
  jobs.set(jobId, job);
  console.log(`Job ${jobId} created with metadata:`, metadata);
  return job;
};

export const updateJob = (jobId, data) => {
  if (jobs.has(jobId)) {
    const job = jobs.get(jobId);
    const updatedJob = {
      ...job,
      ...data,
      updatedAt: new Date(),
      metadata: { ...job.metadata, ...data.metadata },
    };

    if (data.status === "in_progress" && !job.startedAt) {
      updatedJob.startedAt = new Date();
    }
    if (
      (data.status === "completed" || data.status === "failed") &&
      !job.completedAt
    ) {
      updatedJob.completedAt = new Date();
    }

    if (
      updatedJob.status === "in_progress" &&
      updatedJob.progress > 0 &&
      updatedJob.startedAt
    ) {
      const elapsedTime = new Date() - updatedJob.startedAt;
      const estimatedTotalTime = (elapsedTime / updatedJob.progress) * 100;
      updatedJob.metadata.estimatedTimeRemaining =
        estimatedTotalTime - elapsedTime;
    }

    jobs.set(jobId, updatedJob);

    if (updatedJob.status === "completed" || updatedJob.status === "failed") {
      setTimeout(
        () => {
          if (jobs.has(jobId)) {
            const completedJob = jobs.get(jobId);
            jobHistory.set(jobId, completedJob);
            jobs.delete(jobId);
            console.log(`Job ${jobId} moved to history`);
          }
        },
        5 * 60 * 1000,
      );
    }

    return updatedJob;
  }
  return null;
};

export const getJob = (jobId) => {
  return jobs.get(jobId) || jobHistory.get(jobId);
};

export const getAllActiveJobs = () => {
  return Array.from(jobs.values());
};

export const getJobStats = () => {
  const activeJobs = Array.from(jobs.values());
  const historicalJobs = Array.from(jobHistory.values());

  return {
    active: {
      total: activeJobs.length,
      pending: activeJobs.filter((j) => j.status === "pending").length,
      inProgress: activeJobs.filter((j) => j.status === "in_progress").length,
      completed: activeJobs.filter((j) => j.status === "completed").length,
      failed: activeJobs.filter((j) => j.status === "failed").length,
    },
    historical: {
      total: historicalJobs.length,
      completed: historicalJobs.filter((j) => j.status === "completed").length,
      failed: historicalJobs.filter((j) => j.status === "failed").length,
    },
  };
};

export const deleteJob = (jobId) => {
  const deleted = jobs.delete(jobId) || jobHistory.delete(jobId);
  if (deleted) {
    console.log(`Job ${jobId} deleted`);
  }
  return deleted;
};

setInterval(
  () => {
    const now = new Date();

    for (const [jobId, job] of jobs.entries()) {
      const ageInMinutes = (now - job.createdAt) / 1000 / 60;
      if (ageInMinutes > 120) {
        console.log(`Cleaning up old active job: ${jobId}`);
        jobs.delete(jobId);
      }
    }

    for (const [jobId, job] of jobHistory.entries()) {
      const ageInMinutes = (now - job.createdAt) / 1000 / 60;
      if (ageInMinutes > 1440) {
        console.log(`Cleaning up old historical job: ${jobId}`);
        jobHistory.delete(jobId);
      }
    }

    console.log(
      `Job cleanup completed. Active: ${jobs.size}, Historical: ${jobHistory.size}`,
    );
  },
  15 * 60 * 1000,
);
