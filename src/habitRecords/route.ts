import {Router} from "express";
import {authMiddleware} from "../middleware/auth";
import {completeHabit, unCompleteHabit} from "./controller";

const router = Router();

router.post("/:habitId/habitRecord", authMiddleware, completeHabit);
router.delete("/:habitId/habitRecord", authMiddleware, unCompleteHabit);

export default router;
