import type {Request, Response} from "express";

import {pg} from "../config/db";

export const createHabit = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const {habit, color, endDate, repeatDays, reminder} = req.body;

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    const [createHabit] = await pg("habits").insert(
      {
        user_id: userId,
        habit,
        color,
        end_date: endDate ?? null,
        repeat_days: JSON.stringify(repeatDays),
        reminder: reminder ?? null,
      },
      ["id", "habit", "color", "repeat_days", "end_date", "reminder"],
    );

    res.status(200).json(createHabit);
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to create habit"});
  }
};

export const getHabits = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    const habits = await pg("habits")
      .where("user_id", userId)
      .select("id", "habit", "color", "start_date", "end_date", "repeat_days", "reminder")
      .orderBy("created_at", "desc");

    res.status(200).json(habits);
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to fetch habits"});
  }
};

export const getHabitsWithRecords = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    const habits = await pg("habits").where("user_id", userId).select("id", "habit", "color");

    const habitIds = habits.map((h) => h.id);

    const records = await pg("habit_records")
      .whereIn("habit_id", habitIds)
      .where("completed_date", ">=", pg.raw("CURRENT_DATE - INTERVAL '3 days'"))
      .select("habit_id", "completed_date");

    // merge
    const result = habits.map((habit) => ({
      ...habit,
      completedDates: records.filter((r) => r.habit_id === habit.id).map((r) => r.completed_date),
    }));

    console.log(result);

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to fetch habits"});
  }
};
