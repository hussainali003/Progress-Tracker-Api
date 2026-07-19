# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the dev server (`tsx watch`) against `src/index.ts`, piped through `pino-pretty`
- `npm run build` — bundle with `tsup` to `dist/`
- `npm run start` — run the built `dist/index.js`
- `npm run lint` — Biome format + lint with autofix on `src/`
- `npx tsc --noEmit` — type-check (no dedicated `npm` script for this yet)

No test runner is configured.

## Tech stack

Express 5, Knex + `pg` (Postgres, hosted on Neon), `jsonwebtoken` (auth), `resend` (email), TypeScript (`NodeNext` module resolution), Biome (format + lint), Husky (git hooks).

## Architecture

### Routing
[src/index.ts](src/index.ts) is the entrypoint: sets up Express middleware (`cors`, `helmet`, `pino-http`, `express.json()`) and mounts each feature's router:
- `/auth` → [src/auth/route.ts](src/auth/route.ts)
- `/habits` → [src/habits/route.ts](src/habits/route.ts)
- `/habitRecords` → [src/habitRecords/route.ts](src/habitRecords/route.ts)

### Feature folder pattern
Each feature lives under `src/<feature>/` with `controller.ts` (route handlers) and `route.ts` (wires handlers to an Express `Router`, exported as default).

### Shared middleware
[src/middleware/auth.ts](src/middleware/auth.ts) exports the single `authMiddleware` used by every protected route across all features — it verifies the JWT (`jwt.verify(token, process.env.JWT_SECRET)`) and sets `req.user = { id: decoded.sub }`. Import it as `../middleware/auth`; do not add per-feature copies. The `auth` login/register/forgot-password/reset-password routes are intentionally unprotected — only `GET /auth/me` is guarded.

### Auth
- Passwords are hashed/verified via Postgres's `pgcrypto` extension directly in SQL (`crypt(?, gen_salt('bf'))` on insert, `password = crypt(?, password)` on compare) — not in JS, despite `bcryptjs` being a listed dependency.
- Login issues a JWT (`jsonwebtoken`, 7-day expiry) with Hasura-style claims (`https://hasura.io/jwt/claims`).
- `req.user` is typed via declaration merging in [src/types/express.d.ts](src/types/express.d.ts) (`declare global { namespace Express { interface Request { user?: { id: string } } } }`).
- Forgot/reset password: [src/auth/controller.ts](src/auth/controller.ts) generates a random token, stores its SHA-256 hash + expiry in a `password_resets` table (see [sql/create_password_resets_table.sql](sql/create_password_resets_table.sql) — there is no migration framework in this repo, so schema changes are plain `.sql` files run manually against Neon), and emails a reset link via [src/auth/mail.ts](src/auth/mail.ts) (Resend). `forgot-password` always returns a generic response regardless of whether the email exists, to avoid user enumeration.

### DB access
[src/config/db.ts](src/config/db.ts) exports a single Knex instance (`pg`) configured from `PG_CONNECTION_STRING`. No migrations folder exists — table schemas must be inferred from queries, or from `.sql` files under `sql/` for anything added going forward.

### Env vars
`PG_CONNECTION_STRING`, `JWT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL` (used to build the password-reset link). All in `.env` (gitignored).

## Conventions

- Biome: 2-space indent, 120-char line width, no bracket spacing (`{foo}` not `{ foo }`).
- Route handlers generally wrap logic in `try/catch` and return JSON with an explicit status code — except `login`/`register`/`forgot-password`/`reset-password`, which currently don't (pre-existing inconsistency, not a pattern to intentionally break from without reason).
- No request-body validation library is actually wired up (`express-validator` is a dependency but unused) — handlers destructure `req.body` directly.

## Issue workflow

Follow this exact sequence when picking up a GitHub issue in this repo. Never commit directly to `main` — always via a branch and PR.

1. `git pull` on `main` before starting anything.
2. Run `npm run lint` and `npx tsc --noEmit` on the freshly pulled code. If either reports pre-existing errors, stop and fix those first — do not start the requested issue on top of a broken base.
3. Once the base is clean, read the GitHub issue (`gh issue view <number>`) to understand the actual problem before writing any code.
4. Create a new branch off `main` for the fix.
5. Implement the fix on that branch.
6. Verify the fix actually works before doing anything else:
   - If it can be checked programmatically (run the dev server, hit the affected endpoint, run any relevant script), do that yourself and report the result.
   - If it can't be verified this way, stop and ask the user to test it manually. Do not proceed past this step until they explicitly confirm it passed.
7. Only after verification has passed (self-verified, or the user has explicitly said the test passed), run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
8. Commit the change.
9. Push and open a PR whose body includes `Fixes #<issue-number>` (or `Closes`/`Resolves`) so the issue auto-closes when the PR merges.

**Never commit before step 6/7 is satisfied.** If the user is doing the manual testing, wait for their explicit go-ahead before running the final checks and committing — do not commit speculatively.
