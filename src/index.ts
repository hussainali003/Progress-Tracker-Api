import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import logger from "pino-http";

import authRoute from "./auth/route";
import mcpRoute from "./mcp/route";
import notificationRoute from "./notifications/route";

const app = express();

/**
 * Render fronts the app with Cloudflare and its own load balancer, and the proxy reaches us over
 * loopback, so express sees ["::1", <render lb>, <cloudflare edge>, <client>]. Trust 3 hops for
 * req.ip to be the client. Counting from the right also makes a client-supplied X-Forwarded-For
 * harmless — Render appends to that header rather than replacing it, so "true" would be spoofable.
 */
app.set("trust proxy", 3);

app.use(express.json());

app.use(cors());

app.use(helmet());

/**
 * Request logs go to Render, so secrets are scrubbed first: the JWT or MCP token in Authorization,
 * Hasura's x-hook-secret, and the cron-job.org ?key= that is part of the URL.
 */
app.use(
  logger({
    redact: {
      paths: ["req.headers.authorization", 'req.headers["x-hook-secret"]', "req.query.key"],
      censor: "[Redacted]",
    },
    serializers: {
      req(req) {
        req.url = req.url?.replace(/([?&]key=)[^&]*/, "$1[Redacted]");
        return req;
      },
    },
  }),
);

app.get("/", (_req, res) => {
  res.send("Hello Worldasdasdas!");
});

app.use("/auth", authRoute);

app.use(notificationRoute);

app.use(mcpRoute);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
