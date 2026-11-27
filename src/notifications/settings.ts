import {DateTime} from "luxon";

import {pg} from "../config/db";

// "Today" and every reminder time are Pakistan time, whatever zone the server runs in.
export const ZONE = "Asia/Karachi";

export type NotificationSettings = {
  push_enabled: boolean;
  morning_time: string;
  evening_time: string | null;
  quiet_start: string;
  quiet_end: string;
};

// Same defaults as the notification_settings table, for users who never opened the settings page.
const DEFAULTS: NotificationSettings = {
  push_enabled: true,
  morning_time: "08:00:00",
  evening_time: "21:00:00",
  quiet_start: "23:00:00",
  quiet_end: "07:00:00",
};

export async function getSettings(userId: number): Promise<NotificationSettings> {
  const row = await pg("notification_settings").where("user_id", userId).first();
  return row ? {...DEFAULTS, ...row} : DEFAULTS;
}

export function karachiNow(now: DateTime = DateTime.now()) {
  const local = now.setZone(ZONE);
  return {date: local.toISODate() as string, time: local.toFormat("HH:mm:ss")};
}

/**
 * Quiet hours can wrap past midnight (23:00 to 07:00), so a time is quiet when it is after the start
 * or before the end. When start equals end there are no quiet hours.
 */
export function isQuietTime(time: string, start: string, end: string): boolean {
  if (start === end) return false;
  if (start < end) return time >= start && time < end;
  return time >= start || time < end;
}
