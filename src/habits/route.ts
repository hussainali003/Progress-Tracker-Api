import {Router} from "express";

import {createHabit, getHabitDetail, getHabits, getHabitsWithRecords, getUserHabits} from "./controller";

import {authMiddleware} from "./middleware";

const router = Router();

router.post("/createHabit", authMiddleware, createHabit);

router.get("/getHabits", authMiddleware, getHabits);

router.get("/getHabitsWithRecords", authMiddleware, getHabitsWithRecords);

router.get("/:habitId/getHabitDetail", authMiddleware, getHabitDetail);

router.get("/:habitId/getUserHabits", authMiddleware, getUserHabits);

export default router;
