import crypto from "node:crypto";

import type {Request, Response} from "express";

import {pg} from "../config/db";
import {pushNotification} from "./push";
import {runReminders, usersWithProjects} from "./reminders";

function sameSecret(given: unknown, expected: string | undefined): boolean {
  if (typeof given !== "string" || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Called by the Hasura event trigger `notification_created` on every insert into notifications.
 * It always answers 200 once the secret checks out, because a non-2xx makes Hasura retry and a
 * retry can't fix "quiet hours" or "no devices".
 */
export const pushHook = async (req: Request, res: Response) => {
  if (!sameSecret(req.headers["x-hook-secret"], process.env.HOOK_SECRET)) {
    res.status(401).json({message: "Bad hook secret"});
    return;
  }
  const id = req.body?.event?.data?.new?.id;
  if (typeof id !== "string") {
    res.status(400).json({message: "No notification id in the event"});
    return;
  }
  try {
    const result = await pushNotification(id);
    req.log.info({notification: id, result}, "push hook");
    res.status(200).json(result);
  } catch (err) {
    req.log.error({err, notification: id}, "push hook failed");
    res.status(500).json({message: "Push failed"});
  }
};

/**
 * cron-job.org calls this every 10 minutes. Each call inserts the morning and evening reminders that
 * are due, and it also keeps the free Render server and the Neon database awake.
 */
export const cronTick = async (req: Request, res: Response) => {
  if (!sameSecret(req.query.key, process.env.CRON_SECRET)) {
    res.status(401).json({message: "Bad cron key"});
    return;
  }
  try {
    await pg.raw("select 1");
    const users = await usersWithProjects();
    const reminders: Record<number, string[]> = {};
    for (const userId of users) {
      const inserted = await runReminders(userId);
      if (inserted.length) reminders[userId] = inserted;
    }
    res.status(200).json({ok: true, reminders});
  } catch (err) {
    req.log.error({err}, "cron tick failed");
    res.status(500).json({ok: false});
  }
};

export const health = (_req: Request, res: Response) => {
  res.status(200).json({ok: true});
};
