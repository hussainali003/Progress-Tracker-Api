import {Router} from "express";

import {forgotPassword, login, register, resetPassword} from "./controller";

const router = Router();

router.post("/login", login);
router.post("/register", register);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;
