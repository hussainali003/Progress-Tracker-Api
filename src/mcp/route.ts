import crypto from "node:crypto";

import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {type NextFunction, type Request, type Response, Router} from "express";

import {buildServer} from "./server";

/** Claude sends `Authorization: Bearer <MCP_TOKEN>` as a custom connector header. */
function requireToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.MCP_TOKEN;

  // Lenient on purpose: connector forms make it easy to type "Bearer<token>" without the space.
  const given = (req.headers.authorization ?? "")
    .trim()
    .replace(/^Bearer\s*/i, "")
    .trim();
  const ok =
    Boolean(expected) &&
    given.length === expected?.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) {
    res.status(401).json({jsonrpc: "2.0", error: {code: -32001, message: "Unauthorized"}, id: null});
    return;
  }
  next();
}

/**
 * Stateless Streamable HTTP: every POST gets a fresh server and transport, so nothing lives in
 * memory between requests and the free Render server can sleep and wake freely.
 */
const router = Router();

router.post("/mcp", requireToken, async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    req.log.error({err}, "mcp request failed");
    if (!res.headersSent) {
      res.status(500).json({jsonrpc: "2.0", error: {code: -32603, message: "Internal error"}, id: null});
    }
  }
});

// Stateless mode has no sessions to stream or close.
router.all("/mcp", (_req, res) => {
  res
    .status(405)
    .set("Allow", "POST")
    .json({jsonrpc: "2.0", error: {code: -32000, message: "Use POST"}, id: null});
});

export default router;
