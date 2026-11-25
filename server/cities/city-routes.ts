import { Hono } from "hono";
import { cityChoices, type CitiesAnswer } from "../../shared/cities.ts";
import type { RouteDeps } from "../app.ts";
import { marketplace } from "../catalog/catalog.ts";
import type { AppEnv } from "../http/context.ts";

// The city picker of the buyer pages: the cities of the stores in the
// marketplace, each with a label in each app language and its centre.
export function cityRoutes({ db }: Pick<RouteDeps, "db">): Hono<AppEnv> {
  const names = db
    .prepare(
      `SELECT city FROM stores
      WHERE ${marketplace} AND city IS NOT NULL ORDER BY rowid`,
    )
    .pluck();
  return new Hono<AppEnv>().get("/api/cities", (c) => {
    const answer: CitiesAnswer = {
      cities: cityChoices(names.all() as string[]),
    };
    c.header("Cache-Control", "no-store");
    return c.json(answer);
  });
}
