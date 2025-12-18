import type {Request, Response} from "express";

import {pg} from "../config/db";

export const completeHabit = async (req: Request, res: Response) => {
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

    const selectedDate = new Date(date);
    const today = new Date();

    // Prevent future dates
    if (selectedDate > today) {
      return res.status(400).json({message: "Cannot complete future dates"});
    }

    await pg("habit_records").insert({
      habit_id: habitId,
      user_id: userId,
      completed_date: date,
    });

    res.status(200).json({message: "Habit completed", date});
  } catch (err: any) {
    if (err.code === "23505") {
      console.error(err);
      return res.status(409).json({message: "Already completed"});
    }

    console.error(err);
    res.status(500).json({message: "Failed to complete habit"});
  }
};

export const uncompleteHabit = async (req: Request, res: Response) => {
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
      .where("completed_date", ">=", `${date}T00:00:00Z`)
      .where("completed_date", "<=", `${date}T24:00:00Z`)
      .del();

    res.status(200).json({message: "Habit unchecked", date});
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to uncomplete habit"});
  }
};
