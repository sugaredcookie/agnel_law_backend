import ATKTExamSession from "../models/atktExamSessionModel.js";
import ATKTSubjectConfig from "../models/atktSubjectConfigModel.js";
import ATKTForm from "../models/atktFormModel.js";

export const createExamSession = async (req, res) => {
  try {
    const {
      title,
      academicYear,
      term,
      registrationStartDate,
      registrationEndDate,
      examStartDate,
      examEndDate,
      description,
    } = req.body;

    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await ATKTExamSession.create({
      title,
      academicYear,
      term,
      registrationStartDate,
      registrationEndDate,
      examStartDate,
      examEndDate,
      description,
      createdBy: userId,
      status: "draft",
    });

    res.status(201).json({
      message: "Exam session created successfully",
      session,
    });
  } catch (error) {
    console.error("Create exam session error:", error);
    res.status(500).json({
      message: error.message || "Failed to create exam session",
    });
  }
};

export const getAllExamSessions = async (req, res) => {
  try {
    const { status, academicYear, isActive } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (academicYear) filters.academicYear = academicYear;
    if (isActive !== undefined) filters.isActive = isActive === "true";

    const sessions = await ATKTExamSession.find(filters)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ sessions });
  } catch (error) {
    console.error("Fetch exam sessions error:", error);
    res.status(500).json({ message: "Failed to fetch exam sessions" });
  }
};

export const getExamSessionById = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await ATKTExamSession.findById(id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    res.status(200).json({ session });
  } catch (error) {
    console.error("Fetch exam session error:", error);
    res.status(500).json({ message: "Failed to fetch exam session" });
  }
};

export const updateExamSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const session = await ATKTExamSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res
        .status(400)
        .json({ message: "Cannot update a closed exam session" });
    }

    const updates = { ...req.body, updatedBy: userId };
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.createdBy;

    const updatedSession = await ATKTExamSession.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true },
    );

    res.status(200).json({
      message: "Exam session updated successfully",
      session: updatedSession,
    });
  } catch (error) {
    console.error("Update exam session error:", error);
    res.status(500).json({
      message: error.message || "Failed to update exam session",
    });
  }
};

export const deleteExamSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await ATKTExamSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    const formCount = await ATKTForm.countDocuments({ examSessionId: id });
    if (formCount > 0) {
      return res.status(400).json({
        message: `Cannot delete exam session with ${formCount} existing form(s). Please archive it instead.`,
      });
    }

    await ATKTSubjectConfig.deleteMany({ examSessionId: id });
    await ATKTExamSession.findByIdAndDelete(id);

    res.status(200).json({
      message: "Exam session and related configurations deleted successfully",
    });
  } catch (error) {
    console.error("Delete exam session error:", error);
    res.status(500).json({ message: "Failed to delete exam session" });
  }
};

export const activateExamSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const session = await ATKTExamSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    const configCount = await ATKTSubjectConfig.countDocuments({
      examSessionId: id,
      isActive: true,
    });

    if (configCount === 0) {
      return res.status(400).json({
        message: "Cannot activate exam session without subject configurations",
      });
    }

    // Multiple ATKT exam sessions are allowed to be active concurrently.
    // Activating this session does NOT deactivate other active sessions.
    session.isActive = true;
    session.status = "active";
    session.updatedBy = userId;
    await session.save();

    res.status(200).json({
      message: "Exam session activated successfully",
      session,
    });
  } catch (error) {
    console.error("Activate exam session error:", error);
    res.status(500).json({ message: "Failed to activate exam session" });
  }
};

export const deactivateExamSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const session = await ATKTExamSession.findByIdAndUpdate(
      id,
      { isActive: false, updatedBy: userId },
      { new: true },
    );

    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    res.status(200).json({
      message: "Exam session deactivated successfully",
      session,
    });
  } catch (error) {
    console.error("Deactivate exam session error:", error);
    res.status(500).json({ message: "Failed to deactivate exam session" });
  }
};

export const closeExamSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const session = await ATKTExamSession.findByIdAndUpdate(
      id,
      { status: "closed", isActive: false, updatedBy: userId },
      { new: true },
    );

    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    res.status(200).json({
      message: "Exam session closed successfully",
      session,
    });
  } catch (error) {
    console.error("Close exam session error:", error);
    res.status(500).json({ message: "Failed to close exam session" });
  }
};

export const getActiveExamSession = async (req, res) => {
  try {
    const sessions = await ATKTExamSession.find({ isActive: true })
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    if (!sessions.length) {
      return res.status(404).json({
        message: "No active exam session found",
        hasActive: false,
        sessions: [],
        session: null,
      });
    }

    // Backward compatible: `session` is the most recently created active session.
    res
      .status(200)
      .json({ session: sessions[0], sessions, hasActive: true });
  } catch (error) {
    console.error("Fetch active exam session error:", error);
    res.status(500).json({ message: "Failed to fetch active exam session" });
  }
};

export const createSubjectConfig = async (req, res) => {
  try {
    const { examSessionId, course, batch, batchLabel, pattern, subjects, actualBatches } =
      req.body;

    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await ATKTExamSession.findById(examSessionId);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res.status(400).json({
        message: "Cannot add subjects to a closed exam session",
      });
    }

    const existing = await ATKTSubjectConfig.findOne({
      examSessionId,
      course,
      batch,
      pattern,
    });

    if (existing) {
      return res.status(400).json({
        message: "Subject configuration already exists for this combination",
      });
    }

    const config = await ATKTSubjectConfig.create({
      examSessionId,
      course,
      batch,
      batchLabel,
      actualBatches: actualBatches || [],
      pattern,
      subjects,
      createdBy: userId,
    });

    res.status(201).json({
      message: "Subject configuration created successfully",
      config,
    });
  } catch (error) {
    console.error("Create subject config error:", error);
    res.status(500).json({
      message: error.message || "Failed to create subject configuration",
    });
  }
};

export const getSubjectConfigs = async (req, res) => {
  try {
    const { examSessionId, course, batch, pattern, isActive } = req.query;

    const filters = {};
    if (examSessionId) filters.examSessionId = examSessionId;
    if (course) filters.course = course;
    if (batch) filters.batch = batch;
    if (pattern) filters.pattern = pattern;
    if (isActive !== undefined) filters.isActive = isActive === "true";

    const configs = await ATKTSubjectConfig.find(filters)
      .populate("examSessionId", "title academicYear term status")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ configs });
  } catch (error) {
    console.error("Fetch subject configs error:", error);
    res.status(500).json({ message: "Failed to fetch subject configurations" });
  }
};

export const getSubjectConfigById = async (req, res) => {
  try {
    const { id } = req.params;

    const config = await ATKTSubjectConfig.findById(id)
      .populate("examSessionId", "title academicYear term status")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!config) {
      return res
        .status(404)
        .json({ message: "Subject configuration not found" });
    }

    res.status(200).json({ config });
  } catch (error) {
    console.error("Fetch subject config error:", error);
    res.status(500).json({ message: "Failed to fetch subject configuration" });
  }
};

export const updateSubjectConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.examinerId;

    const config =
      await ATKTSubjectConfig.findById(id).populate("examSessionId");
    if (!config) {
      return res
        .status(404)
        .json({ message: "Subject configuration not found" });
    }

    if (config.examSessionId.status === "closed") {
      return res.status(400).json({
        message: "Cannot update configuration for a closed exam session",
      });
    }

    const updates = { ...req.body, updatedBy: userId };
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.createdBy;
    delete updates.examSessionId;

    const updatedConfig = await ATKTSubjectConfig.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true },
    ).populate("examSessionId", "title academicYear term status");

    res.status(200).json({
      message: "Subject configuration updated successfully",
      config: updatedConfig,
    });
  } catch (error) {
    console.error("Update subject config error:", error);
    res.status(500).json({
      message: error.message || "Failed to update subject configuration",
    });
  }
};

export const deleteSubjectConfig = async (req, res) => {
  try {
    const { id } = req.params;

    const config = await ATKTSubjectConfig.findById(id);
    if (!config) {
      return res
        .status(404)
        .json({ message: "Subject configuration not found" });
    }

    const formCount = await ATKTForm.countDocuments({
      examSessionId: config.examSessionId,
      course: config.course,
      batch: config.batch,
      pattern: config.pattern,
    });

    if (formCount > 0) {
      return res.status(400).json({
        message: `Cannot delete configuration with ${formCount} existing form(s). Please deactivate it instead.`,
      });
    }

    await ATKTSubjectConfig.findByIdAndDelete(id);

    res.status(200).json({
      message: "Subject configuration deleted successfully",
    });
  } catch (error) {
    console.error("Delete subject config error:", error);
    res.status(500).json({ message: "Failed to delete subject configuration" });
  }
};

export const bulkCreateSubjectConfigs = async (req, res) => {
  try {
    const { examSessionId, configurations } = req.body;
    const userId = req.user?.id || req.user?.examinerId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await ATKTExamSession.findById(examSessionId);
    if (!session) {
      return res.status(404).json({ message: "Exam session not found" });
    }

    if (session.status === "closed") {
      return res.status(400).json({
        message: "Cannot add subjects to a closed exam session",
      });
    }

    if (!Array.isArray(configurations) || configurations.length === 0) {
      return res.status(400).json({ message: "No configurations provided" });
    }

    const configsToCreate = configurations.map((config) => ({
      ...config,
      examSessionId,
      createdBy: userId,
    }));

    const created = await ATKTSubjectConfig.insertMany(configsToCreate, {
      ordered: false,
    });

    res.status(201).json({
      message: `${created.length} subject configuration(s) created successfully`,
      configs: created,
    });
  } catch (error) {
    console.error("Bulk create subject configs error:", error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Some configurations already exist",
        error: error.message,
      });
    }
    res.status(500).json({
      message: error.message || "Failed to create subject configurations",
    });
  }
};

// Get subject configs with their linking status for ATKT
export const getAtktSubjectConfigsForLinking = async (req, res) => {
  try {
    const { examSessionId } = req.query;

    const filter = {};
    if (examSessionId) filter.examSessionId = examSessionId;

    const configs = await ATKTSubjectConfig.find(filter)
      .populate("examSessionId", "title academicYear term")
      .populate("subjects.subjectId", "subjectName subjectCode markingScheme")
      .lean();

    // Transform to include linking status for each subject
    const result = configs.map((config) => ({
      ...config,
      subjects: config.subjects.map((subj) => ({
        ...subj,
        isLinked: !!subj.subjectId,
        linkedSubject: subj.subjectId || null,
      })),
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching ATKT subject configs for linking:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch configs", error: error.message });
  }
};

// Link/unlink a subject in an ATKT config
export const linkAtktSubjectInConfig = async (req, res) => {
  try {
    const { configId, examSubjectId } = req.params;
    const { subjectId } = req.body;

    const config = await ATKTSubjectConfig.findById(configId);
    if (!config) {
      return res.status(404).json({ message: "Subject config not found" });
    }

    // Find the subject in the config's subjects array
    const subjectIndex = config.subjects.findIndex(
      (s) => s.id === examSubjectId
    );
    if (subjectIndex === -1) {
      return res.status(404).json({ message: "Subject not found in config" });
    }

    // Update the subjectId (null to unlink, ObjectId to link)
    config.subjects[subjectIndex].subjectId = subjectId || null;
    await config.save();

    // Also update any existing ATKT forms that have this subject
    await ATKTForm.updateMany(
      { examSessionId: config.examSessionId, "subjects.id": examSubjectId },
      { $set: { "subjects.$[elem].subjectId": subjectId || null } },
      { arrayFilters: [{ "elem.id": examSubjectId }] }
    );

    // Populate the linked subject for response
    const updatedConfig = await ATKTSubjectConfig.findById(configId)
      .populate("subjects.subjectId", "subjectName subjectCode markingScheme")
      .lean();

    res.status(200).json({
      message: subjectId
        ? "Subject linked successfully"
        : "Subject unlinked successfully",
      config: updatedConfig,
    });
  } catch (error) {
    console.error("Error linking ATKT subject:", error);
    res
      .status(500)
      .json({ message: "Failed to link subject", error: error.message });
  }
};

// Bulk link subjects in an ATKT config
export const bulkLinkAtktSubjectsInConfig = async (req, res) => {
  try {
    const { configId } = req.params;
    const { links } = req.body; // Array of { examSubjectId, subjectId }

    if (!Array.isArray(links)) {
      return res.status(400).json({ message: "links must be an array" });
    }

    const config = await ATKTSubjectConfig.findById(configId);
    if (!config) {
      return res.status(404).json({ message: "Subject config not found" });
    }

    // Update each subject
    for (const { examSubjectId, subjectId } of links) {
      const subjectIndex = config.subjects.findIndex(
        (s) => s.id === examSubjectId
      );
      if (subjectIndex !== -1) {
        config.subjects[subjectIndex].subjectId = subjectId || null;

        // Also update existing ATKT forms
        await ATKTForm.updateMany(
          { examSessionId: config.examSessionId, "subjects.id": examSubjectId },
          { $set: { "subjects.$[elem].subjectId": subjectId || null } },
          { arrayFilters: [{ "elem.id": examSubjectId }] }
        );
      }
    }

    await config.save();

    const updatedConfig = await ATKTSubjectConfig.findById(configId)
      .populate("subjects.subjectId", "subjectName subjectCode markingScheme")
      .lean();

    res.status(200).json({
      message: `${links.length} link(s) saved successfully`,
      config: updatedConfig,
    });
  } catch (error) {
    console.error("Error bulk linking ATKT subjects:", error);
    res
      .status(500)
      .json({ message: "Failed to save links", error: error.message });
  }
};
