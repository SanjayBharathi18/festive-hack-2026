import type { Context, MiddlewareHandler } from "hono";
import type { Clock } from "../clock.ts";
import type { AppEnv } from "./context.ts";
import { errorResponse } from "./errors.ts";

export type RateRule = { limit: number; windowMs: number };
export type RateLimits = Record<
  keyof typeof rateRules,
  MiddlewareHandler<AppEnv>
>;

const minute = 60_000;

export const rateRules = {
  codes: { limit: 60, windowMs: 60 * minute },
  readings: { limit: 20, windowMs: minute },
  searches: { limit: 60, windowMs: minute },
  uploads: { limit: 20, windowMs: minute },
} satisfies Record<string, RateRule>;

export function createRateLimits(clock: Clock): RateLimits {
  return {
    codes: rateLimit(rateRules.codes, clock),
    readings: rateLimit(rateRules.readings, clock),
    searches: rateLimit(rateRules.searches, clock),
    uploads: rateLimit(rateRules.uploads, clock),
  };
}

export function rateLimit(
  rule: RateRule,
  clock: Clock,
): MiddlewareHandler<AppEnv> {
  const windows = new Map<string, { count: number; endsAt: number }>();
  let nextSweep = 0;
  return async (c, next) => {
    const now = clock.now();
    if (now >= nextSweep) {
      for (const [ip, window] of windows) {
        if (window.endsAt <= now) windows.delete(ip);
      }
      nextSweep = now + rule.windowMs;
    }
    const ip = clientIp(c);
    const window = windows.get(ip);
    if (window === undefined || window.endsAt <= now) {
      windows.set(ip, { count: 1, endsAt: now + rule.windowMs });
      return next();
    }
    if (window.count >= rule.limit) {
      const seconds = Math.ceil((window.endsAt - now) / 1000);
      c.header("Retry-After", String(seconds));
      return errorResponse(
        c,
        429,
        "rate_limited",
        `Too many requests. Try again in ${seconds} seconds.`,
      );
    }
    window.count += 1;
    return next();
  };
}

export function clientIp(c: Context<AppEnv>): string {
  const forwarded = c.req
    .header("X-Forwarded-For")
    ?.split(",")
    .map((address) => address.trim())
    .filter((address) => address !== "")
    .at(-1);
  return forwarded ?? c.env?.incoming?.socket.remoteAddress ?? "unknown";
}
