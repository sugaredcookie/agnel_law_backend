import express from "express";
import {
  createBatchGroup,
  getAllBatchGroups,
  getBatchGroupById,
  updateBatchGroup,
  deleteBatchGroup,
  addBatchesToGroup,
  removeBatchesFromGroup,
  getBatchesInGroup,
  rearrangeStudentsInGroup,
} from "../controllers/BatchGroupController.js";

const batchGroupRouter = express.Router();

batchGroupRouter.post("/create", createBatchGroup);
batchGroupRouter.get("/all", getAllBatchGroups);
batchGroupRouter.get("/:id", getBatchGroupById);
batchGroupRouter.put("/:id", updateBatchGroup);
batchGroupRouter.delete("/:id", deleteBatchGroup);
batchGroupRouter.put("/:id/add-batches", addBatchesToGroup);
batchGroupRouter.put("/:id/remove-batches", removeBatchesFromGroup);
batchGroupRouter.get("/:id/batches", getBatchesInGroup);
batchGroupRouter.post("/:id/rearrange-students", rearrangeStudentsInGroup);

export default batchGroupRouter;
