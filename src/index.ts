import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import logger from "pino-http";

import authRoute from "./auth/route";

import habitRecordsRoute from "./habitRecords/route";

import habitsRoute from "./habits/route";

const app = express();

app.use(express.json());

app.use(cors());

app.use(helmet());

app.use(logger());

app.get("/", (_req, res) => {
  res.send("Hello Worldasdasdas!");
});

app.use("/auth", authRoute);

app.use("/habits", habitsRoute);

app.use("/habitRecords", habitRecordsRoute);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
