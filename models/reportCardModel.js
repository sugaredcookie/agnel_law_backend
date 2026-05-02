import mongoose from "mongoose";

const reportCardSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    student: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      rollNumber: {
        type: String,
        required: true,
      },
      batch: {
        type: String,
        required: true,
      },
    },
    semester: {
      type: String,
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
    },
    generatedDate: {
      type: Date,
      default: Date.now,
    },
    subjects: [
      {
        subject: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Subject",
        },
        subjectName: String,
        subjectCode: String,
        marks: [
          {
            schemeName: String,
            obtainedMarks: Number,
            maximumMarks: Number,
          },
        ],
        totalObtained: Number,
        totalMaximum: Number,
        grade: String,
      },
    ],
    totalMarks: Number,
    percentage: Number,
    cgpa: Number,
    remarks: String,
  },
  { timestamps: true },
);

export default mongoose.model("ReportCard", reportCardSchema);
