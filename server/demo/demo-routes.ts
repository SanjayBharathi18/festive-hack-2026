import { Hono } from "hono";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";

export const demoEntries = {
  "/demo/desk": "/desk",
  "/demo/ops": "/ops",
} as const;

// The start page is static, so its desk and console buttons come here for the
// demo token. The redirect asks for English, because the demo desk otherwise
// opens in its seller's language.
export function demoRoutes({
  config,
}: Pick<RouteDeps, "config">): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  for (const [path, page] of Object.entries(demoEntries)) {
    app.get(path, (c) => {
      c.header("Cache-Control", "no-store");
      c.header("Referrer-Policy", "no-referrer");
      return c.redirect(demoAddress(page, config.DEMO_DESK_TOKEN), 302);
    });
  }
  return app;
}

export function demoAddress(page: string, token: string | undefined): string {
  const query = new URLSearchParams({ lang: "en" });
  if (token !== undefined) query.set("demo", token);
  return `${page}?${query}`;
}
