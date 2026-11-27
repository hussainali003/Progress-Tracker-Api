import webpush from "web-push";

import {pg} from "../config/db";
import {getSettings, isQuietTime, karachiNow} from "./settings";

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const {VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT} = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export type PushResult =
  | {status: "sent"; sent: number; removed: number; failed: number}
  | {status: "skipped"; reason: string};

/** Sends one inbox notification to every device the user turned notifications on for. */
export async function pushNotification(notificationId: string): Promise<PushResult> {
  if (!configure()) return {status: "skipped", reason: "VAPID keys are not set"};

  const notification = await pg("notifications").where("id", notificationId).first();
  if (!notification) return {status: "skipped", reason: "notification not found"};
  if (notification.pushed_at) return {status: "skipped", reason: "already pushed"};

  const settings = await getSettings(notification.user_id);
  if (!settings.push_enabled) return {status: "skipped", reason: "push is off"};

  // A test always goes through, so the settings page can prove a device works at any hour.
  const {time} = karachiNow();
  if (notification.kind !== "test" && isQuietTime(time, settings.quiet_start, settings.quiet_end)) {
    return {status: "skipped", reason: "quiet hours"};
  }

  const subscriptions = await pg("push_subscriptions").where("user_id", notification.user_id);
  if (subscriptions.length === 0) return {status: "skipped", reason: "no devices"};

  const [{count}] = await pg("notifications")
    .where("user_id", notification.user_id)
    .whereNull("read_at")
    .count<{count: string}[]>("id as count");

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.url,
    tag: notification.id,
    badge: Number(count),
  });

  let sent = 0;
  let removed = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({endpoint: sub.endpoint, keys: {p256dh: sub.p256dh, auth: sub.auth}}, payload, {
          TTL: 60 * 60 * 24,
          urgency: "high",
        });
        sent += 1;
        await pg("push_subscriptions").where("id", sub.id).update({last_success_at: pg.fn.now(), failure_count: 0});
      } catch (err: any) {
        // 404 and 410 mean the browser threw the subscription away, so it will never work again.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          removed += 1;
          await pg("push_subscriptions").where("id", sub.id).delete();
        } else {
          failed += 1;
          await pg("push_subscriptions").where("id", sub.id).increment("failure_count", 1);
        }
      }
    }),
  );

  if (sent > 0) await pg("notifications").where("id", notification.id).update({pushed_at: pg.fn.now()});
  return {status: "sent", sent, removed, failed};
}
