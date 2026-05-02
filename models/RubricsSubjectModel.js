import mongoose from "mongoose";

const RubricsSubjectSchema = new mongoose.Schema(
  {
    subjectName: { type: String, required: true },
    subjectCode: { type: String, required: true },
    description: { type: String, required: true },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    schemes: [
      {
        name: { type: String, required: true },
        value: { type: Number, required: true },
        topics: [
          {
            topic: { type: String, required: true },
            value: { type: Number, required: true },
            faculties: [
              {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Faculty",
              },
            ],
          },
        ],
      },
    ],
  },
  { timestamps: true },
);

const RubricsSubjectModel = mongoose.model(
  "RubricsSubject",
  RubricsSubjectSchema,
);

export default RubricsSubjectModel;
