import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";

import {
  addComment,
  createArea,
  createCard,
  createProject,
  getBoard,
  getCard,
  getToday,
  listAreas,
  listProjects,
  STATUSES,
  sendNotification,
  setDailyNote,
  ToolError,
  updateCard,
} from "./board";

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .describe("A date as YYYY-MM-DD, in Asia/Karachi");
const KEY = z.string().describe("Card key such as STORY-12");
const PREFIX = z.string().describe("Project key prefix such as STORY");
const STATUS = z.enum(STATUSES).describe("later, todo, doing (in progress), review or done");
const OWNER = z.enum(["me", "claude"]).describe("me = the board's owner (the person who connected), claude = Claude");

/** Runs a tool body and turns its result or a ToolError into MCP content. */
async function run(fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    return {content: [{type: "text" as const, text: JSON.stringify(result, null, 2)}]};
  } catch (err) {
    const message = err instanceof ToolError ? err.message : "Something went wrong on the server. Try again.";
    return {isError: true, content: [{type: "text" as const, text: message}]};
  }
}

const READ = {readOnlyHint: true, destructiveHint: false, openWorldHint: false};
const WRITE = {readOnlyHint: false, destructiveHint: false, openWorldHint: false};

/**
 * One MCP server per request (stateless Streamable HTTP). There are deliberately no delete tools:
 * Claude can create and change things, and the board's owner deletes in the app.
 */
export function buildServer() {
  const server = new McpServer({name: "progress-tracker", version: "1.0.0"});

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "All of the board owner's projects with open, overdue, due-this-week and in-review counts.",
      annotations: {title: "List projects", ...READ},
    },
    () => run(listProjects),
  );

  server.registerTool(
    "get_today",
    {
      title: "Get today",
      description:
        "Across all non-archived projects: overdue cards, cards due today, cards in review and cards due in the next 7 days.",
      annotations: {title: "Get today", ...READ},
    },
    () => run(getToday),
  );

  server.registerTool(
    "get_board",
    {
      title: "Get board",
      description:
        "One project's cards grouped by column. Done shows only the last 14 days unless include_old_done is true or status includes done.",
      inputSchema: {
        project: PREFIX,
        status: z.array(STATUS).optional().describe("Only these columns"),
        owner: OWNER.optional(),
        area: z.string().optional().describe("Area name, e.g. Character"),
        due_before: DATE.optional().describe("Only cards due before this date"),
        include_old_done: z.boolean().optional(),
      },
      annotations: {title: "Get board", ...READ},
    },
    (args) => run(() => getBoard(args)),
  );

  server.registerTool(
    "get_card",
    {
      title: "Get card",
      description: "One card by key, with its details (markdown) and comment history.",
      inputSchema: {key: KEY},
      annotations: {title: "Get card", ...READ},
    },
    ({key}) => run(() => getCard(key)),
  );

  server.registerTool(
    "list_areas",
    {
      title: "List areas",
      description: "The areas (labels) inside a project.",
      inputSchema: {project: PREFIX},
      annotations: {title: "List areas", ...READ},
    },
    ({project}) => run(() => listAreas(project)),
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: "A new project with a 2 to 8 capital-letter prefix, an optional colour and areas.",
      inputSchema: {
        name: z.string().min(1).max(80),
        prefix: z
          .string()
          .regex(/^[A-Za-z]{2,8}$/, "2 to 8 letters")
          .describe("Key prefix, e.g. STORY"),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe("Hex colour like #c9650f"),
        description: z.string().max(300).optional(),
        areas: z.array(z.string().min(1).max(40)).optional(),
      },
      annotations: {title: "Create project", ...WRITE},
    },
    (args) => run(() => createProject(args)),
  );

  server.registerTool(
    "create_area",
    {
      title: "Create area",
      description: "Add an area to a project. Does nothing if an area with that name already exists.",
      inputSchema: {project: PREFIX, name: z.string().min(1).max(40)},
      annotations: {title: "Create area", ...WRITE, idempotentHint: true},
    },
    ({project, name}) => run(() => createArea(project, name)),
  );

  server.registerTool(
    "create_card",
    {
      title: "Create card",
      description: "Create a card in a project. It is marked as created by Claude. Returns the new card with its key.",
      inputSchema: {
        project: PREFIX,
        title: z.string().min(1).max(200),
        details: z.string().optional().describe("Markdown"),
        area: z.string().optional().describe("Existing area name"),
        owner: OWNER.optional().describe("Defaults to me (the board's owner)"),
        status: STATUS.optional().describe("Defaults to todo"),
        due_date: DATE.optional(),
        file_ref: z.string().optional().describe("Related file, e.g. 02_Characters.md"),
      },
      annotations: {title: "Create card", ...WRITE},
    },
    (args) => run(() => createCard(args)),
  );

  server.registerTool(
    "update_card",
    {
      title: "Update card",
      description:
        "Change only the fields you send, by key. Send area or due_date as null to clear them. Moving to done sets the done date automatically.",
      inputSchema: {
        key: KEY,
        title: z.string().min(1).max(200).optional(),
        details: z.string().optional().describe("Markdown; replaces the whole details text"),
        status: STATUS.optional(),
        owner: OWNER.optional(),
        area: z.string().nullable().optional(),
        due_date: DATE.nullable().optional(),
        file_ref: z.string().optional(),
      },
      annotations: {title: "Update card", ...WRITE, idempotentHint: true},
    },
    (args) => run(() => updateCard(args)),
  );

  server.registerTool(
    "add_comment",
    {
      title: "Add comment",
      description: "Add a comment from Claude to a card's history.",
      inputSchema: {key: KEY, body: z.string().min(1)},
      annotations: {title: "Add comment", ...WRITE},
    },
    ({key, body}) => run(() => addComment(key, body)),
  );

  server.registerTool(
    "set_daily_note",
    {
      title: "Set daily note",
      description:
        "Write Claude's note for a day (default today in Karachi). Without a project it is the note across all projects shown on the Today page. Replaces an existing note for that day.",
      inputSchema: {body: z.string().min(1).describe("Markdown"), date: DATE.optional(), project: PREFIX.optional()},
      annotations: {title: "Set daily note", ...WRITE, idempotentHint: true},
    },
    (args) => run(() => setDailyNote(args)),
  );

  server.registerTool(
    "send_notification",
    {
      title: "Send notification",
      description:
        "Send the board's owner a notification (inbox plus push to their devices, unless it's their quiet hours). With card_key, tapping it opens that card.",
      inputSchema: {title: z.string().min(1).max(120), body: z.string().optional(), card_key: KEY.optional()},
      annotations: {title: "Send notification", ...WRITE, openWorldHint: true},
    },
    (args) => run(() => sendNotification(args)),
  );

  return server;
}
