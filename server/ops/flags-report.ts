import { isDeepStrictEqual } from "node:util";
import {
  overridableFlagSchema,
  type ChangeVia,
  type FlagKind,
  type OpsFlag,
  type OpsFlags,
  type OpsOverride,
  type OpsSegment,
} from "../../shared/ops.ts";
import type { Clock } from "../clock.ts";
import type { Config } from "../config.ts";
import {
  flagDefaults,
  languageSegments,
  variantKeys,
  type FlagValues,
  type OrderFlags,
} from "../flags/decisions.ts";
import type {
  ExperimentCounts,
  ExperimentTally,
} from "../flags/experiment-tally.ts";
import {
  conversionEvent,
  experimentFlag,
  flagNames,
} from "../flags/flag-values.ts";
import type { FlagOverrides, SegmentOverride } from "../flags/overrides.ts";
import { publicAddress } from "./public-address.ts";
import { segmentLanguages } from "./reading-window.ts";
import { defaultAdminUrl } from "./rollback.ts";

export const flagsmithKeys = [
  "FLAGSMITH_ENVIRONMENT_KEY",
  "FLAGSMITH_ORG_API_KEY",
  "FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY",
  "FLAGSMITH_OPS_READING_FEATURE_ID",
  "FLAGSMITH_LANG_KN_SEGMENT_ID",
] as const satisfies readonly (keyof Config)[];

export const sdkApiUrl = "https://edge.api.flagsmith.com/api/v1/";
export const previewStore = "developer-console";

export type FlagsReportDeps = {
  config: Pick<
    Config,
    | (typeof flagsmithKeys)[number]
    | "FLAGSMITH_API_URL"
    | "FLAGSMITH_ADMIN_API_URL"
  >;
  overrides: FlagOverrides;
  experiment: ExperimentTally;
  clock: Clock;
  startedAt: number;
  changesVia: ChangeVia;
};

// Each language segment is decided for a fixed preview order of its
// language, by the same flags as a reading, with the in-memory overrides.
// Nothing here records an exposure: only the reading pipeline does that.
export async function readFlagsReport(
  deps: FlagsReportDeps,
  signal?: AbortSignal,
): Promise<OpsFlags> {
  const { flags } = deps.overrides;
  const [values, decisions] = await Promise.all([
    flags.environment(signal),
    Promise.all(
      segmentLanguages.map((language) =>
        flags.forOrder(
          previewOrderId(language),
          { store: previewStore, source: "desk", language, is_demo: false },
          signal,
        ),
      ),
    ),
  ]);
  return {
    read_at: deps.clock.now(),
    started_at: deps.startedAt,
    connection: {
      source:
        deps.config.FLAGSMITH_ENVIRONMENT_KEY === undefined
          ? "defaults"
          : "flagsmith",
      api_url: publicAddress(deps.config.FLAGSMITH_API_URL ?? sdkApiUrl),
      admin_api_url: publicAddress(
        deps.config.FLAGSMITH_ADMIN_API_URL ?? defaultAdminUrl,
      ),
      changes_via: deps.changesVia,
      keys: flagsmithKeys.map((name) => ({
        name,
        set: deps.config[name] !== undefined,
      })),
    },
    flags: flagRows(values),
    segments: decisions.map((decision, index) =>
      segmentRow(
        segmentLanguages[index] ?? "unknown",
        decision,
        deps.overrides.get(decision.segment ?? ""),
      ),
    ),
    overrides: overrideRows(deps.overrides),
    experiment: experimentReport(deps.experiment.counts()),
  };
}

export function previewOrderId(language: string): string {
  return `${previewStore}-${language}`;
}

export function flagRows(values: FlagValues): OpsFlag[] {
  return flagNames.map((name) => ({
    name,
    kind: flagKind(name),
    value: values[name],
    default: flagDefaults[name],
    is_default: isDeepStrictEqual(values[name], flagDefaults[name]),
  }));
}

export function flagKind(name: string): FlagKind {
  if (name.startsWith("ops_")) return "ops";
  if (name.startsWith("exp_")) return "exp";
  if (name.startsWith("cfg_")) return "cfg";
  throw new Error(`The flag ${name} has no kind prefix.`);
}

export function segmentRow(
  language: string,
  decision: OrderFlags,
  override: SegmentOverride,
): OpsSegment {
  return {
    segment: decision.segment ?? "none",
    language,
    from: decision.from,
    ops_reading: decision.ops_reading,
    exp_reading_path: decision.exp_reading_path,
    in_experiment: decision.in_experiment,
    cfg_sarvam: decision.cfg_sarvam,
    in_memory: overridableFlagSchema.options.filter(
      (name) => override[name] !== undefined,
    ),
  };
}

export function overrideRows(overrides: FlagOverrides): OpsOverride[] {
  return Object.values(languageSegments).flatMap((segment) => {
    const { ops_reading, cfg_sarvam } = overrides.get(segment);
    return ops_reading === undefined && cfg_sarvam === undefined
      ? []
      : [
          {
            segment,
            ops_reading: ops_reading ?? null,
            cfg_sarvam: cfg_sarvam ?? null,
          },
        ];
  });
}

export function experimentReport(
  counts: ExperimentCounts,
): OpsFlags["experiment"] {
  return {
    flag: experimentFlag,
    metric: conversionEvent,
    variations: Object.entries(variantKeys).map(([value, key]) => ({
      value,
      key,
      exposures: counts.exposures.get(key) ?? 0,
      conversions: counts.conversions.get(key) ?? 0,
    })),
    conversions_outside: counts.outside,
  };
}
