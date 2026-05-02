import express from "express";
import {
  createProgram,
  deleteProgramById,
  getAllPrograms,
  getProgramById,
  isProgramFull,
  updateProgramById,
  getProgramFeeByName,
} from "../controllers/ProgramController.js";

const programRouter = express.Router();

programRouter.post("/create-new-program", createProgram);
programRouter.get("/get-all-programs", getAllPrograms);
programRouter.get("/get-program/:id", getProgramById);
programRouter.delete("/delete-a-program/:id", deleteProgramById);
programRouter.put("/update-a-program/:id", updateProgramById);
programRouter.get("/is-full/:programName", isProgramFull);
programRouter.get("/fee-by-name/:programName", getProgramFeeByName);

export default programRouter;
