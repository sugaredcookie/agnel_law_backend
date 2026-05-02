import express from "express";
import { createEvent, fetchAllEvents } from "../controllers/eventController.js";

const eventRouter = express.Router();

eventRouter.post("/create-new-event", createEvent);
eventRouter.get("/get-all-events", fetchAllEvents);

export default eventRouter;
