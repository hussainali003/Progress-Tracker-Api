import {Router} from "express";

import {cronTick, health, pushHook} from "./controller";

/**
 * Outside services call these, so they are plain REST: Hasura's event trigger (/hooks/push), cron-job.org
 * (/cron/tick) and uptime checks (/health). App data itself only goes through Hasura GraphQL.
 */
const router = Router();

router.get("/health", health);
router.get("/cron/tick", cronTick);
router.post("/hooks/push", pushHook);

export default router;
