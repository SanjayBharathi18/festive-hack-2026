import type { ChangeVia, OpsStep } from "../../shared/ops.ts";
import type { Clock } from "../clock.ts";
import { safeSarvam, type CfgSarvam } from "../flags/decisions.ts";
import type { FlagOverrides } from "../flags/overrides.ts";
import type { Counts, Tally } from "./reading-window.ts";
import {
  sendRollback,
  type RollbackResult,
  type RollbackSettings,
} from "./rollback.ts";

export type Decision = {
  step: "approved" | "rejected";
  at: number;
  via: ChangeVia | null;
  baseline: Tally | null;
};

export type SendRollback = (
  settings: RollbackSettings,
  signal?: AbortSignal,
) => Promise<RollbackResult>;

export type Incident = ReturnType<typeof createIncident>;

export const incidentSegment = "lang_kn";
export const incidentLanguage = "kn-IN";

// The bad change of the demo incident (docs/system.md, "NudgeBee workflows"):
// reasoning on with 256 maximum tokens, so Kannada answers come back cut off.
export const incidentSarvam: CfgSarvam = {
  ...safeSarvam,
  reasoning_effort: "medium",
  max_tokens: 256,
};

// The simulated NudgeBee run for lang_kn: the approval, and on approve the
// change of nudgebee/rollback-lang-kn.yaml, in Flagsmith or in memory.
export function createIncident({
  overrides,
  clock,
  rollback,
  send = (settings, signal) => sendRollback(settings, { signal }),
}: {
  overrides: FlagOverrides;
  clock: Clock;
  rollback: RollbackSettings | undefined;
  send?: SendRollback;
}) {
  const via: ChangeVia = rollback === undefined ? "memory" : "flagsmith";
  let decision: Decision | null = null;
  return {
    via,
    decision: (): Decision | null => decision,
    step: (wouldFire: boolean): OpsStep =>
      decision?.step ?? (wouldFire ? "approval" : "watching"),
    trigger: (): void => {
      overrides.remove(incidentSegment, ["ops_reading"]);
      overrides.set(incidentSegment, { cfg_sarvam: incidentSarvam });
      decision = null;
    },
    approve: async (
      baseline: Tally,
      signal?: AbortSignal,
    ): Promise<RollbackResult> => {
      if (rollback === undefined) {
        overrides.set(incidentSegment, { ops_reading: "safe" });
      } else {
        const result = await send(rollback, signal);
        if (!result.ok) return result;
      }
      decision = { step: "approved", at: clock.now(), via, baseline };
      return { ok: true };
    },
    reject: (): void => {
      decision = {
        step: "rejected",
        at: clock.now(),
        via: null,
        baseline: null,
      };
    },
    reset: (): void => {
      overrides.remove(incidentSegment, ["cfg_sarvam", "ops_reading"]);
      decision = null;
    },
  };
}

export function sinceChange(counts: Counts, baseline: Tally): Tally {
  const now = counts.get(incidentLanguage) ?? { readings: 0, invalid: 0 };
  return {
    readings: now.readings - baseline.readings,
    invalid: now.invalid - baseline.invalid,
  };
}
