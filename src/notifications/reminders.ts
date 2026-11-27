import {pg} from "../config/db";
import {getSettings, karachiNow} from "./settings";

type OpenCard = {key: string; title: string; status: string; due_date: string | null};

/** Every open card in the user's non-archived projects, with its STORY-12 style key. */
async function openCards(userId: number): Promise<OpenCard[]> {
  return pg("cards as c")
    .join("projects as p", "p.id", "c.project_id")
    .where("p.user_id", userId)
    .whereNot("p.status", "archived")
    .whereNot("c.status", "done")
    .select(
      pg.raw("p.key_prefix || '-' || c.number as key"),
      "c.title",
      "c.status",
      pg.raw("to_char(c.due_date, 'YYYY-MM-DD') as due_date"),
    )
    .orderBy([{column: "c.due_date", order: "asc", nulls: "last"}, "c.sort_order"]);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function morningMessage(cards: OpenCard[], today: string) {
  const overdue = cards.filter((c) => c.due_date && c.due_date < today);
  const dueToday = cards.filter((c) => c.due_date === today);
  const review = cards.filter((c) => c.status === "review");
  if (overdue.length + dueToday.length + review.length === 0) return null;

  const parts = [];
  if (dueToday.length) parts.push(`${dueToday.length} due today`);
  if (overdue.length) parts.push(`${overdue.length} overdue`);
  if (review.length) parts.push(`${review.length} to review`);
  const first = overdue[0] ?? dueToday[0] ?? review[0];
  return {title: parts.join(", "), body: `First: ${first.key} ${first.title}`};
}

export function eveningMessage(cards: OpenCard[], today: string) {
  const dueToday = cards.filter((c) => c.due_date === today);
  if (dueToday.length === 0) return null;
  const [first] = dueToday;
  const more = dueToday.length > 1 ? ` and ${dueToday.length - 1} more` : "";
  return {title: `${plural(dueToday.length, "card")} still due today`, body: `${first.key} ${first.title}${more}`};
}

/**
 * One cron tick for one user: once the Karachi clock passes the morning or evening time, insert that
 * day's reminder. The (user_id, dedupe_key) unique constraint turns every later tick into a no-op, and
 * the insert fires the Hasura event trigger that pushes it.
 */
export async function runReminders(userId: number) {
  const settings = await getSettings(userId);
  const {date, time} = karachiNow();
  const inserted: string[] = [];

  const insert = async (kind: "morning" | "evening", message: {title: string; body: string}) => {
    const rows = await pg("notifications")
      .insert({
        user_id: userId,
        kind,
        title: message.title,
        body: message.body,
        url: "/",
        dedupe_key: `${kind}:${date}`,
      })
      .onConflict(["user_id", "dedupe_key"])
      .ignore()
      .returning("id");
    if (rows.length) inserted.push(kind);
  };

  const pastMorning = time >= settings.morning_time;
  const pastEvening = settings.evening_time !== null && time >= settings.evening_time;
  if (!pastMorning && !pastEvening) return inserted;

  const cards = await openCards(userId);

  // The morning summary is pointless once the evening reminder is due, so it is skipped after that.
  if (pastMorning && !pastEvening) {
    const message = morningMessage(cards, date);
    if (message) await insert("morning", message);
  }
  if (pastEvening) {
    const message = eveningMessage(cards, date);
    if (message) await insert("evening", message);
  }
  return inserted;
}

/** Users who have at least one project that is not archived. */
export async function usersWithProjects(): Promise<number[]> {
  const rows = await pg("projects").whereNot("status", "archived").distinct("user_id");
  return rows.map((r) => r.user_id);
}
