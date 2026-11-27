import {AsyncLocalStorage} from "node:async_hooks";
import crypto from "node:crypto";

import {pg} from "../config/db";

/**
 * Whose board an MCP request works on. `/mcp` resolves the bearer token to a user and runs the
 * whole request inside `requestUser.run(userId, …)`, so every query in board.ts reads the same id
 * without passing it through each tool.
 */
export const requestUser = new AsyncLocalStorage<number>();

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** The user a personal connector token belongs to, or null. Tokens are stored only as SHA-256 hashes. */
export async function userForToken(token: string): Promise<number | null> {
  if (!token) return null;
  const row = await pg("mcp_tokens").where("token_hash", hashToken(token)).first("id", "user_id", "last_used_at");
  if (!row) return null;

  // Recording every request would be a write per tool call, so last_used_at is only refreshed every few minutes.
  const stale = !row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 5 * 60 * 1000;
  if (stale) {
    pg("mcp_tokens")
      .where("id", row.id)
      .update({last_used_at: pg.fn.now()})
      .catch(() => {});
  }
  return row.user_id;
}
