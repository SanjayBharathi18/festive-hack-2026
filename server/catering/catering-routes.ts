import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import {
  cateringSearchQuerySchema,
  cateringSwitchSchema,
  packageInputSchema,
  packageLimits,
  planCheckBodySchema,
  type CateringSearchAnswer,
  type CateringSwitch,
  type DeskPackageAnswer,
  type DeskPackages,
  type PlanCheckAnswer,
} from "../../shared/catering.ts";
import { istDay } from "../../shared/day.ts";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, type AppError } from "../http/errors.ts";
import { parseInput, readJson } from "../http/input.ts";
import { publishedStoreById, type Store } from "../stores/store-data.ts";
import { deskAuth } from "../verify/desk-auth.ts";
import { byLowestPrice, matchingPackages, offerOf } from "./catering-search.ts";
import {
  cateringStores,
  countPackages,
  deletePackage,
  packageOf,
  packagesByStore,
  packagesOf,
  setCateringOn,
  writePackage,
} from "./package-data.ts";
import { checkPlan, fittingPackages } from "./plate-rules.ts";

type CateringDeps = Pick<
  RouteDeps,
  "db" | "clock" | "config" | "limits" | "idempotent"
>;

// The Catering tab, the plate rules of the plan builder, and the package
// editor of the desk.
export function cateringRoutes(deps: CateringDeps): Hono<AppEnv> {
  const { db, clock, limits, idempotent } = deps;
  const auth = deskAuth(deps);
  const today = () => istDay(clock.now());
  const deskStore = (storeId: string): Store => {
    const store = publishedStoreById(db, storeId);
    if (store === undefined) {
      throw appError(404, "not_found", "Your store is not on the app yet.");
    }
    return store;
  };
  const deskPackages = (store: Store): DeskPackages => ({
    catering_on: store.catering_on,
    packages: packagesOf(db, store.id),
  });

  return new Hono<AppEnv>()
    .get("/api/catering/search", limits.searches, (c) => {
      const query = parseInput(cateringSearchQuerySchema, c.req.query());
      const stores = cateringStores(db, query.date ?? null, query.city ?? null);
      const packages = packagesByStore(
        db,
        stores.map(({ id }) => id),
      );
      const caterers = stores
        .map(({ rating, ...store }) => ({
          store,
          rating,
          name: store.name,
          packages: matchingPackages(packages.get(store.id) ?? [], query).map(
            offerOf,
          ),
        }))
        .filter((caterer) => caterer.packages.length > 0)
        .sort(byLowestPrice)
        .map(({ store, rating, packages: offers }) => ({
          store,
          rating,
          packages: offers,
        }));
      const answer: CateringSearchAnswer = { today: today(), caterers };
      c.header("Cache-Control", "no-store");
      return c.json(answer);
    })
    .post("/api/catering/check", async (c) => {
      const body = await readJson(c, planCheckBodySchema);
      const store = publishedStoreById(db, body.store_id);
      const packages =
        store === undefined || !store.catering_on
          ? []
          : packagesOf(db, store.id);
      const pkg = packages.find(({ id }) => id === body.package_id);
      if (pkg === undefined) throw packageMissing();
      const answer: PlanCheckAnswer = {
        check: checkPlan(pkg, body.dishes),
        fitting: fittingPackages(packages, body.dishes)
          .filter(({ id }) => id !== pkg.id)
          .map(offerOf),
      };
      return c.json(answer);
    })
    .get("/api/desk/packages", auth, (c) => {
      const store = deskStore(c.get("desk").storeId);
      c.header("Cache-Control", "no-store");
      return c.json(deskPackages(store));
    })
    .put("/api/desk/catering", auth, async (c) => {
      const { catering_on } = await readJson(c, cateringSwitchSchema);
      const store = deskStore(c.get("desk").storeId);
      setCateringOn(db, store.id, catering_on);
      const answer: CateringSwitch = { catering_on };
      return c.json(answer);
    })
    .post("/api/desk/packages", auth, idempotent, async (c) => {
      const input = await readJson(c, packageInputSchema);
      const store = deskStore(c.get("desk").storeId);
      const id = randomUUID();
      db.transaction(() => {
        if (countPackages(db, store.id) >= packageLimits.packages) {
          throw appError(
            409,
            "invalid_input",
            `A store has ${packageLimits.packages} packages at most. Change or remove a package first.`,
          );
        }
        writePackage(db, { storeId: store.id, id, input });
      })();
      return c.json(packageAnswer(store.id, id), 201);
    })
    .put("/api/desk/packages/:id", auth, async (c) => {
      const input = await readJson(c, packageInputSchema);
      const store = deskStore(c.get("desk").storeId);
      const id = c.req.param("id");
      db.transaction(() => {
        if (packageOf(db, store.id, id) === undefined) throw packageMissing();
        writePackage(db, { storeId: store.id, id, input });
      })();
      return c.json(packageAnswer(store.id, id));
    })
    .delete("/api/desk/packages/:id", auth, (c) => {
      const store = deskStore(c.get("desk").storeId);
      const id = c.req.param("id");
      const pkg = packageOf(db, store.id, id);
      if (pkg === undefined || !deletePackage(db, store.id, id)) {
        throw packageMissing();
      }
      const answer: DeskPackageAnswer = { package: pkg };
      return c.json(answer);
    });

  function packageAnswer(storeId: string, id: string): DeskPackageAnswer {
    const pkg = packageOf(db, storeId, id);
    if (pkg === undefined) throw new Error("The package was not saved.");
    return { package: pkg };
  }
}

function packageMissing(): AppError {
  return appError(
    404,
    "not_found",
    "This package is no longer offered. Reload the page.",
  );
}
