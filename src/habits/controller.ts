import type {Request, Response} from "express";

import {getHabitMinutesSpentInWeek, getStreaks, getYearCompletedDates} from "src/util";

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
      .orderBy("completed_date", "asc")
      .select("completed_date", "minutes_spent");

    const dates = records.map((r) => r.completed_date);

    const lastSevenRecords = [];

    const startPoint = records.length - 7 < 0 ? 0 : records.length - 7;

    for (let i = startPoint; i < records.length; i++) {
      lastSevenRecords.push(records[i]);
    }

    const minutesSpentInWeek = getHabitMinutesSpentInWeek(lastSevenRecords);

    const streaks = getStreaks(dates);

    res.status(200).json({
      id: habit.id,
      name: habit.habit,
      color: habit.color,
      startDate: habit.start_date,
      endDate: habit.end_date,
      repeatDays: habit.repeat_days,
      reminder: habit.reminder,
      completedDates: dates,
      minutes_spent: minutesSpentInWeek,
      stats: {
        currentStreak: streaks[streaks.length - 1],
        longestStreak: Math.max(...streaks),
        yearCompletedDates: getYearCompletedDates(dates),
        totalCompletedDays: dates.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to fetch habit detail"});
  }
};

export const getUserHabits = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    const userHabits = await pg("habits").where("user_id", userId).orderBy("id").select("id", "habit");

    const habitIds = userHabits.map((habit) => habit.id);

    const habitsRecords = await pg("habit_records")
      .whereIn("habit_id", habitIds)
      .orderBy("habit_id")
      .select("habit_id", "completed_date");

    const habitRecordIds = habitsRecords.map((record) => record.habit_id);

    const rankHabits = [];

    for (let i = 0; i < userHabits.length; i++) {
      let habitRecordCount = 0;
      for (let j = 0; j < habitRecordIds.length; j++) {
        if (userHabits[i].id === habitRecordIds[j]) {
          habitRecordCount = habitRecordCount + 1;
        }
      }
      rankHabits.push({
        id: userHabits[i].id,
        name: userHabits[i].habit,
        totalCompletedDays: habitRecordCount,
      });
    }

    rankHabits.sort((a, b) => {
      return b.totalCompletedDays - a.totalCompletedDays;
    });

    res.status(200).json(rankHabits);
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to fecth user habits"});
  }
};

export const updateHabitCompletedDates = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const {habitId} = req.params;

    const {completedDates} = req.body;

    if (!userId) {
      res.status(401).json({message: "Unauthorized"});
    }

    await pg.transaction(async (trx) => {
      // Remove days not in new selection
      await trx("habit_records")
        .where({habit_id: habitId, user_id: userId})
        .whereNotIn(
          "completed_date",
          completedDates.map((d: string) => `${d}T00:00:00Z`),
        )
        .del();

      if (completedDates.length > 0) {
        const selectedDates = [];

        for (let i = 0; i < completedDates.length; i++) {
          selectedDates.push({habit_id: habitId, user_id: userId, completed_date: `${completedDates[i]}T00:00:00Z`});
        }

        await trx("habit_records").insert(selectedDates).onConflict(["habit_id", "completed_date"]).ignore();
      }
    });

    const _habit = await pg("habits").where({id: habitId, user_id: userId}).first();

    const records = await pg("habit_records")
      .where({habit_id: habitId, user_id: userId})
      .orderBy("completed_date", "asc")
      .select("completed_date");

    const dates = records.map((r) => r.completed_date);

    const streaks = getStreaks(dates);

    res.status(200).json({
      ..._habit,
      completedDates: dates,
      stats: {
        currentStreak: streaks[streaks.length - 1],
        longestStreak: Math.max(...streaks),
        totalCompletedDays: dates.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to update completed days"});
  }
};

export const deleteHabit = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const habitId = Number(req.params.habitId);

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    // habitId should not be empty and habitId should be a number
    if (!habitId || Number.isNaN(habitId)) {
      return res.status(400).json({message: "Invalid habit id"});
    }

    await pg.transaction(async (trx) => {
      await trx("habits").where("user_id", "=", userId).where("id", habitId).del();
    });

    res.status(200).json({message: "Habit deleted successfully"});
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to delete a habit"});
  }
};

export const updateHabit = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const habitId = Number(req.params.habitId);

    if (!userId) {
      return res.status(401).json({message: "Unauthorized"});
    }

    if (!habitId || Number.isNaN(habitId)) {
      return res.status(400).json({message: "Invalid habit id"});
    }

    const {name, color, end_date, reminder, repeat_days} = req.body;

    const habitDetail = await pg("habits").where({user_id: userId, id: habitId}).first();

    if (!habitDetail) {
      return res.status(404).json({message: "Habit not found"});
    }

    const updates: Record<string, any> = {};

    if (name && name !== habitDetail.habit) {
      updates.name = name;
    }

    if (color && color !== habitDetail.color) {
      updates.color = color;
    }

    if (end_date !== habitDetail.end_date) {
      updates.endDate = end_date;
    }

    if (reminder !== habitDetail.reminder) {
      updates.reminder = reminder;
    }

    if (Array.isArray(repeat_days)) {
      const normalized = [...repeat_days].sort();
      if (JSON.stringify(habitDetail.repeat_days) !== JSON.stringify(normalized)) {
        updates.repeatDays = JSON.stringify(normalized);
      }
    }

    // nothing changed
    if (Object.keys(updates).length === 0) {
      return res.status(200).json({message: "No changes"});
    }

    await pg("habits").where({user_id: userId, id: habitId}).update({
      habit: updates.name,
      color: updates.color,
      reminder: updates.reminder,
      repeat_days: updates.repeatDays,
      end_date: updates.endDate,
      updated_at: pg.fn.now(),
    });

    updates.repeatDays = repeat_days;

    res.status(200).json({...updates});
  } catch (err) {
    console.error(err);
    res.status(500).json({message: "Failed to update habit"});
  }
};
