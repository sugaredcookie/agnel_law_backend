import mongoose from "mongoose";
import linkModel from "../models/linkModel.js";
import { v4 as uuidv4 } from "uuid";

export const createLink = async (req, res) => {
  try {
    const { agentName, landingPage, purpose } = req.body;

    const uniqueId = uuidv4();
    const link = new linkModel({ agentName, landingPage, purpose, uniqueId });
    await link.save();
    res.json({ link: `${landingPage}?ref=${uniqueId}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const linkLists = async (req, res) => {
  try {
    const links = await linkModel.find();

    if (links) {
      res.status(200).json({ links });
    } else {
      res.status(500).json({ error: "Links Not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getLinkById = async (req, res) => {
  try {
    const { id } = req.params;
    const link = await linkModel.findById(id);

    if (link) {
      res.status(200).json({ link });
    } else {
      res.status(404).json({ error: "Link not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateLinkById = async (req, res) => {
  try {
    const { id } = req.params;
    const { agentName, landingPage, purpose } = req.body;
    const link = await linkModel.findByIdAndUpdate(
      id,
      { agentName, landingPage, purpose },
      { new: true },
    );

    if (link) {
      res.status(200).json({ link });
    } else {
      res.status(404).json({ error: "Link not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteLinkById = async (req, res) => {
  try {
    const { id } = req.params;
    const link = await linkModel.findByIdAndDelete(id);

    if (link) {
      res.status(200).json({ message: "Link deleted successfully." });
    } else {
      res.status(404).json({ error: "Link not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getLinkByIdAndUniqueId = async (req, res) => {
  try {
    const { id, uniqueId } = req.params;

    let link;

    if (mongoose.Types.ObjectId.isValid(id)) {
      const objectId = new mongoose.Types.ObjectId(id);

      link = await linkModel.findOne({ _id: objectId, uniqueId });
    }

    if (link) {
      res.status(200).json({ link });
    } else {
      res.status(404).json({ error: "Link not found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
