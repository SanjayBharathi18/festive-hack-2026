import { Hono, type MiddlewareHandler } from "hono";
import type { OpsState } from "../../shared/ops.ts";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";
import { appError } from "../http/errors.ts";
import { savedRecordings } from "../sarvam/recorded.ts";
import { deskAuth, type DeskEnv } from "../verify/desk-auth.ts";
import { readFlagsReport } from "./flags-report.ts";
import {
  createIncident,
  incidentLanguage,
  incidentSegment,
  sinceChange,
  type SendRollback,
} from "./incident.ts";
import {
  alertRule,
  createReadingWindow,
  sampleMs,
  type Counts,
} from "./reading-window.ts";
import { rollbackSettings } from "./rollback.ts";
import { readSarvamReport } from "./sarvam-report.ts";

type OpsDeps = Pick<
  RouteDeps,
  | "db"
  | "clock"
  | "config"
  | "metrics"
  | "sarvam"
  | "stopping"
  | "overrides"
  | "experiment"
> & { sendRollback?: SendRollback | undefined };

// The developer console of /ops: the flags of this server, the simulated
// NudgeBee incident and the Sarvam calls. The numbers are real: they come
// from our own metrics registry. NudgeBee itself is not connected in this build.
export function opsRoutes(deps: OpsDeps): Hono<AppEnv> {
  const { config, overrides } = deps;
  const startedAt = deps.clock.now();
  const desk = demoDesk(deskAuth(deps));
  const window = createReadingWindow(deps);
  const incident = createIncident({
    overrides,
    clock: deps.clock,
    rollback: rollbackSettings(config),
    send: deps.sendRollback,
  });
  const flagsFrom =
    config.FLAGSMITH_ENVIRONMENT_KEY === undefined ? "defaults" : "flagsmith";
  void window.sample();
  const timer = setInterval(() => void window.sample(), sampleMs);
  timer.unref();
  deps.stopping.addEventListener("abort", () => clearInterval(timer), {
    once: true,
  });

  const kannadaFires = () =>
    window.languages().find(({ language }) => language === incidentLanguage)
      ?.would_fire ?? false;

  const state = (counts: Counts): OpsState => {
    const decision = incident.decision();
    const override = overrides.get(incidentSegment);
    return {
      recorded: deps.sarvam.mode === "recorded",
      flags_from: flagsFrom,
      changes_via: incident.via,
      window_seconds: alertRule.windowMs / 1000,
      hold_seconds: alertRule.holdMs / 1000,
      languages: window.languages(),
      overrides: {
        bad_config: override.cfg_sarvam !== undefined,
        ops_reading: override.ops_reading ?? null,
      },
      incident: {
        step: incident.step(kannadaFires()),
        decided_at: decision?.at ?? null,
        via: decision?.via ?? null,
        since_change:
          decision?.baseline === null || decision?.baseline === undefined
            ? null
            : sinceChange(counts, decision.baseline),
      },
    };
  };

  const answer = async () => state(await window.sample());

  return new Hono<AppEnv>()
    .get("/api/ops/state", desk, async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(await answer());
    })
    .get("/api/ops/flags", desk, async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(
        await readFlagsReport(
          { ...deps, startedAt, changesVia: incident.via },
          c.req.raw.signal,
        ),
      );
    })
    .get("/api/ops/sarvam", desk, async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(
        await readSarvamReport({
          ...deps,
          recordings: savedRecordings,
          startedAt,
        }),
      );
    })
    .post("/api/ops/trigger", desk, async (c) => {
      if (flagsFrom === "flagsmith") {
        throw appError(
          403,
          "forbidden",
          "This server reads its flags from Flagsmith. Add the cfg_sarvam override for lang_kn in Flagsmith instead: reasoning on, 256 maximum tokens.",
        );
      }
      incident.trigger();
      return c.json(await answer());
    })
    .post("/api/ops/approve", desk, async (c) => {
      const counts = await window.sample();
      if (incident.step(kannadaFires()) !== "approval") {
        throw appError(
          409,
          "invalid_input",
          "No Kannada alert waits for approval now. Watch the readings, then approve when the alert would fire.",
        );
      }
      const baseline = counts.get(incidentLanguage) ?? {
        readings: 0,
        invalid: 0,
      };
      const result = await incident.approve(baseline, c.req.raw.signal);
      if (!result.ok) {
        throw appError(
          502,
          "internal_error",
          result.status === null
            ? "Flagsmith did not answer in 10 seconds, so nothing changed. Try again, or set ops_reading to safe for lang_kn by hand in Flagsmith."
            : `Flagsmith answered ${result.status}, so nothing changed. Check the organisation key and the ids, then try again, or set ops_reading to safe for lang_kn by hand in Flagsmith.`,
        );
      }
      return c.json(await answer());
    })
    .post("/api/ops/reject", desk, async (c) => {
      const counts = await window.sample();
      if (incident.step(kannadaFires()) !== "approval") {
        throw appError(
          409,
          "invalid_input",
          "No Kannada alert waits for approval now, so there is nothing to reject.",
        );
      }
      incident.reject();
      return c.json(state(counts));
    })
    .post("/api/ops/reset", desk, async (c) => {
      incident.reset();
      return c.json(await answer());
    });
}

// The incident changes the readings of every store, and approve changes a
// Flagsmith flag with the organisation key. Anyone can make a seller account
// in this build, so only the demo desk link (the secret DEMO_DESK_TOKEN) opens
// these routes; a seller's own desk session does not.
export function demoDesk(
  desk: MiddlewareHandler<DeskEnv>,
): MiddlewareHandler<DeskEnv> {
  return (c, next) =>
    desk(c, async () => {
      if (c.get("desk").via !== "demo") {
        throw appError(
          403,
          "forbidden",
          "Only the demo desk opens the developer console. Open this page from the demo desk link.",
        );
      }
      await next();
    });
}
