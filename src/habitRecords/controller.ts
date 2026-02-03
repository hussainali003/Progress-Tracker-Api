import type {Request, Response} from "express";

import {pg} from "../config/db";

export const completeHabit = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const {habitId} = req.params;
    const {date, minutes_spent} = req.body;

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    if (!date || Number.isNaN(Date.parse(date))) {
      return res.status(400).json({message: "Invalid date"});
    }

    // convert date string [2026-02-2026] to Date [2026-02-03T00:00:00.000Z]
    const normalizedDate = new Date(date);

    // Prevent future dates
    if (normalizedDate > new Date()) {
      return res.status(400).json({message: "Cannot complete future dates"});
    }

    // convert 2026-02-03T00:00:00.000Z format to YYYY-MM-DD format
    const completedDate = normalizedDate.toLocaleDateString("en-CA");

    await pg("habit_records").insert({
      habit_id: habitId,
      user_id: userId,
      completed_date: completedDate,
      minutes_spent,
    });

    res.status(200).json({message: "Habit check", date});
  } catch (err: any) {
    if (err.code === "23505") {
      console.error(err);
      return res.status(409).json({message: "Already check"});
    }

    console.error(err);
    res.status(500).json({message: "Failed to check habit"});
  }
};

export const unCompleteHabit = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const {habitId} = req.params;
    const {date} = req.body;

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    if (!date || Number.isNaN(Date.parse(date))) {
      return res.status(400).json({message: "Invalid date"});
    }

    await pg("habit_records")
      .where("habit_id", habitId)
      .where("user_id", userId)
      .where("completed_date", "=", `${date}`)
      .del();

    res.status(200).json({message: "Habit unchecked", date});
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to unchecked habit"});
  }
};
