import feedbackModel from "../models/feedbackModel.js";

export const addQuestion = async (req, res) => {
  try {
    const { question, feedbackType } = req.body;

    let feedback = await feedbackModel.findOne({ feedbackType });

    if (!feedback) {
      feedback = new feedbackModel({ feedbackType, questions: [question] });
      await feedback.save();
      return res
        .status(201)
        .json({ feedback, message: "New feedback created and question added" });
    }

    feedback.questions.push(question);
    await feedback.save();

    res.json({ feedback, message: "Question added successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

export const removeQuestion = async (req, res) => {
  try {
    const { question, feedbackType } = req.body;
    const feedback = await feedbackModel.findOne({ feedbackType });
    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    feedback.questions = feedback.questions.filter((q) => q !== question);
    await feedback.save();
    res.json({ feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllFacultyFeedbackQuestions = async (req, res) => {
  try {
    const feedback = await feedbackModel.findOne({ feedbackType: "faculty" });
    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    res.json({ feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllSubjectFeedbackQuestions = async (req, res) => {
  try {
    const feedback = await feedbackModel.findOne({ feedbackType: "subject" });
    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    res.json({ feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
