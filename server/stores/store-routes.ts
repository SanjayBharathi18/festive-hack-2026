import { Hono } from "hono";
import type { Db } from "../db/database.ts";
import { addDays, istDay } from "../../shared/day.ts";
import { daysRequestSchema, storeQuerySchema } from "../../shared/store.ts";
import type { RouteDeps } from "../app.ts";
import { storeBulk } from "../bulk/bulk-data.ts";
import { storeCatering } from "../catering/package-data.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, type AppError } from "../http/errors.ts";
import { readJson } from "../http/input.ts";
import { cartAmounts, daysForCart } from "./days.ts";
import { getMenu } from "./menu.ts";
import { dayWindow, readCapacity } from "./store-capacity.ts";
import { publishedStoreById, publishedStoreBySlug } from "./store-data.ts";
import { storePage, storeRating } from "./store-page.ts";

type StoreDeps = Pick<
  RouteDeps,
  "db" | "clock" | "flags" | "translator" | "config"
>;

export function storeRoutes({
  db,
  clock,
  flags,
  translator,
  config,
}: StoreDeps): Hono<AppEnv> {
  const dayRange = () => {
    const today = istDay(clock.now());
    return { today, until: addDays(today, dayWindow - 1) };
  };

  return new Hono<AppEnv>()
    .get("/api/stores/:slug", async (c) => {
      const store = publishedStoreBySlug(db, c.req.param("slug"));
      if (store === undefined) throw storeNotFound();
      const values = await flags.environment(c.req.raw.signal);
      c.set("flagVariants", {
        ...c.get("flagVariants"),
        ops_voice: values.ops_voice ? "on" : "off",
      });
      const lang = storeQuerySchema.safeParse(c.req.query()).data?.lang;
      if (lang !== undefined) {
        c.set("flagVariants", {
          ...c.get("flagVariants"),
          ops_transliteration: values.ops_transliteration,
        });
      }
      const menu = getMenu(db, store.id);
      const names =
        lang === undefined
          ? new Map<string, string>()
          : await translator.scriptNames(menu, lang, {
              signal: c.req.raw.signal,
            });
      const { today, until } = dayRange();
      c.header("Cache-Control", "no-store");
      return c.json(
        storePage({
          store,
          rating: readRating(db, store.id),
          menu: menu.map((item) => ({
            ...item,
            name_script: names.get(item.id) ?? null,
          })),
          capacity: readCapacity(db, store, today, until),
          today,
          until,
          flags: values,
          bulk: storeBulk(db, store),
          catering: storeCatering(db, store, today),
          recorded: config.SARVAM_MODE === "recorded",
        }),
      );
    })
    .post("/api/days", async (c) => {
      const { store_id, cart } = await readJson(c, daysRequestSchema);
      const store = publishedStoreById(db, store_id);
      if (store === undefined) throw storeNotFound();
      const { lines, missing } = cartAmounts(getMenu(db, store.id), cart);
      if (missing.length > 0) {
        throw appError(
          409,
          "item_unavailable",
          "Some items in your cart are no longer on this menu. Remove them, then pick a day.",
        );
      }
      const { today, until } = dayRange();
      c.header("Cache-Control", "no-store");
      return c.json(
        daysForCart(readCapacity(db, store, today, until), lines, today, until),
      );
    });
}

function readRating(db: Db, storeId: string) {
  const row = db
    .prepare("SELECT rating_average, rating_count FROM stores WHERE id = ?")
    .get(storeId) as
    { rating_average: number | null; rating_count: number } | undefined;
  return row === undefined
    ? null
    : storeRating(row.rating_average, row.rating_count);
}

function storeNotFound(): AppError {
  return appError(
    404,
    "not_found",
    "This store does not exist. Check the link, or ask the seller for it.",
  );
}
