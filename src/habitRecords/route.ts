import {Router} from "express";

import {completeHabit, uncompleteHabit} from "./controller";
import {authMiddleware} from "./middleware";

const router = Router();

router.post("/:habitId/habitRecord", authMiddleware, completeHabit);
router.delete("/:habitId/habitRecord", authMiddleware, uncompleteHabit);

export default router;
