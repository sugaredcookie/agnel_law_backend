import express from "express";
import {
  register,
  login,
  forgotPassword,
} from "../controllers/UserController.js";
import authMiddleware from "../middlewares/AuthMiddleware.js";

const userRouter = express.Router();

userRouter.post("/register", register);
userRouter.post("/login", login);
userRouter.post("/forgot-password", forgotPassword);
userRouter.get("/dashboard", authMiddleware, (req, res) => {
  res.status(200).json({ message: "Welcome to the protected dashboard!" });
});

export default userRouter;
