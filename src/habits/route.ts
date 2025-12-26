import {Router} from "express";

import {createHabit, getHabitDetail, getHabits, getHabitsWithRecords} from "./controller";

import {authMiddleware} from "./middleware";

const router = Router();

router.post("/createHabit", authMiddleware, createHabit);

router.get("/getHabits", authMiddleware, getHabits);

router.get("/getHabitsWithRecords", authMiddleware, getHabitsWithRecords);

router.get("/:habitId/getHabitDetail", authMiddleware, getHabitDetail);

export default router;
