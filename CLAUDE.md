# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the dev server (`tsx watch`) against `src/index.ts`, piped through `pino-pretty`
- `npm run build` — bundle with `tsup` to `dist/`
- `npm run start` — run the built `dist/index.js`
- `npm run lint` — Biome format + lint with autofix on `src/`
- `npm run check-ts` — type-check (`tsc --noEmit`)

No test runner is configured.

## Tech stack

Express 5, `@modelcontextprotocol/sdk` + `zod` (MCP server), Knex + `pg` (Postgres, hosted on Neon), `jsonwebtoken` (auth), `resend` (email), `web-push` (Web Push with VAPID), `luxon` (Asia/Karachi dates), TypeScript (`NodeNext` module resolution), Biome (format + lint). There are no git hooks — husky was removed because it was never configured to run anything. `npm run lint` and `npm run check-ts` are manual; nothing runs automatically on commit or push.

## Architecture

App data lives in Hasura GraphQL (the frontend talks to Hasura directly), and the schema and Hasura metadata are code in the **Progress-Tracker-Hasura** repo. This service issues Hasura-compatible JWTs, handles account flows, and serves the few REST routes outside services must call: `/health`, `/cron/tick`, `/hooks/push` and `/mcp`. Don't add other REST routes for app data. Hosted on Render's free plan (sleeps after ~15 idle minutes, no persistent disk — keep all state in Postgres); `main` auto-deploys.

### Routing
[src/index.ts](src/index.ts) is the entrypoint: sets up Express middleware (`cors`, `helmet`, `pino-http`, `express.json()`) and mounts the single feature router:
- `/auth` → [src/auth/route.ts](src/auth/route.ts)
- `/health`, `/cron/tick`, `/hooks/push` → [src/notifications/route.ts](src/notifications/route.ts) (mounted at the root)
- `POST /mcp` → [src/mcp/route.ts](src/mcp/route.ts) (mounted at the root)

### Feature folder pattern
Each feature lives under `src/<feature>/` with `controller.ts` (route handlers) and `route.ts` (wires handlers to an Express `Router`, exported as default). Route paths are verb-style rather than RESTful (e.g. `POST /auth/login`) — follow that style when adding endpoints.

### Notifications
- [push.ts](src/notifications/push.ts) `pushNotification(id)`: skips if already pushed, push is off, or it's quiet hours in Asia/Karachi (except `kind = test`); sends to every `push_subscriptions` row, deletes ones that answer 404/410, bumps `failure_count` on other errors, and sets `pushed_at` when at least one device got it.
- [reminders.ts](src/notifications/reminders.ts) `runReminders(userId)`: once the Karachi time passes `morning_time` / `evening_time`, inserts that day's reminder with `dedupe_key` `morning:YYYY-MM-DD` / `evening:YYYY-MM-DD`; `on conflict do nothing` makes the 10-minute ticks idempotent.
- `/hooks/push` always answers 200 once the secret matches, so Hasura doesn't retry things a retry can't fix.

### MCP (Claude updates the board)
- `POST /mcp` is an MCP server over **Streamable HTTP in stateless mode**: [route.ts](src/mcp/route.ts) builds a fresh `McpServer` + transport per request (JSON responses, no sessions; GET/DELETE answer 405). It requires `Authorization: Bearer $MCP_TOKEN` and answers 401 otherwise.
- [server.ts](src/mcp/server.ts) registers the 12 tools (`list_projects`, `get_today`, `get_board`, `get_card`, `list_areas`, `create_project`, `create_area`, `create_card`, `update_card`, `add_comment`, `set_daily_note`, `send_notification`), each with `title`, `readOnlyHint` and `destructiveHint` annotations. **There are no delete tools on purpose.**
- [board.ts](src/mcp/board.ts) does the data access with Knex, always scoped to `OWNER_USER_ID`; writes are marked `created_by`/`author = 'claude'`; cards are addressed by key (`STORY-12`), never uuid; dates are `YYYY-MM-DD` in Asia/Karachi. A `ToolError` becomes a readable `isError` result; anything else becomes a generic error.
- It talks to Postgres directly rather than through Hasura with the admin secret: same database and same triggers (card numbers, `done_on`, the `notification_created` push), one less secret on Render.

### Shared middleware
[src/middleware/auth.ts](src/middleware/auth.ts) exports the single `authMiddleware` used by every protected route — it verifies the JWT (`jwt.verify(token, process.env.JWT_SECRET)`) and sets `req.user = { id: decoded.sub }`. Import it as `../middleware/auth`; do not add per-feature copies. The `auth` login/register/forgot-password/reset-password routes are intentionally unprotected — only `GET /auth/me` is guarded.

### Auth
- Passwords are hashed/verified via Postgres's `pgcrypto` extension directly in SQL (`crypt(?, gen_salt('bf'))` on insert, `password = crypt(?, password)` on compare) — not in JS, despite `bcryptjs` being a listed dependency.
- Login issues a JWT (`jsonwebtoken`, 7-day expiry) with Hasura-style claims (`https://hasura.io/jwt/claims`).
- `req.user` is typed via declaration merging in [src/types/express.d.ts](src/types/express.d.ts) (`declare global { namespace Express { interface Request { user?: { id: string } } } }`).
- Forgot/reset password: [src/auth/controller.ts](src/auth/controller.ts) generates a random token, stores its SHA-256 hash + expiry in a `password_resets` table, and emails a reset link via [src/auth/mail.ts](src/auth/mail.ts) (Resend). `forgot-password` always returns a generic response regardless of whether the email exists, to avoid user enumeration.

### DB access
[src/config/db.ts](src/config/db.ts) exports a single Knex instance (`pg`) configured from `PG_CONNECTION_STRING`. There is no migration framework and no schema files in the repo — table schemas (`users`, `password_resets`) must be inferred from the queries; schema changes are run manually against Neon. The v2 tables (projects, cards, notifications, push_subscriptions, notification_settings, …) are created by migrations in Progress-Tracker-Hasura; this API reads and writes them directly with Knex. Inserting into `notifications` fires the Hasura event trigger `notification_created`, even when the insert comes from here.

### Env vars
`PG_CONNECTION_STRING`, `JWT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL` (used to build the password-reset link), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` (the `?key=` cron-job.org sends), `HOOK_SECRET` (the `x-hook-secret` header Hasura's event trigger sends), `MCP_TOKEN` (the Bearer token Claude's custom connector sends to `/mcp`), `OWNER_USER_ID` (the `users.id` whose board the MCP tools read and write). Locally in `.env` (gitignored); in production they are Render environment variables.

## Conventions

- Biome: 2-space indent, 120-char line width, no bracket spacing (`{foo}` not `{ foo }`).
- Comments follow the [Airbnb JS style guide](https://github.com/airbnb/javascript#comments):
  - `/** ... */` for multi-line comments, `//` for single-line ones. Don't write a multi-line comment as a stack of `//` lines.
  - Put a single-line comment on its own line above its subject, with a blank line before it unless it's the first line of a block.
  - Start every comment with a space after the `//` or `*`.
  - Prefix actionable comments: `// TODO:` for a solution still to be implemented, `// FIXME:` for a problem that needs revisiting. Plain comments are for explanation, not open work items.
- Don't shorten a comment just to fit one line — if the *why* is load-bearing and not inferable from the code (deployment quirks, protocol details, security reasoning), keep the detail and use a `/** ... */` block. Biome's 120-char width doesn't reflow comments.
- Only the `me` handler wraps logic in `try/catch` and returns JSON with an explicit status code — `login`/`register`/`forgot-password`/`reset-password` currently don't (pre-existing inconsistency, not a pattern to intentionally break from without reason).
- No request-body validation library is actually wired up (`express-validator` is a dependency but unused) — handlers destructure `req.body` directly.
- Several listed dependencies are entirely unused in `src/` (`axios`, `bcryptjs`, `envalid`, `express-rate-limit`, `express-validator`, `http-status-codes`) — don't take their presence as a signal they're part of the stack.

## Issue workflow

Follow this exact sequence when picking up a GitHub issue in this repo. Never commit directly to `main` — always via a branch and PR.

1. `git pull` on `main` before starting anything.
2. Run `npm run lint` and `npm run check-ts` on the freshly pulled code. If either reports pre-existing errors, stop and fix those first — do not start the requested issue on top of a broken base.
3. Once the base is clean, read the GitHub issue (`gh issue view <number>`) to understand the actual problem before writing any code.
4. Create a new branch off `main` for the fix.
5. Implement the fix on that branch.
6. Hand the change over to the user to test. **The user does the testing — do not try to verify the fix yourself**, and do not start a dev server or exercise the flow to check it. Say what changed and what is worth looking at, then stop and wait.
7. Only after the user has said the change works, run `npm run lint`, `npm run check-ts`, and `npm run build`.
8. Commit the change.
9. Push and open a PR whose body includes `Fixes #<issue-number>` (or `Closes`/`Resolves`) so the issue auto-closes when the PR merges.

**Never commit before the user has confirmed the change works.** Waiting is the default — do not commit speculatively, and do not read a general remark ("looks good", "fine so far") as a test result. If it is unclear whether they actually ran it, ask.

When writing the PR's testing section, describe only what was actually done: the checks from step 7 are yours to claim, the manual testing is the user's. Do not write that something was verified in a browser on the strength of an ambiguous reply.
