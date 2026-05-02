import mongoose from "mongoose";

const { Schema } = mongoose;

const applicationSchema = new Schema(
  {
    studentDetails: {
      firstName: String,
      middleName: String,
      lastName: String,
      studentImage: String,
      dateOfBirth: String,
      bloodGroup: String,
      birthPlace: String,
      motherTongue: String,
      casteCategory: String,
      caste: String,
      aadharCardNumber: String,
      religion: String,
      studentMobileNumber: String,
      emailAddress: String,
      prnNumber: String,
      abcNumber: String,
      grNumber: String,
      capApplicationId: String,
      address: String,
    },
    familyBackground: {
      fatherName: String,
      fatherEmail: String,
      fatherOccupation: String,
      fatherMobileNo: String,
      motherName: String,
      motherEmail: String,
      motherOccupation: String,
      motherMobileNo: String,
      familyAnnualIncome: String,
      isLawyerOrJudge: {
        type: Boolean,
        default: false,
      },
    },
    academicQualifications: {
      tenth: {
        institution: String,
        percentage: Number,
        yearOfPassing: Number,
      },
      twelfth: {
        institution: String,
        percentage: Number,
        yearOfPassing: Number,
      },
      cetExam: {
        examYear: String,
        obtainedMarks: Number,
        maximumMarks: Number,
        percentile: String,
      },
      graduationDuration: {
        type: Number,
      },
      graduation: [
        {
          year: String,
          obtainedMarks: Number,
          maximumMarks: Number,
          percentage: Number,
        },
      ],
      graduationInstitution: String,
      graduationYearOfPassing: Number,
    },
    certificates: [
      {
        type: {
          type: String,
          required: true,
        },
        fileUrl: {
          type: String,
          required: true,
        },
        status: {
          type: String,
          enum: ["pending", "verified", "rejected"],
          default: "pending",
        },
        remark: {
          type: String,
          default: "",
        },
        verifiedAt: {
          type: Date,
          default: null,
        },
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
      },
    ],
    applicationNumber: String,
    stage: {
      type: Number,
      enum: [1, 2, 3],
      default: 1,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "partial"],
      default: "unpaid",
    },
    formMode: {
      type: String,
      enum: ["online", "offline"],
      default: "online",
    },
    loginStudentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    formStatusFromAdmin: {
      type: String,
      enum: [
        "Student Admitted",
        "Pending",
        "Completed By Student",
        "View By Admin",
        "Reply",
        "Success",
        "Rejected",
      ],
      default: "Pending",
    },
    course: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("application", applicationSchema);
