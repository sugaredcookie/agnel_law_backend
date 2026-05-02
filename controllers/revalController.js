import RevalSession from "../models/revalSessionModel.js";
import RevalSubjectConfig from "../models/revalSubjectConfigModel.js";
import RevalApplication from "../models/revalApplicationModel.js";
import BatchGroup from "../models/batchGroupModel.js";
import Batch from "../models/batchesModel.js";
import Subject from "../models/subjectModel.js";
import {
  createWorkbook,
  createStandardWorksheet,
  sendExcelResponse,
  formatExcelDate,
} from "../utils/excelHelper.js";

// --- Session CRUD ---

export const createRevalSession = async (req, res) => {
  try {
    const {
      title,
      academicYear,
      term,
      registrationStartDate,
      registrationEndDate,
      description,
    } = req.body;

    const userId = req.user?.id || req.user?.examinerId;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const session = await RevalSession.create({
      title,
      academicYear,
      term,
      registrationStartDate,
      registrationEndDate,
      description,
      createdBy: userId,
      status: "draft",
    });

    res.status(201).json({ message: "Revaluation session created", session });
  } catch (error) {
    console.error("Create reval session error:", error);
    res.status(500).json({ message: error.message || "Failed to create session" });
  }
};

export const getAllRevalSessions = async (req, res) => {
  try {
    const { status, academicYear, isActive } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (academicYear) filters.academicYear = academicYear;
    if (isActive !== undefined) filters.isActive = isActive === "true";

    const sessions = await RevalSession.find(filters).sort({ createdAt: -1 });
    res.status(200).json({ sessions });
  } catch (error) {
    console.error("Fetch reval sessions error:", error);
    res.status(500).json({ message: "Failed to fetch sessions" });
  }
};

export const getRevalSessionById = async (req, res) => {
  try {
    const session = await RevalSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.status(200).json({ session });
  } catch (error) {
    console.error("Fetch reval session error:", error);
    res.status(500).json({ message: "Failed to fetch session" });
  }
};

export const updateRevalSession = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.examinerId;
    const session = await RevalSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.status === "closed") {
      return res.status(400).json({ message: "Cannot update a closed session" });
    }

    const updates = { ...req.body, updatedBy: userId };
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.createdBy;

    const updated = await RevalSession.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ message: "Session updated", session: updated });
  } catch (error) {
    console.error("Update reval session error:", error);
    res.status(500).json({ message: error.message || "Failed to update session" });
  }
};

export const deleteRevalSession = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await RevalSession.findById(id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const appCount = await RevalApplication.countDocuments({ sessionId: id });
    if (appCount > 0) {
      return res.status(400).json({
        message: `Cannot delete session with ${appCount} application(s). Archive it instead.`,
      });
    }

    await RevalSubjectConfig.deleteMany({ sessionId: id });
    await RevalSession.findByIdAndDelete(id);

    res.status(200).json({ message: "Session and configs deleted" });
  } catch (error) {
    console.error("Delete reval session error:", error);
    res.status(500).json({ message: "Failed to delete session" });
  }
};

export const activateRevalSession = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.examinerId;
    const session = await RevalSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const configCount = await RevalSubjectConfig.countDocuments({
      sessionId: req.params.id,
      isActive: true,
    });
    if (configCount === 0) {
      return res.status(400).json({
        message: "Cannot activate session without subject configurations",
      });
    }

    await RevalSession.updateMany({ isActive: true }, { isActive: false, updatedBy: userId });

    session.isActive = true;
    session.status = "active";
    session.updatedBy = userId;
    await session.save();

    res.status(200).json({ message: "Session activated", session });
  } catch (error) {
    console.error("Activate reval session error:", error);
    res.status(500).json({ message: "Failed to activate session" });
  }
};

export const deactivateRevalSession = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.examinerId;
    const session = await RevalSession.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedBy: userId },
      { new: true },
    );
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.status(200).json({ message: "Session deactivated", session });
  } catch (error) {
    console.error("Deactivate reval session error:", error);
    res.status(500).json({ message: "Failed to deactivate session" });
  }
};

export const closeRevalSession = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.examinerId;
    const session = await RevalSession.findByIdAndUpdate(
      req.params.id,
      { status: "closed", isActive: false, updatedBy: userId },
      { new: true },
    );
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.status(200).json({ message: "Session closed", session });
  } catch (error) {
    console.error("Close reval session error:", error);
    res.status(500).json({ message: "Failed to close session" });
  }
};

// --- Subject Config CRUD ---

export const createRevalSubjectConfig = async (req, res) => {
  try {
    const { sessionId, course, batch, batchLabel, subjects } = req.body;
    const userId = req.user?.id || req.user?.examinerId;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    const session = await RevalSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.status === "closed") {
      return res.status(400).json({ message: "Cannot add subjects to a closed session" });
    }

    const existing = await RevalSubjectConfig.findOne({ sessionId, course, batch });
    if (existing) {
      return res.status(400).json({ message: "Config already exists for this combination" });
    }

    const config = await RevalSubjectConfig.create({
      sessionId,
      course,
      batch,
      batchLabel,
      subjects,
      createdBy: userId,
    });

    res.status(201).json({ message: "Subject config created", config });
  } catch (error) {
    console.error("Create reval subject config error:", error);
    res.status(500).json({ message: error.message || "Failed to create config" });
  }
};

export const getRevalSubjectConfigs = async (req, res) => {
  try {
    const { sessionId, course, batch, isActive } = req.query;
    const filters = {};
    if (sessionId) filters.sessionId = sessionId;
    if (course) filters.course = course;
    if (batch) filters.batch = batch;
    if (isActive !== undefined) filters.isActive = isActive === "true";

    const configs = await RevalSubjectConfig.find(filters)
      .populate("sessionId", "title academicYear term status")
      .sort({ createdAt: -1 });

    res.status(200).json({ configs });
  } catch (error) {
    console.error("Fetch reval subject configs error:", error);
    res.status(500).json({ message: "Failed to fetch configs" });
  }
};

export const updateRevalSubjectConfig = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.examinerId;
    const config = await RevalSubjectConfig.findById(req.params.id).populate("sessionId");
    if (!config) return res.status(404).json({ message: "Config not found" });
    if (config.sessionId.status === "closed") {
      return res.status(400).json({ message: "Cannot update config for a closed session" });
    }

    const updates = { ...req.body, updatedBy: userId };
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.createdBy;
    delete updates.sessionId;

    const updated = await RevalSubjectConfig.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate("sessionId", "title academicYear term status");

    res.status(200).json({ message: "Config updated", config: updated });
  } catch (error) {
    console.error("Update reval subject config error:", error);
    res.status(500).json({ message: error.message || "Failed to update config" });
  }
};

export const deleteRevalSubjectConfig = async (req, res) => {
  try {
    const config = await RevalSubjectConfig.findById(req.params.id);
    if (!config) return res.status(404).json({ message: "Config not found" });

    const appCount = await RevalApplication.countDocuments({
      sessionId: config.sessionId,
      course: config.course,
      batch: config.batch,
    });
    if (appCount > 0) {
      return res.status(400).json({
        message: `Cannot delete config with ${appCount} application(s). Deactivate it instead.`,
      });
    }

    await RevalSubjectConfig.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Config deleted" });
  } catch (error) {
    console.error("Delete reval subject config error:", error);
    res.status(500).json({ message: "Failed to delete config" });
  }
};

export const bulkCreateRevalSubjectConfigs = async (req, res) => {
  try {
    const { sessionId, configurations } = req.body;
    const userId = req.user?.id || req.user?.examinerId;
    if (!userId) return res.status(401).json({ message: "User not authenticated" });

    const session = await RevalSession.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.status === "closed") {
      return res.status(400).json({ message: "Cannot add subjects to a closed session" });
    }

    if (!Array.isArray(configurations) || configurations.length === 0) {
      return res.status(400).json({ message: "No configurations provided" });
    }

    const configsToCreate = configurations.map((c) => ({
      ...c,
      sessionId,
      createdBy: userId,
    }));

    const created = await RevalSubjectConfig.insertMany(configsToCreate, { ordered: false });

    res.status(201).json({
      message: `${created.length} config(s) created`,
      configs: created,
    });
  } catch (error) {
    console.error("Bulk create reval subject configs error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Some configs already exist", error: error.message });
    }
    res.status(500).json({ message: error.message || "Failed to create configs" });
  }
};

// --- Student-facing: Catalog & Submit ---

const buildRevalCatalog = async (sessionId) => {
  const configs = await RevalSubjectConfig.find({ sessionId, isActive: true }).lean();
  if (!configs.length) return { courses: [], batches: {} };

  const coursesSet = new Set();
  const batchesMap = new Map();

  configs.forEach((config) => {
    coursesSet.add(config.course);
    const batchKey = config.batch;
    if (!batchesMap.has(batchKey)) {
      batchesMap.set(batchKey, {
        label: config.batchLabel,
        course: config.course,
        subjects: config.subjects,
      });
    }
  });

  const courses = Array.from(coursesSet).map((name) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    label: name,
    value: name,
    batches: Array.from(batchesMap.entries())
      .filter(([, d]) => d.course === name)
      .map(([key]) => key),
  }));

  const batches = Object.fromEntries(batchesMap);
  return { courses, batches };
};

export const fetchRevalCatalog = async (req, res) => {
  try {
    const activeSession = await RevalSession.findOne({ isActive: true, status: "active" });
    if (!activeSession) {
      return res.status(404).json({
        message: "No active revaluation/photocopy session available",
        catalog: { courses: [], batches: {} },
        hasActiveSession: false,
      });
    }

    const now = new Date();
    if (now < activeSession.registrationStartDate || now > activeSession.registrationEndDate) {
      return res.status(400).json({
        message: "Registration is not open at this time",
        session: {
          title: activeSession.title,
          registrationStartDate: activeSession.registrationStartDate,
          registrationEndDate: activeSession.registrationEndDate,
        },
        catalog: { courses: [], batches: {} },
        hasActiveSession: true,
        registrationOpen: false,
      });
    }

    const catalog = await buildRevalCatalog(activeSession._id);

    res.status(200).json({
      catalog,
      session: {
        id: activeSession._id,
        title: activeSession.title,
        academicYear: activeSession.academicYear,
        term: activeSession.term,
        registrationStartDate: activeSession.registrationStartDate,
        registrationEndDate: activeSession.registrationEndDate,
        description: activeSession.description,
      },
      hasActiveSession: true,
      registrationOpen: true,
    });
  } catch (error) {
    console.error("Failed to load reval catalog:", error);
    res.status(500).json({ message: "Failed to load catalog" });
  }
};

// Price per subject
const REVAL_PRICE_PER_SUBJECT = 250;
const PHOTOCOPY_PRICE_PER_SUBJECT = 50;

export const submitRevalApplication = async (req, res) => {
  const {
    studentName,
    rollNumber,
    contactNumber,
    course,
    batch,
    subjects,
    applicationType,
  } = req.body || {};

  if (
    !studentName?.trim() ||
    !rollNumber?.trim() ||
    !contactNumber?.trim() ||
    !course?.trim() ||
    !batch?.trim() ||
    !applicationType
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (!["revaluation", "photocopy"].includes(applicationType)) {
    return res.status(400).json({ message: "Invalid application type" });
  }

  try {
    const activeSession = await RevalSession.findOne({ isActive: true, status: "active" });
    if (!activeSession) {
      return res.status(400).json({ message: "No active session available" });
    }

    const now = new Date();
    if (now < activeSession.registrationStartDate || now > activeSession.registrationEndDate) {
      return res.status(400).json({ message: "Registration is not open at this time" });
    }

    const subjectConfig = await RevalSubjectConfig.findOne({
      sessionId: activeSession._id,
      course,
      batch,
      isActive: true,
    });

    if (!subjectConfig) {
      return res.status(400).json({ message: "Invalid batch/course combination for this session" });
    }

    if (!Array.isArray(subjects) || !subjects.length) {
      return res.status(400).json({ message: "Select at least one subject" });
    }

    const subjectMap = new Map(subjectConfig.subjects.map((s) => [s.id, s]));
    const uniqueIds = [...new Set(subjects)];
    const invalid = uniqueIds.filter((id) => !subjectMap.has(id));
    if (invalid.length) {
      return res.status(400).json({ message: "One or more selected subjects are invalid", invalid });
    }

    const selectedSubjects = uniqueIds.map((id) => {
      const s = subjectMap.get(id);
      return { id: s.id, label: s.label };
    });

    const submittedByRole = req.user?.studentId
      ? "student"
      : req.user?.id
        ? "examiner"
        : "unknown";
    const submittedBy = req.user?.studentId || req.user?.id || null;

    const pricePerSubject =
      applicationType === "revaluation" ? REVAL_PRICE_PER_SUBJECT : PHOTOCOPY_PRICE_PER_SUBJECT;
    const amount = selectedSubjects.length * pricePerSubject;

    // Check for existing pending or paid application of same type in same session
    let application = await RevalApplication.findOne({
      submittedBy,
      submittedByRole,
      sessionId: activeSession._id,
      applicationType,
    });

    if (application && application.paymentStatus === "paid") {
      return res.status(400).json({
        message: `You have already submitted and paid for ${applicationType} in this session`,
      });
    }

    const basePayload = {
      studentName: studentName.trim(),
      rollNumber: rollNumber.trim(),
      contactNumber: contactNumber.trim(),
      course,
      batch,
      subjects: selectedSubjects,
      submittedBy,
      submittedByRole,
      sessionId: activeSession._id,
      applicationType,
      paymentStatus: "pending",
      amount,
    };

    if (application) {
      application = await RevalApplication.findByIdAndUpdate(application._id, basePayload, {
        new: true,
      });
    } else {
      application = await RevalApplication.create(basePayload);
    }

    const rpInstance = (await import("razorpay")).default;
    const razorpay = new rpInstance({
      key_id: process.env.RAZORPAY_KEY || "rzp_test_1DP5mmOlF5G5ag",
      key_secret: process.env.RAZORPAY_SECRET,
    });

    const typeLabel = applicationType === "revaluation" ? "REVAL" : "PHOTO";
    const timestamp = Date.now().toString().slice(-6);
    let receiptId = `${typeLabel}_${(rollNumber || "").replace(/[^A-Za-z0-9]/g, "").slice(-10)}_${timestamp}`;
    if (receiptId.length > 40) receiptId = receiptId.slice(0, 40);

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: receiptId,
      notes: {
        paymentType: "revaluation",
        revalApplicationId: application._id.toString(),
        applicationType,
        sessionId: activeSession._id.toString(),
        subjectCount: selectedSubjects.length.toString(),
        studentName: studentName.trim(),
        rollNumber: rollNumber.trim(),
      },
    };

    const order = await razorpay.orders.create(options);

    return res.status(201).json({
      message: `${applicationType === "revaluation" ? "Revaluation" : "Photocopy"} application initiated. Redirecting to payment...`,
      data: { applicationId: application._id, amount },
      order,
      key: process.env.RAZORPAY_KEY,
      callback_url: `${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`}/api/payments/verify-hosted-payment`,
      user: {
        name: studentName.trim(),
        email: req.user?.email || "",
        mobile: contactNumber.trim(),
      },
    });
  } catch (error) {
    console.error("Submit reval application error:", error);
    res.status(500).json({ message: error.message || "Could not submit the application" });
  }
};

export const getMyRevalApplications = async (req, res) => {
  try {
    const submittedBy = req.user?.studentId || req.user?.id;
    if (!submittedBy) return res.status(401).json({ message: "User not authenticated" });

    const applications = await RevalApplication.find({ submittedBy })
      .populate("paymentRef")
      .sort({ createdAt: -1 });

    res.status(200).json({ applications });
  } catch (error) {
    console.error("Get my reval applications error:", error);
    res.status(500).json({ message: "Failed to fetch applications" });
  }
};

// --- Examiner: View all applications (with filters) ---

export const fetchRevalApplications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      course,
      batch,
      applicationType,
      paymentStatus,
      sessionId,
      search,
    } = req.query;

    const filters = {};
    if (course) filters.course = course;
    if (batch) filters.batch = batch;
    if (applicationType) filters.applicationType = applicationType;
    if (paymentStatus) filters.paymentStatus = paymentStatus;
    if (sessionId) filters.sessionId = sessionId;

    if (search) {
      filters.$or = [
        { studentName: { $regex: search, $options: "i" } },
        { rollNumber: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [applications, total] = await Promise.all([
      RevalApplication.find(filters)
        .populate("paymentRef")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      RevalApplication.countDocuments(filters),
    ]);

    res.status(200).json({
      applications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Fetch reval applications error:", error);
    res.status(500).json({ message: "Failed to fetch applications" });
  }
};

// --- Fetch batch groups with subjects for subject config ---

export const fetchBatchGroupsWithSubjects = async (req, res) => {
  try {
    const batchGroups = await BatchGroup.find({})
      .populate({
        path: "batches",
        select: "batchName subjects term",
        populate: {
          path: "subjects",
          select: "subjectName subjectCode",
        },
      })
      .sort({ groupName: 1 });

    const result = batchGroups.map((group) => {
      const subjectMap = new Map();
      (group.batches || []).forEach((batch) => {
        (batch.subjects || []).forEach((subject) => {
          if (!subjectMap.has(subject._id.toString())) {
            subjectMap.set(subject._id.toString(), {
              _id: subject._id,
              subjectName: subject.subjectName,
              subjectCode: subject.subjectCode,
            });
          }
        });
      });

      return {
        _id: group._id,
        groupName: group.groupName,
        program: group.program,
        department: group.department,
        batches: (group.batches || []).map((b) => ({
          _id: b._id,
          batchName: b.batchName,
          term: b.term,
        })),
        subjects: Array.from(subjectMap.values()),
      };
    });

    res.status(200).json({ batchGroups: result });
  } catch (error) {
    console.error("Fetch batch groups error:", error);
    res.status(500).json({ message: "Failed to fetch batch groups" });
  }
};

// --- Download reval/photocopy applications as Excel ---

export const downloadRevalApplicationsExcel = async (req, res) => {
  try {
    const { sessionId, course, batch, applicationType, paymentStatus } = req.query;

    const filters = {};
    if (sessionId) filters.sessionId = sessionId;
    if (course) filters.course = course;
    if (batch) filters.batch = batch;
    if (applicationType) filters.applicationType = applicationType;
    if (paymentStatus) filters.paymentStatus = paymentStatus;

    const applications = await RevalApplication.find(filters)
      .populate("sessionId", "title academicYear term")
      .populate("paymentRef")
      .sort({ createdAt: -1 })
      .lean();

    const headers = [
      { label: "Sr No.", key: "srNo", width: 8 },
      { label: "Student Name", key: "studentName", width: 25 },
      { label: "Roll Number", key: "rollNumber", width: 18 },
      { label: "Contact Number", key: "contactNumber", width: 18 },
      { label: "Course", key: "course", width: 12 },
      { label: "Batch", key: "batch", width: 15 },
      { label: "Type", key: "applicationType", width: 14 },
      { label: "Subjects", key: "subjects", width: 45 },
      { label: "Subject Count", key: "subjectCount", width: 14 },
      { label: "Amount", key: "amount", width: 12 },
      { label: "Payment Status", key: "paymentStatus", width: 15 },
      { label: "Payment ID", key: "paymentId", width: 28 },
      { label: "Paid At", key: "paidAt", width: 20 },
      { label: "Submitted At", key: "submittedAt", width: 20 },
      { label: "Session", key: "sessionTitle", width: 25 },
    ];

    const data = applications.map((app, idx) => ({
      srNo: idx + 1,
      studentName: app.studentName || "",
      rollNumber: app.rollNumber || "",
      contactNumber: app.contactNumber || "",
      course: app.course || "",
      batch: app.batch || "",
      applicationType: app.applicationType === "revaluation" ? "Revaluation" : "Photocopy",
      subjects: Array.isArray(app.subjects)
        ? app.subjects.map((s) => s.label || s).join(", ")
        : "",
      subjectCount: Array.isArray(app.subjects) ? app.subjects.length : 0,
      amount: app.amount || 0,
      paymentStatus: app.paymentStatus || "pending",
      paymentId: app.paymentRef?.razorpay_payment_id || app.paymentRef?.orderId || "N/A",
      paidAt: formatExcelDate(app.paidAt),
      submittedAt: formatExcelDate(app.createdAt),
      sessionTitle: app.sessionId?.title || "",
    }));

    const workbook = createWorkbook();
    createStandardWorksheet(workbook, "Reval & Photocopy Applications", headers, data);

    await sendExcelResponse(
      res,
      workbook,
      `reval_photocopy_applications_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  } catch (error) {
    console.error("Error downloading reval applications Excel:", error);
    res.status(500).json({ message: "Failed to download Excel", error: error.message });
  }
};
