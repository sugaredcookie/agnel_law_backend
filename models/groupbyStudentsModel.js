import mongoose from "mongoose";

const { Schema } = mongoose;

const groupbyStudentsSchema = new Schema(
  {
    groupName: {
      type: String,
      required: true,
      trim: true,
    },
    groupType: {
      type: String,
      enum: ["Individual", "Group"],
      required: true,
    },
    groupSize: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    members: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Student",
          required: true,
        },
        rollNumber: {
          type: String,
          required: true,
        },
        studentName: {
          type: String,
          required: true,
        },
      },
    ],
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RubricsSubject",
      required: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true },
);

groupbyStudentsSchema.index({ subjectId: 1, groupType: 1 });
groupbyStudentsSchema.index({ "members.studentId": 1 });

export default mongoose.model("GroupbyStudents", groupbyStudentsSchema);
