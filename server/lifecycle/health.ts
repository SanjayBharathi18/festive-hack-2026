import { Hono } from "hono";
import { isDatabaseReady, type Db } from "../db/database.ts";
import type { AppEnv } from "../http/context.ts";
import { errorResponse } from "../http/errors.ts";

export function healthRoutes({ db }: { db: Db }): Hono<AppEnv> {
  return new Hono<AppEnv>()
    .get("/healthz", (c) => c.json({ status: "ok" }))
    .get("/readyz", (c) =>
      isDatabaseReady(db)
        ? c.json({ status: "ready" })
        : errorResponse(
            c,
            503,
            "not_ready",
            "The database is not ready. Try again in a moment.",
          ),
    );
}
