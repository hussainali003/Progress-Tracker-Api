import {Router} from "express";

import {completeHabit, unCompleteHabit} from "./controller";
import {authMiddleware} from "./middleware";

const router = Router();

router.post("/:habitId/habitRecord", authMiddleware, completeHabit);
router.delete("/:habitId/habitRecord", authMiddleware, unCompleteHabit);

export default router;
