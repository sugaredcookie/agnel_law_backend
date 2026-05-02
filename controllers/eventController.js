import Event from "../models/eventModel.js";

export const createEvent = async (req, res) => {
  try {
    const { title, description, start, type } = req.body;
    const event = new Event({
      title,
      description,
      start,
      type,
    });
    await event.save();
    res.status(201).json(event);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

export const fetchAllEvents = async (req, res) => {
  try {
    const events = await Event.find();
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
