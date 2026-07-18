import {Router} from "express";
import {authMiddleware} from "../middleware/auth";
import {
  createHabit,
  deleteHabit,
  getHabitDetail,
  getHabits,
  getHabitsWithRecords,
  getUserHabits,
  updateHabit,
  updateHabitCompletedDates,
} from "./controller";

const router = Router();

router.post("/createHabit", authMiddleware, createHabit);

router.get("/getHabits", authMiddleware, getHabits);

router.get("/getHabitsWithRecords", authMiddleware, getHabitsWithRecords);

router.get("/:habitId/getHabitDetail", authMiddleware, getHabitDetail);

router.get("/:habitId/getUserHabits", authMiddleware, getUserHabits);

router.post("/:habitId/updateHabitCompletedDates", authMiddleware, updateHabitCompletedDates);

router.delete("/:habitId/deleteHabit", authMiddleware, deleteHabit);

router.patch("/:habitId/updateHabit", authMiddleware, updateHabit);

export default router;
