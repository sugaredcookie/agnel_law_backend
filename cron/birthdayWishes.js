import cron from "node-cron";
import { sendBirthdayWishesToFaculty } from "../controllers/facultyController.js";
import { sendBirthdayWishesToStudents } from "../controllers/studentController.js";

export const initBirthdayWishes = () => {
  cron.schedule("0 9 * * *", async () => {
    console.log("Running birthday wishes cron job...");

    const facultyResult = await sendBirthdayWishesToFaculty();
    const studentResult = await sendBirthdayWishesToStudents();

    console.log("Birthday wishes results:", {
      faculty: facultyResult,
      students: studentResult,
    });
  });
};
