import mongoose from "mongoose";

const { Schema } = mongoose;

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

const studentSchema = new Schema(
  {
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
    status: {
      type: String,
      enum: ["active", "inactive", "graduated"],
      default: "active",
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
              obtainedMarks: {
                type: Number,
                validate: {
                  validator: function (value) {
                    if (!this.subject || !this.subject.markingScheme) {
                      return true;
                    }

                    const scheme = this.subject.markingScheme.find(
                      (s) => s.schemeName === this.schemeName,
                    );
                    return scheme ? value <= scheme.value : true;
                  },
                  message:
                    "Marks cannot exceed the maximum allowed for this component",
                },
              },
            },
          ],
        },
      ],
      enrollmentDate: String,
      yearOfJoining: String,
    },
    selectedElectives: [
      {
        subject: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Subject",
        },
        selectedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    certificates: [certificateSchema],
    studentId: String,
    loginStudentId: String,
    password: String,
  },
  { timestamps: true },
);

studentSchema.index({ "academicDetails.batch.id": 1 });
studentSchema.index({ studentId: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ "studentDetails.firstName": 1, "studentDetails.lastName": 1 });

export default mongoose.model("Student", studentSchema);
