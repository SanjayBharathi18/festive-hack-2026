import { Hono } from "hono";
import type { PrivacyAnswer } from "../../shared/privacy.ts";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";

export function privacyRoutes({
  config,
}: Pick<RouteDeps, "config">): Hono<AppEnv> {
  return new Hono<AppEnv>().get("/api/privacy", (c) => {
    const answer: PrivacyAnswer = { contact: config.PRIVACY_CONTACT ?? null };
    return c.json(answer);
  });
}
