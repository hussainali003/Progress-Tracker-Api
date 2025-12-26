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

export const getHabitDetail = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const habitId = Number(req.params.habitId);

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    const habit = await pg("habits").where("id", habitId).where("user_id", userId).first();

    if (!habit) {
      return res.status(401).json({message: "Habit not found"});
    }

    const records = await pg("habit_records")
      .where("habit_id", habitId)
      .where("user_id", userId)
      .orderBy("completed_date", "desc")
      .select("completed_date");

    const dates = records.map((r) => new Date(r.completed_date).toISOString().slice(0, 10));

    let currentStreak = 0;
    let longestStreak = 0;

    let prevDate: Date | null = null;
    let tempStreak = 0;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < dates.length; i++) {
      const current = new Date(dates[i]);
      current.setUTCHours(0, 0, 0, 0);

      if (!prevDate) {
        tempStreak = 1;
      } else {
        const diff = (prevDate.getTime() - current.getTime()) / (1000 * 60 * 60 * 24);

        if (diff === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }

      longestStreak = Math.max(longestStreak, tempStreak);
      prevDate = current;
    }

    if (dates.length > 0) {
      const last = new Date(dates[0]);
      last.setUTCHours(0, 0, 0, 0);

      const diff = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

      if (diff === 0 || diff === 1) {
        currentStreak = tempStreak;
      }
    }

    res.status(200).json({
      id: habit.id,
      name: habit.habit,
      color: habit.color,
      startDate: habit.start_date,
      endDate: habit.end_date,
      repeatDays: habit.repeat_days,
      reminder: habit.reminder,
      stats: {
        currentStreak,
        longestStreak,
        totalCompletedDays: dates.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to fetch habit detail"});
  }
};
