import cron from "node-cron";
import { processAutoOpenClose } from "../controllers/electiveSessionController.js";

export const initElectiveSessionCron = () => {
  cron.schedule("*/5 * * * *", async () => {
    try {
      await processAutoOpenClose();
    } catch (err) {
      console.error("Elective session cron error:", err.message);
    }
  });
};
