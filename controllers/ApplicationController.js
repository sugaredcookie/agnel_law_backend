import applicationModel from "../models/applicationModel.js";
import counter from "../models/counterModel.js";
import { transporter } from "../NodeMailer.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import Program from "../models/programModel.js";
import paymentModel from "../models/paymentModel.js";
import {
  createWorkbook,
  createStandardWorksheet,
  sendExcelResponse,
} from "../utils/excelHelper.js";
import ExcelJS from "exceljs";

export const registerApplicationForm = async (req, res) => {
  try {
    let applicationData = req.body;
    const files = req.files;

    applicationData.loginStudentId = req.user.userId;

    // Check if student already has an application
    const existingApplication = await applicationModel.findOne({
      loginStudentId: applicationData.loginStudentId,
    });

    if (existingApplication) {
      return res.status(400).json({
        message:
          "You have already submitted an application. Multiple submissions are not allowed.",
      });
    }

    applicationData.course = applicationData.course;

    applicationData.applicationNumber =
      await getNextSequenceValue("applicationNumber");

    if (!applicationData.studentDetails) {
      applicationData.studentDetails = {};
    }

    if (files.studentImage) {
      try {
        const imageUploadResult = await uploadToCloudinary(
          files.studentImage[0],
        );
        applicationData.studentDetails.studentImage = imageUploadResult.url;
      } catch (uploadError) {
        console.error(
          "Cloudinary upload error for student image:",
          uploadError,
        );
        return res.status(400).json({
          message: "Error uploading student image",
          error: uploadError.message || "Unknown Cloudinary error",
        });
      }
    }

    applicationData.certificates = [];
    if (files.certificates && applicationData.certificateNames) {
      const certificateTypes = Array.isArray(applicationData.certificateNames)
        ? applicationData.certificateNames
        : [applicationData.certificateNames];

      for (let i = 0; i < files.certificates.length; i++) {
        try {
          const certificateUploadResult = await uploadToCloudinary(
            files.certificates[i],
          );
          applicationData.certificates.push({
            type: certificateTypes[i],
            fileUrl: certificateUploadResult.url,
            status: "pending",
            remark: "",
            verifiedAt: null,
            verifiedBy: null,
          });
        } catch (uploadError) {
          console.error(
            `Cloudinary upload error for certificate ${certificateTypes[i]}:`,
            uploadError,
          );
          return res.status(400).json({
            message: `Error uploading certificate: ${certificateTypes[i]}`,
            error: uploadError.message || "Unknown Cloudinary error",
          });
        }
      }
    }

    const aq = applicationData.academicQualifications;
    if (aq && aq.cetExam) {
      if (
        aq.cetExam.obtainedMarks === "null" ||
        aq.cetExam.obtainedMarks === "" ||
        aq.cetExam.obtainedMarks === undefined ||
        aq.cetExam.obtainedMarks === "NaN"
      ) {
        aq.cetExam.obtainedMarks = null;
      }
      if (
        aq.cetExam.maximumMarks === "null" ||
        aq.cetExam.maximumMarks === "" ||
        aq.cetExam.maximumMarks === undefined ||
        aq.cetExam.maximumMarks === "NaN"
      ) {
        aq.cetExam.maximumMarks = null;
      }
    }
    if (aq && aq.graduation) {
      aq.graduation.forEach((grad) => {
        if (
          grad.obtainedMarks === "null" ||
          grad.obtainedMarks === "" ||
          grad.obtainedMarks === undefined ||
          grad.obtainedMarks === "NaN"
        ) {
          grad.obtainedMarks = null;
        }
        if (
          grad.maximumMarks === "null" ||
          grad.maximumMarks === "" ||
          grad.maximumMarks === undefined ||
          grad.maximumMarks === "NaN"
        ) {
          grad.maximumMarks = null;
        }
      });
    }

    if (
      aq &&
      (aq.graduationYearOfPassing === "null" ||
        aq.graduationYearOfPassing === "" ||
        aq.graduationYearOfPassing === undefined ||
        aq.graduationYearOfPassing === "NaN")
    ) {
      aq.graduationYearOfPassing = null;
    }

    const newRegistration = new applicationModel(applicationData);
    newRegistration
      .save()
      .then((savedData) => {
        res.status(201).json({
          message: "Form Submitted successfully",
          data: savedData,
        });
      })
      .catch((error) => {
        res
          .status(400)
          .json({ message: "Error saving data to the database", error });
      });
  } catch (error) {
    console.error("Error submitting application form:", error);
    res.status(400).json({
      message: "Error submitting form",
      error: error.message || "Unknown error",
    });
  }
};

export const getApplicationforms = async (req, res) => {
  try {
    const loginStudentId = req.user.userId;

    const applications = await applicationModel.find({ loginStudentId });

    if (applications.length === 0) {
      return res.status(404).json({ message: "No application forms found" });
    }

    res.status(200).json(applications);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving application forms", error });
  }
};

export const getSingleApplicationform = async (req, res) => {
  try {
    const { id } = req.params;
    const loginStudentId = req.user.userId;
    const application = await applicationModel.findOne({
      _id: id,
      loginStudentId,
    });

    if (!application) {
      return res.status(404).json({ message: "Application form not found" });
    }

    res.status(200).json(application);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving application form", error });
  }
};

const getNextSequenceValue = async (sequenceName) => {
  const sequenceDocument = await counter.findOneAndUpdate(
    { sequenceName },
    { $inc: { sequenceValue: 1 } },
    { new: true, upsert: true },
  );
  return sequenceDocument.sequenceValue;
};

export const registerUpdateApplicationForm = async (req, res) => {
  console.log("registerUpdateApplicationForm called");
  try {
    let applicationData = req.body;
    const _id = req.body._id;
    const files = req.files;

    applicationData = Object.keys(applicationData).reduce((acc, key) => {
      acc[key] = applicationData[key];
      return acc;
    }, {});

    if (applicationData.course) {
      applicationData.course = applicationData.course;
    }

    let updateData = { ...applicationData };

    if (applicationData.stage == 1) {
      if (files && files.studentImage) {
        try {
          const imageUploadResult = await uploadToCloudinary(
            files.studentImage[0],
          );
          updateData["studentDetails.studentImage"] = imageUploadResult.url;
        } catch (uploadError) {
          console.error(
            "Cloudinary upload error for student image update:",
            uploadError,
          );
          return res.status(400).json({
            message: "Error uploading student image",
            error: uploadError.message || "Unknown Cloudinary error",
          });
        }
      }
    } else if (applicationData.stage == 2) {
      const aq = applicationData.academicQualifications;
      if (aq && aq.cetExam) {
        if (
          aq.cetExam.obtainedMarks === "null" ||
          aq.cetExam.obtainedMarks === "" ||
          aq.cetExam.obtainedMarks === undefined ||
          aq.cetExam.obtainedMarks === "NaN"
        ) {
          aq.cetExam.obtainedMarks = null;
        }
        if (
          aq.cetExam.maximumMarks === "null" ||
          aq.cetExam.maximumMarks === "" ||
          aq.cetExam.maximumMarks === undefined ||
          aq.cetExam.maximumMarks === "NaN"
        ) {
          aq.cetExam.maximumMarks = null;
        }
      }
      if (aq && aq.graduation) {
        aq.graduation.forEach((grad) => {
          if (
            grad.obtainedMarks === "null" ||
            grad.obtainedMarks === "" ||
            grad.obtainedMarks === undefined ||
            grad.obtainedMarks === "NaN"
          ) {
            grad.obtainedMarks = null;
          }
          if (
            grad.maximumMarks === "null" ||
            grad.maximumMarks === "" ||
            grad.maximumMarks === undefined ||
            grad.maximumMarks === "NaN"
          ) {
            grad.maximumMarks = null;
          }
        });
      }

      if (
        aq &&
        (aq.graduationYearOfPassing === "null" ||
          aq.graduationYearOfPassing === "" ||
          aq.graduationYearOfPassing === undefined ||
          aq.graduationYearOfPassing === "NaN")
      ) {
        aq.graduationYearOfPassing = null;
      }
    } else if (applicationData.stage == 3) {
      const existingApplication = await applicationModel.findById(_id);
      if (!existingApplication) {
        return res.status(404).json({ message: "Application not found" });
      }

      const course = existingApplication.course.toLowerCase();
      const studentDetails = existingApplication.studentDetails;

      let requiredCertificates = [
        "candidateSignature",
        "aadharCard",
        "candidatePhoto",
      ];

      if (course === "llm") {
        requiredCertificates.push("graduationMarksheet");
      } else {
        requiredCertificates.push(
          "hscMarksheet",
          "hscCertificate",
          "sscMarksheet",
          "birthCertificate",
          "provisionalAllotmentLetter",
        );

        if (course === "ba llb") {
        }

        if (course === "llb") {
          requiredCertificates.push(
            "graduationCertificate",
            "graduationMarksheet",
          );
        }
      }

      if (studentDetails.caste?.toLowerCase() !== "general") {
        requiredCertificates.push("casteCertificate");
      }
      if (studentDetails.religion?.toLowerCase() === "christian") {
        requiredCertificates.push("baptismCertificate");
      }
      if (studentDetails.isNameChanged) {
        requiredCertificates.push("gazetteCopy");
      }

      const existingCerts =
        existingApplication.certificates?.map((c) => c.type) || [];
      const newCerts = req.body.certificateNames
        ? Array.isArray(req.body.certificateNames)
          ? req.body.certificateNames
          : [req.body.certificateNames]
        : [];
      const allUploadedCerts = [...new Set([...existingCerts, ...newCerts])];

      const missingCerts = requiredCertificates.filter(
        (rc) => !allUploadedCerts.includes(rc),
      );

      if (missingCerts.length > 0) {
        return res.status(400).json({
          message: `Missing required certificates: ${missingCerts.join(", ")}`,
        });
      }

      if (files?.certificates) {
        let certificates = existingApplication.certificates || [];

        const certificateNames = Array.isArray(req.body.certificateNames)
          ? req.body.certificateNames
          : [req.body.certificateNames];

        for (let i = 0; i < files.certificates.length; i++) {
          const certificateType = certificateNames[i];

          try {
            const certificateUploadResult = await uploadToCloudinary(
              files.certificates[i],
            );

            const existingIndex = certificates.findIndex(
              (cert) => cert.type === certificateType,
            );

            const newCertificate = {
              type: certificateType,
              fileUrl: certificateUploadResult.url,
              status: "pending",
              remark: "",
              verifiedAt: null,
              verifiedBy: null,
            };

            if (existingIndex !== -1) {
              certificates[existingIndex] = {
                ...certificates[existingIndex],
                ...newCertificate,
              };
            } else {
              certificates.push(newCertificate);
            }
          } catch (uploadError) {
            console.error(
              `Cloudinary upload error for certificate ${certificateType}:`,
              uploadError,
            );
            return res.status(400).json({
              message: `Error uploading certificate: ${certificateType}`,
              error: uploadError.message || "Unknown Cloudinary error",
            });
          }
        }

        applicationData.certificates = certificates;
      }
    }

    const updatedRegistration = await applicationModel.findByIdAndUpdate(
      _id,
      { $set: applicationData },
      { new: true, runValidators: true },
    );

    if (!updatedRegistration) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.status(200).json({
      message: "Form updated successfully",
      student: updatedRegistration,
    });
  } catch (error) {
    console.error("Error updating application form:", error);
    res.status(400).json({
      message: "Error updating form",
      error: error.message || "Unknown error",
    });
  }
};

export const getApplicationFormsForAdmin = async (req, res) => {
  try {
    const applications = await applicationModel
      .find()
      .populate("loginStudentId");

    if (applications.length === 0) {
      return res.status(404).json({ message: "No application forms found" });
    }

    res.status(200).json(applications);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving application forms", error });
  }
};

export const getSingleApplicationFormForAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await applicationModel.findOne({
      _id: id,
    });

    if (!application) {
      return res.status(404).json({ message: "Application form not found" });
    }

    res.status(200).json(application);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving application form", error });
  }
};

const buildAdminApplicationFilters = ({
  year,
  applicationNumber,
  caste,
  applicationStage,
  paymentStatus,
  program,
  search,
  admissionStatus,
}) => {
  const filters = {};

  if (year) {
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);
    filters.createdAt = { $gte: startDate, $lte: endDate };
  }

  if (applicationNumber) {
    filters.applicationNumber = applicationNumber;
  }

  if (caste) {
    filters["studentDetails.caste"] = { $regex: new RegExp(`^${caste}$`, "i") };
  }

  if (applicationStage) {
    filters.stage = applicationStage;
  }

  if (paymentStatus !== undefined && paymentStatus !== "") {
    filters.paymentStatus = paymentStatus;
  }

  if (program) {
    filters.course = program;
  }

  if (search) {
    filters.$or = [
      { "studentDetails.firstName": { $regex: search, $options: "i" } },
      { "studentDetails.lastName": { $regex: search, $options: "i" } },
    ];
  }

  if (admissionStatus) {
    if (admissionStatus === "Admitted") {
      filters.formStatusFromAdmin = "Student Admitted";
    } else if (admissionStatus === "Not Admitted") {
      filters.formStatusFromAdmin = { $ne: "Student Admitted" };
    }
  }

  return filters;
};

export const getApplicationFormsForAdminFilters = async (req, res) => {
  const { page = 1, limit = 10, includeIds = false } = req.body;

  const parsedLimit = Number.parseInt(limit, 10) || 10;
  const parsedPage = Number.parseInt(page, 10) || 1;
  const skip = (parsedPage - 1) * parsedLimit;
  const includeIdsFlag =
    includeIds === true || includeIds === "true" || includeIds === 1;

  const filters = buildAdminApplicationFilters(req.body);

  try {
    const [applications, totalApplications] = await Promise.all([
      applicationModel
        .find(filters)
        .skip(skip)
        .limit(parsedLimit)
        .populate("loginStudentId"),
      applicationModel.countDocuments(filters),
    ]);

    if (applications.length === 0) {
      return res.status(200).json({
        message: "No application forms found",
        applications: [],
        totalPages: 0,
        currentPage: 1,
        totalApplications: 0,
        ...(includeIdsFlag ? { matchingApplicationIds: [] } : {}),
      });
    }

    let matchingApplicationIds;

    if (includeIdsFlag) {
      const matchingDocs = await applicationModel
        .find(filters)
        .select("_id formStatusFromAdmin")
        .lean();

      matchingApplicationIds = matchingDocs
        .filter((doc) => doc.formStatusFromAdmin !== "Student Admitted")
        .map((doc) => doc._id);
    }

    res.status(200).json({
      message: "Applications Lists",
      applications,
      totalPages:
        parsedLimit > 0 ? Math.ceil(totalApplications / parsedLimit) : 0,
      currentPage: parsedPage,
      totalApplications,
      ...(includeIdsFlag ? { matchingApplicationIds } : {}),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving application forms", error });
  }
};

export const updateCertificateStatus = async (req, res) => {
  const { applicationId, certificateId } = req.params;
  const { status, remark } = req.body;

  try {
    const updatedApplication = await applicationModel.findOneAndUpdate(
      {
        _id: applicationId,
        "certificates._id": certificateId,
      },
      {
        $set: {
          "certificates.$.status": status,
          "certificates.$.remark": remark,
          "certificates.$.verifiedAt":
            status === "verified" ? new Date() : null,
          "certificates.$.verifiedBy":
            status === "verified" ? req.user.userId : null,
        },
      },
      { new: true },
    );

    if (!updatedApplication) {
      return res.status(404).json({ message: "Application not found" });
    }
    const certificateType = updatedApplication.certificates.find(
      (cert) => cert._id.toString() === certificateId,
    )?.type;

    if (status === "rejected") {
      const emailData = {
        from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
        to: updatedApplication.studentDetails.emailAddress,
        subject: "Certificate Rejection Notice",
        html: `
          <h2>Certificate Rejection Notice</h2>
          <p>Dear ${updatedApplication.studentDetails.firstName},</p>
          <p>Your ${certificateType} has been rejected.</p>
          <p><strong>Reason for rejection:</strong> ${remark}</p>
          <p>If you have any questions, please contact the administration.</p>
        `,
      };

      try {
        await transporter.sendMail(emailData);
      } catch (emailError) {
        console.error("Error sending email:", emailError);
      }
    }

    res.status(200).json({
      message: `Certificate ${status} successfully`,
      application: updatedApplication,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating certificate status", error });
  }
};

export const rejectApplication = async (req, res) => {
  const { id } = req.params;
  const { remark } = req.body;
  try {
    const application = await applicationModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            formStatusFromAdmin: "Rejected",
          },
        },
        { new: true },
      )
      .populate("loginStudentId");

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const emailData = {
      from: `${process.env.SMTP_COMPANY} <${process.env.SMTP_EMAIL_USER}>`,
      to: application.studentDetails.emailAddress,
      subject: "Application Rejected",
      html: `
        <h2>Application Rejection Notice</h2>
        <p>Dear ${application.studentDetails.firstName},</p>
        <p>Your application (Application Number: ${application.applicationNumber}) has been rejected.</p>
        <p><strong>Reason for rejection:</strong> ${remark}</p>
        <p>If you have any questions, please contact the administration.</p>
      `,
    };

    try {
      await transporter.sendMail(emailData);
    } catch (emailError) {
      console.error("Error sending email:", emailError);
    }

    res.status(200).json({
      message: "Application rejected successfully",
      application,
    });
  } catch (error) {
    res.status(500).json({ message: "Error rejecting application", error });
  }
};

export const downloadApplicationsAsExcel = async (req, res) => {
  try {
    const {
      year,
      applicationNumber,
      caste,
      applicationStage,
      paymentStatus,
      program,
      search,
      admissionStatus,
    } = req.query;

    // Use the same filter building function as the main list
    const filters = buildAdminApplicationFilters({
      year,
      applicationNumber,
      caste,
      applicationStage,
      paymentStatus,
      program,
      search,
      admissionStatus,
    });

    const applications = await applicationModel.find(filters).populate({
      path: "loginStudentId",
      select: "firstName middleName lastName",
    });

    if (applications.length === 0) {
      return res.status(404).json({ message: "No application forms found" });
    }

    const applicationData = await Promise.all(
      applications.map(async (app) => {
        const payment = await paymentModel.findOne({ applicationId: app._id });
        const studentName = [
          app.studentDetails.firstName,
          app.studentDetails.middleName,
          app.studentDetails.lastName,
        ]
          .filter(Boolean)
          .join(" ");

        return {
          applicationNumber: app.applicationNumber,
          studentName: studentName.toUpperCase(),
          email: (app.studentDetails.emailAddress || "N/A").toUpperCase(),
          phone: app.studentDetails.studentMobileNumber || "N/A",
          courseName: app.course.toUpperCase(),
          caste: (app.studentDetails.caste || "N/A").toUpperCase(),
          religion: (app.studentDetails.religion || "N/A").toUpperCase(),
          stage: app.stage,
          paymentStatus: app.paymentStatus.toUpperCase(),
          paymentId: payment ? payment.paymentId : "N/A",
          paymentDate: payment ? payment.createdAt.toLocaleDateString() : "N/A",
          appliedDate: app.createdAt.toLocaleDateString(),
          formStatus: (app.formStatusFromAdmin || "N/A").toUpperCase(),
        };
      }),
    );

    const headers = [
      { label: "Application Number", key: "applicationNumber", width: 20 },
      { label: "Student Name", key: "studentName", width: 25 },
      { label: "Email", key: "email", width: 30 },
      { label: "Phone", key: "phone", width: 15 },
      { label: "Course Name", key: "courseName", width: 15 },
      { label: "Caste", key: "caste", width: 15 },
      { label: "Religion", key: "religion", width: 15 },
      { label: "Stage", key: "stage", width: 12 },
      { label: "Payment Status", key: "paymentStatus", width: 15 },
      { label: "Payment ID", key: "paymentId", width: 25 },
      { label: "Payment Date", key: "paymentDate", width: 15 },
      { label: "Applied Date", key: "appliedDate", width: 15 },
      { label: "Form Status", key: "formStatus", width: 15 },
    ];

    const workbook = createWorkbook();
    createStandardWorksheet(workbook, "Applications", headers, applicationData);

    await sendExcelResponse(res, workbook, "applications.xlsx");
  } catch (error) {
    res.status(500).json({
      message: "Error downloading application data",
      error: error.message,
    });
  }
};
