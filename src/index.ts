import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import logger from "pino-http";

import authRoute from "./auth/route";

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

app.use(logger());

app.get("/", (_req, res) => {
  res.send("Hello Worldasdasdas!");
});

app.use("/auth", authRoute);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
