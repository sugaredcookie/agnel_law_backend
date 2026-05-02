import subjectModel from "../models/subjectModel.js";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import {
  createWorkbook,
  createStandardWorksheet,
  sendExcelResponse,
} from "../utils/excelHelper.js";

export const createSubject = async (req, res) => {
  try {
    const {
      subjectName,
      subjectCode,
      description,
      isElective,
      rubricsMarking,
      faculty,
      passCriteria,
      markingScheme,
      credits,
    } = req.body;
    const uniqueId = uuidv4();

    const markingSchemeData = (markingScheme || []).map((scheme) => ({
      name: scheme.name,
      value: scheme.value,
      breakdown: scheme.breakdown || [],
    }));

    const subject = new subjectModel({
      subjectName,
      subjectCode,
      description,
      isElective,
      rubricsMarking,
      faculty,
      passCriteria,
      markingScheme: markingSchemeData,
      credits,
      uniqueId,
    });
    await subject.save();

    res.json({ subject });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllSubjects = async (req, res) => {
  try {
    const subjects = await subjectModel.find({});
    if (subjects) {
      res.status(200).json({ subjects });
    } else {
      res.status(500).json({ error: "Subjects Not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteSubjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await subjectModel.findByIdAndDelete(id);
    if (subject) {
      res.status(200).json({ message: "Subject deleted successfully." });
    } else {
      res.status(404).json({ error: "Subject not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateSubjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      subjectName,
      subjectCode,
      description,
      isElective,
      rubricsMarking,
      faculty,
      passCriteria,
      markingScheme,
      credits,
    } = req.body;

    const markingSchemeData = (markingScheme || []).map((scheme) => ({
      name: scheme.name,
      value: scheme.value,
      breakdown: scheme.breakdown || [],
    }));

    const subject = await subjectModel.findByIdAndUpdate(
      id,
      {
        subjectName,
        subjectCode,
        description,
        isElective,
        rubricsMarking,
        faculty,
        passCriteria,
        markingScheme: markingSchemeData,
        credits,
      },
      { new: true },
    );

    if (subject) {
      res.status(200).json({ subject });
    } else {
      res.status(404).json({ error: "Subject not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getSubjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await subjectModel.findById(id);
    if (subject) {
      res.status(200).json({ subject });
    } else {
      res.status(404).json({ error: "Subject not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateSubjectsFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return res
        .status(400)
        .json({ message: "No worksheet found in the file" });
    }

    const results = [];
    const headers = [];

    worksheet.getRow(1).eachCell((cell) => {
      headers.push(cell.value);
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        if (Object.keys(rowData).length > 0) {
          results.push(rowData);
        }
      }
    });

    try {
      const operations = results.map((row) => {
        const subjectData = {
          subjectName: row["Subject Name"],
          subjectCode: row["Subject Code"],
          description: row["Description"],
          isElective:
            row["Is Elective"] === "Yes" ||
            row["Is Elective"] === "true" ||
            row["Is Elective"] === true,
          passCriteria: row["Passing Criteria"],
          credits: Number(row["Credits"]),
          rubricsMarking:
            row["Rubrics Marking"] === "Yes" ||
            row["Rubrics Marking"] === "true" ||
            row["Rubrics Marking"] === true,
          markingScheme: row["Marking Scheme"]
            ? JSON.parse(row["Marking Scheme"])
            : [],
        };

        return {
          updateOne: {
            filter: { subjectCode: subjectData.subjectCode },
            update: { $set: subjectData },
            upsert: true,
          },
        };
      });

      const result = await subjectModel.bulkWrite(operations);

      res.json({
        message: `Processed ${results.length} subject records`,
        stats: {
          created: result.upsertedCount,
          updated: result.modifiedCount,
          failed:
            results.length - (result.upsertedCount + result.modifiedCount),
        },
      });
    } catch (error) {
      console.error("Error processing Excel data:", error);
      res.status(500).json({
        message: "Error processing Excel data",
        error: error.message,
      });
    }
  } catch (error) {
    console.error("Error handling Excel upload:", error);
    res.status(500).json({
      message: "Error handling Excel upload",
      error: error.message,
    });
  }
};

export const downloadSubjectsExcel = async (req, res) => {
  try {
    const subjects = await subjectModel
      .find({})
      .populate("faculty", "facultyName");

    const headers = [
      { label: "Subject Name", key: "subjectName", width: 25 },
      { label: "Subject Code", key: "subjectCode", width: 15 },
      { label: "Description", key: "description", width: 30 },
      { label: "Is Elective", key: "isElective", width: 12 },
      { label: "Faculty", key: "faculty", width: 20 },
      { label: "Passing Criteria", key: "passCriteria", width: 18 },
      { label: "Credits", key: "credits", width: 10 },
      { label: "Rubrics Marking", key: "rubricsMarking", width: 15 },
      { label: "Marking Scheme", key: "markingScheme", width: 40 },
    ];

    const data = subjects.map((subject) => ({
      subjectName: subject?.subjectName || "",
      subjectCode: subject?.subjectCode || "",
      description: subject?.description || "",
      isElective: subject?.isElective ? "Yes" : "No",
      faculty: subject?.faculty?.facultyName || "",
      passCriteria: subject?.passCriteria || "",
      credits: subject?.credits || "",
      rubricsMarking: subject?.rubricsMarking ? "Yes" : "No",
      markingScheme: subject?.markingScheme
        ? JSON.stringify(subject.markingScheme)
        : "",
    }));

    const workbook = createWorkbook();
    createStandardWorksheet(workbook, "Subjects", headers, data);

    await sendExcelResponse(res, workbook, "subjects.xlsx");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
