import mongoose from "mongoose";

const gradeSchemeSchema = new mongoose.Schema(
  {
    gradeSchemeName: {
      type: String,
      required: true,
    },
    program: {
      type: mongoose.Schema.Types.String,
      ref: "Program",
      required: true,
    },
    grades: [
      {
        grade: {
          type: String,
          required: true,
        },
        rangeFrom: {
          type: Number,
          required: true,
        },
        rangeTo: {
          type: Number,
          required: true,
        },
        gradePoint: {
          type: Number,
          required: true,
        },
        className: {
          type: String,
          required: true,
        },
        isFail: {
          type: Boolean,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

const GradeScheme = mongoose.model("GradeScheme", gradeSchemeSchema);

export default GradeScheme;
