import { Hono, type MiddlewareHandler } from "hono";
import { requestId } from "hono/request-id";
import { bulkRoutes } from "./bulk/bulk-routes.ts";
import { searchRoutes } from "./catalog/search-routes.ts";
import { cateringRoutes } from "./catering/catering-routes.ts";
import { cityRoutes } from "./cities/city-routes.ts";
import type { Clock } from "./clock.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db/database.ts";
import { demoRoutes } from "./demo/demo-routes.ts";
import { eventRoutes } from "./events/event-routes.ts";
import { createEventHub, type EventHub } from "./events/hub.ts";
import type { Flags } from "./flags/decisions.ts";
import {
  createExperimentTally,
  type ExperimentTally,
} from "./flags/experiment-tally.ts";
import { createFlagOverrides, type FlagOverrides } from "./flags/overrides.ts";
import type { AppEnv } from "./http/context.ts";
import { handleError, handleNotFound, normaliseThrows } from "./http/errors.ts";
import { createIdempotency } from "./http/idempotency.ts";
import { createRateLimits, type RateLimits } from "./http/rate-limit.ts";
import { requestLog } from "./http/request-log.ts";
import { healthRoutes } from "./lifecycle/health.ts";
import { stopNewRequests } from "./lifecycle/shutdown.ts";
import type { Log } from "./log.ts";
import { httpMetrics } from "./metrics/http-metrics.ts";
import { metricsRoutes, type Metrics } from "./metrics/metrics.ts";
import { opsRoutes } from "./ops/ops-routes.ts";
import { checkoutRoutes } from "./orders/checkout-routes.ts";
import { deskOrderRoutes } from "./orders/desk-routes.ts";
import { pageRoutes, type PageReader } from "./pages/page-routes.ts";
import { paymentRoutes } from "./payments/payment-routes.ts";
import { privacyRoutes } from "./privacy/privacy-routes.ts";
import { quoteRoutes } from "./quotes/quote-routes.ts";
import { readingRoutes } from "./reading/reading-routes.ts";
import type { SarvamTransport } from "./sarvam/api.ts";
import { deskStockRoutes } from "./stores/desk-stock.ts";
import { setupRoutes } from "./stores/setup-routes.ts";
import { storeRoutes } from "./stores/store-routes.ts";
import { createTranslator, type Translator } from "./translate/translator.ts";
import { verifyRoutes } from "./verify/verify-routes.ts";

export type AppDeps = {
  config: Config;
  db: Db;
  clock: Clock;
  log: Log;
  metrics: Metrics;
  isShuttingDown: () => boolean;
  stopping: AbortSignal;
  flags: Flags;
  sarvam: SarvamTransport;
  readPage: PageReader;
  assetsDir?: string | undefined;
};

export type RouteDeps = AppDeps & {
  idempotent: MiddlewareHandler<AppEnv>;
  limits: RateLimits;
  events: EventHub;
  overrides: FlagOverrides;
  experiment: ExperimentTally;
  translator: Translator;
};

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const overrides = createFlagOverrides(deps.flags);
  const experiment = createExperimentTally(overrides.flags);
  const routeDeps: RouteDeps = {
    ...deps,
    flags: experiment.flags,
    overrides,
    experiment,
    translator: createTranslator({ ...deps, flags: experiment.flags }),
    idempotent: createIdempotency(deps),
    limits: createRateLimits(deps.clock),
    events: createEventHub((error) =>
      deps.log({ msg: "a desk event listener failed", error: String(error) }),
    ),
  };
  const app = new Hono<AppEnv>();
  app.use(requestId());
  app.use(requestLog(deps.log));
  app.use(httpMetrics(deps.metrics));
  app.use(stopNewRequests(deps.isShuttingDown));
  app.use(normaliseThrows);
  app.onError(handleError(deps.log));
  app.notFound(handleNotFound);

  app.route("/", healthRoutes(routeDeps));
  app.route("/", metricsRoutes(routeDeps.metrics));
  app.route("/", verifyRoutes(routeDeps));
  app.route("/", eventRoutes(routeDeps));
  app.route("/", checkoutRoutes(routeDeps));
  app.route("/", deskOrderRoutes(routeDeps));
  app.route("/", storeRoutes(routeDeps));
  app.route("/", deskStockRoutes(routeDeps));
  app.route("/", setupRoutes(routeDeps));
  app.route("/", readingRoutes(routeDeps));
  app.route("/", searchRoutes(routeDeps));
  app.route("/", cityRoutes(routeDeps));
  app.route("/", paymentRoutes(routeDeps));
  app.route("/", quoteRoutes(routeDeps));
  app.route("/", cateringRoutes(routeDeps));
  app.route("/", bulkRoutes(routeDeps));
  app.route("/", opsRoutes(routeDeps));
  app.route("/", privacyRoutes(routeDeps));
  app.route("/", demoRoutes(routeDeps));

  // The pages come last, because their static files match every path.
  app.route("/", pageRoutes(routeDeps));
  return app;
}
