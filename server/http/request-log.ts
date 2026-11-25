import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import type { Log } from "../log.ts";
import type { AppEnv } from "./context.ts";

export function requestLog(log: Log): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = performance.now();
    c.set("flagVariants", {});
    await next();
    log({
      request_id: c.get("requestId"),
      method: c.req.method,
      route: routePath(c),
      status: c.res.status,
      duration_ms: Math.round((performance.now() - start) * 10) / 10,
      flags: c.get("flagVariants"),
    });
  };
}
