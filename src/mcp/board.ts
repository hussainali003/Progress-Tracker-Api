import {DateTime} from "luxon";

import {pg} from "../config/db";
import {ZONE} from "../notifications/settings";

/**
 * Data access for the MCP tools. Every query is scoped to OWNER_USER_ID, and every write is
 * marked as Claude's (created_by / author = 'claude'). Cards are always addressed by key
 * (STORY-12), never by uuid.
 */

export const STATUSES = ["later", "todo", "doing", "review", "done"] as const;
export type Status = (typeof STATUSES)[number];

export class ToolError extends Error {}

export function ownerId(): number {
  const id = Number(process.env.OWNER_USER_ID);
  if (!Number.isInteger(id) || id <= 0) throw new ToolError("OWNER_USER_ID is not set on the server.");
  return id;
}

export function today(): string {
  return DateTime.now().setZone(ZONE).toISODate() as string;
}

export function addDays(iso: string, days: number): string {
  return DateTime.fromISO(iso, {zone: ZONE}).plus({days}).toISODate() as string;
}

export function parseKey(key: string): {prefix: string; number: number} {
  const match = /^([A-Za-z]{2,8})-(\d+)$/.exec(key.trim());
  if (!match) throw new ToolError(`"${key}" is not a card key. Use the form STORY-12.`);
  return {prefix: match[1].toUpperCase(), number: Number(match[2])};
}

const CARD_COLUMNS = [
  pg.raw("p.key_prefix || '-' || c.number as key"),
  "c.id",
  "c.title",
  "c.status",
  "c.owner",
  "a.name as area",
  pg.raw("to_char(c.due_date, 'YYYY-MM-DD') as due_date"),
  pg.raw("to_char(c.done_on, 'YYYY-MM-DD') as done_on"),
  "p.key_prefix as project",
];

// Cards joined with their project and area, limited to the owner's projects.
function cardQuery() {
  return pg("cards as c")
    .join("projects as p", "p.id", "c.project_id")
    .leftJoin("areas as a", "a.id", "c.area_id")
    .where("p.user_id", ownerId());
}

// The public shape of a card row: no uuid, the key is the identifier.
function publicCard<T extends {id?: string}>(row: T) {
  const {id: _id, ...rest} = row;
  return rest;
}

export async function getProject(prefix: string) {
  const project = await pg("projects").where({user_id: ownerId(), key_prefix: prefix.toUpperCase()}).first();
  if (!project) {
    const all = await pg("projects").where("user_id", ownerId()).pluck("key_prefix");
    throw new ToolError(`No project with prefix ${prefix}. Projects: ${all.join(", ") || "none yet"}.`);
  }
  return project;
}

async function findArea(projectId: string, name: string) {
  const area = await pg("areas")
    .where("project_id", projectId)
    .whereRaw("lower(name) = lower(?)", [name.trim()])
    .first();
  if (!area) {
    const names = await pg("areas").where("project_id", projectId).orderBy("sort_order").pluck("name");
    throw new ToolError(
      `No area "${name}" in this project. Areas: ${names.join(", ") || "none"}. Use create_area first.`,
    );
  }
  return area;
}

async function findCard(key: string) {
  const {prefix, number} = parseKey(key);
  const card = await cardQuery()
    .where({"p.key_prefix": prefix, "c.number": number})
    .select(...CARD_COLUMNS, "c.project_id", "c.details", "c.file_ref", "c.created_by", "c.created_at")
    .first();
  if (!card) throw new ToolError(`No card ${prefix}-${number}.`);
  return card;
}

export async function listProjects() {
  const t = today();
  const week = addDays(t, 7);
  const rows = await pg("projects as p")
    .where("p.user_id", ownerId())
    .leftJoin("cards as c", "c.project_id", "p.id")
    .groupBy("p.id")
    .orderBy([{column: "p.sort_order"}, {column: "p.name"}])
    .select(
      "p.key_prefix as prefix",
      "p.name",
      "p.status",
      "p.color",
      "p.description",
      pg.raw("count(c.id) filter (where c.status <> 'done')::int as open"),
      pg.raw("count(c.id) filter (where c.status <> 'done' and c.due_date < ?)::int as overdue", [t]),
      pg.raw("count(c.id) filter (where c.status <> 'done' and c.due_date between ? and ?)::int as due_this_week", [
        t,
        week,
      ]),
      pg.raw("count(c.id) filter (where c.status = 'review')::int as in_review"),
    );
  return {today: t, projects: rows};
}

export async function getToday() {
  const t = today();
  const week = addDays(t, 7);
  const open = () =>
    cardQuery()
      .whereNot("p.status", "archived")
      .whereNot("c.status", "done")
      .select(...CARD_COLUMNS);
  const [overdue, dueToday, inReview, dueThisWeek] = await Promise.all([
    open().where("c.due_date", "<", t).orderBy("c.due_date"),
    open().where("c.due_date", t).orderBy("c.sort_order"),
    open().where("c.status", "review").orderBy("c.sort_order"),
    open()
      .where("c.due_date", ">", t)
      .where("c.due_date", "<=", week)
      .whereNot("c.status", "review")
      .orderBy("c.due_date"),
  ]);
  return {
    today: t,
    overdue: overdue.map(publicCard),
    due_today: dueToday.map(publicCard),
    in_review: inReview.map(publicCard),
    due_this_week: dueThisWeek.map(publicCard),
  };
}

export async function getBoard(args: {
  project: string;
  status?: Status[];
  owner?: "me" | "claude";
  area?: string;
  due_before?: string;
  include_old_done?: boolean;
}) {
  const project = await getProject(args.project);
  const q = cardQuery()
    .where("c.project_id", project.id)
    .select(...CARD_COLUMNS)
    .orderBy("c.sort_order");
  if (args.status?.length) q.whereIn("c.status", args.status);
  if (args.owner) q.where("c.owner", args.owner);
  if (args.area) q.where("c.area_id", (await findArea(project.id, args.area)).id);
  if (args.due_before) q.where("c.due_date", "<", args.due_before);
  if (!args.include_old_done && !args.status?.includes("done")) {
    q.where((w) => w.whereNot("c.status", "done").orWhere("c.done_on", ">=", addDays(today(), -14)));
  }
  const cards = (await q).map(publicCard);
  const columns = Object.fromEntries(STATUSES.map((s) => [s, cards.filter((c) => c.status === s)]));
  return {project: {prefix: project.key_prefix, name: project.name, status: project.status}, columns};
}

export async function getCard(key: string) {
  const card = await findCard(key);
  const comments = await pg("card_comments")
    .where("card_id", card.id)
    .orderBy("created_at")
    .select("author", "body", "created_at");
  const {id: _id, project_id: _p, ...rest} = card;
  return {...rest, comments};
}

export async function listAreas(prefix: string) {
  const project = await getProject(prefix);
  const areas = await pg("areas").where("project_id", project.id).orderBy("sort_order").pluck("name");
  return {project: project.key_prefix, areas};
}

export async function createProject(args: {
  name: string;
  prefix: string;
  color?: string;
  description?: string;
  areas?: string[];
}) {
  const prefix = args.prefix.toUpperCase();
  const exists = await pg("projects").where({user_id: ownerId(), key_prefix: prefix}).first();
  if (exists) throw new ToolError(`A project with prefix ${prefix} already exists (${exists.name}).`);
  return pg.transaction(async (trx) => {
    const [project] = await trx("projects")
      .insert({
        user_id: ownerId(),
        name: args.name,
        key_prefix: prefix,
        color: args.color ?? "#c9650f",
        description: args.description ?? "",
      })
      .returning(["id", "key_prefix", "name"]);
    const areas = [...new Set((args.areas ?? []).map((a) => a.trim()).filter(Boolean))];
    if (areas.length) {
      await trx("areas").insert(areas.map((name, i) => ({project_id: project.id, name, sort_order: i})));
    }
    return {project: project.key_prefix, name: project.name, areas};
  });
}

export async function createArea(prefix: string, name: string) {
  const project = await getProject(prefix);
  const existing = await pg("areas")
    .where("project_id", project.id)
    .whereRaw("lower(name) = lower(?)", [name.trim()])
    .first();
  if (existing) return {project: project.key_prefix, area: existing.name, created: false};
  const [{max}] = await pg("areas").where("project_id", project.id).max<{max: number | null}[]>("sort_order as max");
  await pg("areas").insert({project_id: project.id, name: name.trim(), sort_order: (max ?? -1) + 1});
  return {project: project.key_prefix, area: name.trim(), created: true};
}

export async function createCard(args: {
  project: string;
  title: string;
  details?: string;
  area?: string;
  owner?: "me" | "claude";
  status?: Status;
  due_date?: string;
  file_ref?: string;
}) {
  const project = await getProject(args.project);
  const area = args.area ? await findArea(project.id, args.area) : null;
  const [card] = await pg("cards")
    .insert({
      project_id: project.id,
      title: args.title,
      details: args.details ?? "",
      area_id: area?.id ?? null,
      owner: args.owner ?? "me",
      status: args.status ?? "todo",
      due_date: args.due_date ?? null,
      file_ref: args.file_ref ?? "",
      // Seconds since 1970 always grow, so a new card lands at the bottom of its column, like the web app.
      sort_order: Math.floor(Date.now() / 1000),
      created_by: "claude",
    })
    .returning("number");
  return getCard(`${project.key_prefix}-${card.number}`);
}

export async function updateCard(args: {
  key: string;
  title?: string;
  details?: string;
  status?: Status;
  owner?: "me" | "claude";
  area?: string | null;
  due_date?: string | null;
  file_ref?: string;
}) {
  const card = await findCard(args.key);
  const set: Record<string, unknown> = {};
  if (args.title !== undefined) set.title = args.title;
  if (args.details !== undefined) set.details = args.details;
  if (args.status !== undefined) set.status = args.status;
  if (args.owner !== undefined) set.owner = args.owner;
  if (args.due_date !== undefined) set.due_date = args.due_date;
  if (args.file_ref !== undefined) set.file_ref = args.file_ref;
  if (args.area !== undefined)
    set.area_id = args.area === null ? null : (await findArea(card.project_id, args.area)).id;
  if (Object.keys(set).length === 0) throw new ToolError("Send at least one field to change.");
  await pg("cards").where("id", card.id).update(set);
  return getCard(card.key);
}

export async function addComment(key: string, body: string) {
  const card = await findCard(key);
  await pg("card_comments").insert({card_id: card.id, author: "claude", body});
  return getCard(card.key);
}

export async function setDailyNote(args: {body: string; date?: string; project?: string}) {
  const date = args.date ?? today();
  const projectId = args.project ? (await getProject(args.project)).id : null;

  // daily_notes_one_per_day is UNIQUE NULLS NOT DISTINCT, so this upsert also works for the all-projects note.
  await pg("daily_notes")
    .insert({user_id: ownerId(), project_id: projectId, note_date: date, body: args.body, author: "claude"})
    .onConflict(pg.raw("on constraint daily_notes_one_per_day") as unknown as string)
    .merge({body: args.body, author: "claude"});
  return {date, project: args.project?.toUpperCase() ?? null, saved: true};
}

export async function sendNotification(args: {title: string; body?: string; card_key?: string}) {
  let url = "/";
  let cardId: string | null = null;
  if (args.card_key) {
    const card = await findCard(args.card_key);
    const {prefix, number} = parseKey(card.key);
    url = `/p/${prefix}/${number}`;
    cardId = card.id;
  }
  const [row] = await pg("notifications")
    .insert({user_id: ownerId(), kind: "claude", title: args.title, body: args.body ?? "", url, card_id: cardId})
    .returning(["created_at"]);
  return {sent: true, url, created_at: row.created_at};
}
