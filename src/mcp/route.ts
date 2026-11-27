import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {type NextFunction, type Request, type Response, Router} from "express";

import {hashToken, requestUser, userForToken} from "./context";
import {buildServer} from "./server";

/**
 * Each user creates a personal token on the website's "Connect Claude" page and adds it to their
 * Claude connector as `Authorization: Bearer <token>`. The token decides whose board is served.
 */
async function requireToken(req: Request, res: Response, next: NextFunction) {
  // Lenient on purpose: connector forms make it easy to type "Bearer<token>" without the space.
  const given = (req.headers.authorization ?? "")
    .trim()
    .replace(/^Bearer\s*/i, "")
    .trim();
  try {
    const userId = await userForToken(given);
    if (userId === null) {
      // A one-way fingerprint tells an old token from a new one in the logs without ever logging the token itself.
      const fingerprint = given ? hashToken(given).slice(0, 8) : "none";
      req.log.warn({givenLength: given.length, fingerprint}, "mcp token rejected");
      res.status(401).json({jsonrpc: "2.0", error: {code: -32001, message: "Unauthorized"}, id: null});
      return;
    }
    res.locals.userId = userId;
    next();
  } catch (err) {
    req.log.error({err}, "mcp token lookup failed");
    res.status(500).json({jsonrpc: "2.0", error: {code: -32603, message: "Internal error"}, id: null});
  }
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
    await requestUser.run(res.locals.userId, async () => {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
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
