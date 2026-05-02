// ElectiveSession controller - Admin CRUD + session management for elective selection windows
import ElectiveSession from "../models/electiveSessionModel.js";
import studentModel from "../models/studentModel.js";
import batchGroupModel from "../models/batchGroupModel.js";
import { transporter } from "../NodeMailer.js";

async function getGroupBatchIds(groupId) {
  const group = await batchGroupModel.findById(groupId).select("batches");
  return group?.batches?.map((b) => b.toString()) || [];
}

async function deriveElectiveSubjects(groupId) {
  const group = await batchGroupModel.findById(groupId).populate({
    path: "batches",
    populate: { path: "subjects" },
  });
  if (!group) return [];
  const seen = new Set();
  const electives = [];
  for (const batch of group.batches || []) {
    for (const sub of batch.subjects || []) {
      if (sub.isElective && !seen.has(sub._id.toString())) {
        seen.add(sub._id.toString());
        electives.push(sub);
      }
    }
  }
  return electives;
}

export const createSession = async (req, res) => {
  try {
    const { name, batchGroup, openAt, closeAt, maxSelectionsPerStudent, allowReselection, capacityPerSubject, notifyOnOpen, notifyBeforeDeadline } = req.body;
    if (!name || !batchGroup) return res.status(400).json({ message: "name and batchGroup are required" });

    const group = await batchGroupModel.findById(batchGroup);
    if (!group) return res.status(404).json({ message: "Batch group not found" });

    const session = await ElectiveSession.create({
      name,
      batchGroup,
      openAt: openAt || undefined,
      closeAt: closeAt || undefined,
      maxSelectionsPerStudent: maxSelectionsPerStudent || undefined,
      allowReselection: allowReselection !== false,
      capacityPerSubject: capacityPerSubject || 0,
      notifyOnOpen: !!notifyOnOpen,
      notifyBeforeDeadline: !!notifyBeforeDeadline,
      createdBy: req.user?.id || null,
    });

    res.status(201).json({ session });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const listSessions = async (req, res) => {
  try {
    const { batchGroupId, status } = req.query;
    const query = {};
    if (batchGroupId) query.batchGroup = batchGroupId;
    if (status) query.status = status;

    const sessions = await ElectiveSession.find(query)
      .populate({
        path: "batchGroup",
        select: "groupName program batches",
        populate: { path: "batches", select: "batchName" },
      })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    const enriched = [];
    for (const s of sessions) {
      const electives = await deriveElectiveSubjects(s.batchGroup._id);
      enriched.push({
        ...s.toObject(),
        electiveSubjects: electives.map((e) => ({
          _id: e._id,
          subjectName: e.subjectName,
          subjectCode: e.subjectCode,
        })),
      });
    }

    res.json({ sessions: enriched });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getSession = async (req, res) => {
  try {
    const session = await ElectiveSession.findById(req.params.id)
      .populate({
        path: "batchGroup",
        select: "groupName program batches",
        populate: { path: "batches", select: "batchName maxElectives" },
      })
      .populate("createdBy", "name email");

    if (!session) return res.status(404).json({ message: "Session not found" });

    const batchIds = session.batchGroup.batches.map((b) => b._id);
    const electiveSubjects = await deriveElectiveSubjects(session.batchGroup._id);

    const students = await studentModel.find({
      "academicDetails.batch.id": { $in: batchIds },
      status: "active",
    }).select("studentDetails.firstName studentDetails.lastName academicDetails.rollNumber selectedElectives");

    const selectionStats = {};
    let submittedCount = 0;
    for (const s of students) {
      if (s.selectedElectives?.length > 0) {
        submittedCount++;
        for (const e of s.selectedElectives) {
          const sid = e.subject.toString();
          selectionStats[sid] = (selectionStats[sid] || 0) + 1;
        }
      }
    }

    res.json({
      session: {
        ...session.toObject(),
        electiveSubjects: electiveSubjects.map((e) => ({
          _id: e._id,
          subjectName: e.subjectName,
          subjectCode: e.subjectCode,
        })),
      },
      stats: {
        totalStudents: students.length,
        submittedCount,
        pendingCount: students.length - submittedCount,
        selectionStats,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateSession = async (req, res) => {
  try {
    const { name, status, openAt, closeAt, maxSelectionsPerStudent, allowReselection, capacityPerSubject, notifyOnOpen, notifyBeforeDeadline } = req.body;

    const session = await ElectiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    if (name !== undefined) session.name = name;
    if (status !== undefined) session.status = status;
    if (openAt !== undefined) session.openAt = openAt || null;
    if (closeAt !== undefined) session.closeAt = closeAt || null;
    if (maxSelectionsPerStudent !== undefined) session.maxSelectionsPerStudent = maxSelectionsPerStudent;
    if (allowReselection !== undefined) session.allowReselection = allowReselection;
    if (capacityPerSubject !== undefined) session.capacityPerSubject = capacityPerSubject;
    if (notifyOnOpen !== undefined) session.notifyOnOpen = notifyOnOpen;
    if (notifyBeforeDeadline !== undefined) session.notifyBeforeDeadline = notifyBeforeDeadline;

    await session.save();
    res.json({ session });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteSession = async (req, res) => {
  try {
    const session = await ElectiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.status !== "draft")
      return res.status(400).json({ message: "Only draft sessions can be deleted" });
    await session.deleteOne();
    res.json({ message: "Session deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getSessionSelections = async (req, res) => {
  try {
    const session = await ElectiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const batchIds = await getGroupBatchIds(session.batchGroup);

    const students = await studentModel.find({
      "academicDetails.batch.id": { $in: batchIds },
      status: "active",
    })
      .select("studentDetails.firstName studentDetails.lastName studentDetails.emailAddress academicDetails.rollNumber academicDetails.batch selectedElectives")
      .populate("selectedElectives.subject", "subjectName subjectCode")
      .sort({ "academicDetails.rollNumber": 1 });

    res.json({
      session: { _id: session._id, name: session.name },
      students: students.map((s) => ({
        _id: s._id,
        name: `${s.studentDetails?.firstName || ""} ${s.studentDetails?.lastName || ""}`.trim(),
        rollNumber: s.academicDetails?.rollNumber,
        email: s.studentDetails?.emailAddress,
        batchName: s.academicDetails?.batch?.name,
        selectedElectives: s.selectedElectives || [],
        isLocked: session.lockedStudents?.some((ls) => ls.toString() === s._id.toString()),
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const lockSession = async (req, res) => {
  try {
    const session = await ElectiveSession.findByIdAndUpdate(
      req.params.id,
      { status: "locked" },
      { new: true },
    );
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.json({ message: "Session locked", session });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const lockStudent = async (req, res) => {
  try {
    const session = await ElectiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const sid = req.params.studentId;
    if (!session.lockedStudents.some((ls) => ls.toString() === sid)) {
      session.lockedStudents.push(sid);
      await session.save();
    }
    res.json({ message: "Student locked", lockedStudents: session.lockedStudents });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const unlockStudent = async (req, res) => {
  try {
    const session = await ElectiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    session.lockedStudents = session.lockedStudents.filter(
      (ls) => ls.toString() !== req.params.studentId,
    );
    await session.save();
    res.json({ message: "Student unlocked", lockedStudents: session.lockedStudents });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const processAutoOpenClose = async () => {
  const now = new Date();

  const toOpen = await ElectiveSession.find({
    status: "draft",
    openAt: { $lte: now },
  });
  for (const s of toOpen) {
    s.status = "open";
    await s.save();
    if (s.notifyOnOpen) sendSessionOpenEmail(s).catch(() => {});
  }

  const toClose = await ElectiveSession.find({
    status: "open",
    closeAt: { $lte: now },
  });
  for (const s of toClose) {
    s.status = "closed";
    await s.save();
  }

  const reminderWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const toRemind = await ElectiveSession.find({
    status: "open",
    notifyBeforeDeadline: true,
    deadlineReminderSent: false,
    closeAt: { $lte: reminderWindow, $gt: now },
  });
  for (const s of toRemind) {
    sendDeadlineReminderEmail(s).catch(() => {});
    s.deadlineReminderSent = true;
    await s.save();
  }
};

async function sendSessionOpenEmail(session) {
  const batchIds = await getGroupBatchIds(session.batchGroup);

  const students = await studentModel.find({
    "academicDetails.batch.id": { $in: batchIds },
    status: "active",
  }).select("studentDetails.emailAddress studentDetails.firstName");

  const emails = students.map((s) => s.studentDetails?.emailAddress).filter(Boolean);
  if (!emails.length) return;

  const deadlineStr = session.closeAt
    ? `Deadline: ${new Date(session.closeAt).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}`
    : "";

  await transporter.sendMail({
    from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_EMAIL_USER}>`,
    bcc: emails,
    subject: `Elective Selection Open - ${session.name}`,
    html: `<p>Elective selection is now open for <b>${session.name}</b>.</p><p>Please login to the student portal and make your selection.</p>${deadlineStr ? `<p>${deadlineStr}</p>` : ""}`,
  });
}

async function sendDeadlineReminderEmail(session) {
  const batchIds = await getGroupBatchIds(session.batchGroup);

  const students = await studentModel.find({
    "academicDetails.batch.id": { $in: batchIds },
    status: "active",
    $or: [
      { selectedElectives: { $exists: false } },
      { selectedElectives: { $size: 0 } },
    ],
  }).select("studentDetails.emailAddress");

  const emails = students.map((s) => s.studentDetails?.emailAddress).filter(Boolean);
  if (!emails.length) return;

  await transporter.sendMail({
    from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_EMAIL_USER}>`,
    bcc: emails,
    subject: `Reminder: Elective Selection Closing Soon - ${session.name}`,
    html: `<p>This is a reminder that elective selection for <b>${session.name}</b> closes on <b>${new Date(session.closeAt).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}</b>.</p><p>Please login to the student portal and submit your selection before the deadline.</p>`,
  });
}

export const exportSessionSelections = async (req, res) => {
  try {
    const session = await ElectiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const batchIds = await getGroupBatchIds(session.batchGroup);

    const students = await studentModel.find({
      "academicDetails.batch.id": { $in: batchIds },
      status: "active",
    })
      .select("studentDetails.firstName studentDetails.lastName academicDetails.rollNumber academicDetails.batch selectedElectives")
      .populate("selectedElectives.subject", "subjectName subjectCode")
      .sort({ "academicDetails.rollNumber": 1 });

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Selections");

    sheet.columns = [
      { header: "Roll No", key: "rollNo", width: 12 },
      { header: "Name", key: "name", width: 28 },
      { header: "Batch", key: "batch", width: 20 },
      { header: "Selected Electives", key: "electives", width: 50 },
      { header: "Status", key: "status", width: 14 },
    ];

    for (const s of students) {
      const elNames = (s.selectedElectives || [])
        .map((e) => e.subject?.subjectName || "Unknown")
        .join(", ");
      sheet.addRow({
        rollNo: s.academicDetails?.rollNumber || "",
        name: `${s.studentDetails?.firstName || ""} ${s.studentDetails?.lastName || ""}`.trim(),
        batch: s.academicDetails?.batch?.name || "",
        electives: elNames,
        status: s.selectedElectives?.length > 0 ? "Submitted" : "Pending",
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=elective-selections-${session.name.replace(/\s+/g, "-")}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
