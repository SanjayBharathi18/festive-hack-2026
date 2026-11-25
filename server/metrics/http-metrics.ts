import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import type { AppEnv } from "../http/context.ts";
import type { Metrics } from "./metrics.ts";

export function httpMetrics(metrics: Metrics): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = performance.now();
    await next();
    const route = routePath(c);
    metrics.httpRequests.inc({
      route,
      method: c.req.method,
      status: String(c.res.status),
    });
    metrics.httpRequestDuration.observe(
      { route },
      (performance.now() - start) / 1000,
    );
  };
}
