import {Router} from "express";

import {
  createHabit,
  deleteHabit,
  getHabitDetail,
  getHabits,
  getHabitsWithRecords,
  getUserHabits,
  updateHabitCompletedDates,
} from "./controller";

import {authMiddleware} from "./middleware";

const router = Router();

router.post("/createHabit", authMiddleware, createHabit);

router.get("/getHabits", authMiddleware, getHabits);

router.get("/getHabitsWithRecords", authMiddleware, getHabitsWithRecords);

router.get("/:habitId/getHabitDetail", authMiddleware, getHabitDetail);

router.get("/:habitId/getUserHabits", authMiddleware, getUserHabits);

router.post("/:habitId/updateHabitCompletedDates", authMiddleware, updateHabitCompletedDates);

router.delete("/:habitId/deleteHabit", authMiddleware, deleteHabit);

export default router;
