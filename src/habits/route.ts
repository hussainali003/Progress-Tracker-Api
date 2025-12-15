import {Router} from "express";

import {createHabit, getHabits, getHabitsWithRecords} from "./controller";

import {authMiddleware} from "./middleware";

const router = Router();

router.post("/createHabit", authMiddleware, createHabit);

router.get("/getHabits", authMiddleware, getHabits);

router.get("/getHabitsWithRecords", authMiddleware, getHabitsWithRecords);

export default router;
