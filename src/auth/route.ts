import {Router} from "express";
import {authMiddleware} from "../middleware/auth";
import {forgotPassword, login, me, register, resetPassword} from "./controller";

const router = Router();

router.post("/login", login);
router.post("/register", register);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", authMiddleware, me);

export default router;
