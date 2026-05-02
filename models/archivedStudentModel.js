import mongoose from "mongoose";

const { Schema } = mongoose;

// Archived student model - stores students who have been made inactive (cancelled, graduated, etc.)
// This keeps the main Student collection clean and improves query performance

const certificateSchema = new Schema({
  type: String,
  fileUrl: String,
  status: {
    type: String,
    enum: ["pending", "verified", "rejected"],
    default: "pending",
  },
  remark: String,
  verifiedAt: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

const archivedStudentSchema = new Schema(
  {
    // Original student ID reference
    originalStudentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    // Archive metadata
    archiveReason: {
      type: String,
      enum: ["inactive", "graduated", "cancelled", "transferred", "other"],
      required: true,
    },
    archiveNote: String,
    archivedAt: {
      type: Date,
      default: Date.now,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Original student data (preserved)
    studentDetails: {
      firstName: String,
      middleName: String,
      lastName: String,
      gender: String,
      studentImage: { type: String, required: false },
      studentSign: { type: String, required: false },
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
    },
    // Store original status before archiving
    originalStatus: {
      type: String,
      enum: ["active", "inactive", "graduated"],
    },
    academicDetails: {
      program: String,
      batch: {
        id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Batch",
        },
        name: String,
      },
      registerNumber: String,
      rollNumber: String,
      subjects: [
        {
          subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
          },
          marks: [
            {
              schemeName: String,
              obtainedMarks: Number,
            },
          ],
        },
      ],
      enrollmentDate: String,
      yearOfJoining: String,
    },
    certificates: [certificateSchema],
    studentId: String,
    loginStudentId: String,
    password: String,
    // Permissions for archived students (all default false = fully locked)
    permissions: {
      canLogin: { type: Boolean, default: false },
      canResetPassword: { type: Boolean, default: false },
      canViewResults: { type: Boolean, default: false },
      canViewNotes: { type: Boolean, default: false },
      canSelectElectives: { type: Boolean, default: false },
    },
    // Original timestamps
    originalCreatedAt: Date,
    originalUpdatedAt: Date,
  },
  { timestamps: true },
);

// Indexes for efficient querying
archivedStudentSchema.index({ archiveReason: 1 });
archivedStudentSchema.index({ archivedAt: -1 });
archivedStudentSchema.index({ originalStudentId: 1 });
archivedStudentSchema.index({ "academicDetails.batch.id": 1 });
archivedStudentSchema.index({ "academicDetails.rollNumber": 1 });
archivedStudentSchema.index({ "studentDetails.emailAddress": 1 });

export default mongoose.model("ArchivedStudent", archivedStudentSchema);
