import { z } from "zod";

export const alertStateSchema = z.enum(["inactive", "pending", "firing"]);
export type AlertState = z.infer<typeof alertStateSchema>;

export const opsLanguageSchema = z.object({
  language: z.string(),
  readings: z.int().nonnegative(),
  invalid: z.int().nonnegative(),
  invalid_rate: z.number().min(0).max(1).nullable(),
  would_fire: z.boolean(),
  held_seconds: z.int().nonnegative(),
  state: alertStateSchema,
});
export type OpsLanguage = z.infer<typeof opsLanguageSchema>;

export const opsStepSchema = z.enum([
  "watching",
  "approval",
  "approved",
  "rejected",
]);
export type OpsStep = z.infer<typeof opsStepSchema>;

export const changeViaSchema = z.enum(["flagsmith", "memory"]);
export type ChangeVia = z.infer<typeof changeViaSchema>;

export const opsStateSchema = z.object({
  recorded: z.boolean(),
  flags_from: z.enum(["flagsmith", "defaults"]),
  changes_via: changeViaSchema,
  window_seconds: z.int().positive(),
  hold_seconds: z.int().positive(),
  languages: z.array(opsLanguageSchema),
  overrides: z.object({
    bad_config: z.boolean(),
    ops_reading: z.enum(["ai", "safe", "manual"]).nullable(),
  }),
  incident: z.object({
    step: opsStepSchema,
    decided_at: z.int().nullable(),
    via: changeViaSchema.nullable(),
    since_change: z
      .object({
        readings: z.int().nonnegative(),
        invalid: z.int().nonnegative(),
      })
      .nullable(),
  }),
});
export type OpsState = z.infer<typeof opsStateSchema>;

export const flagKindSchema = z.enum(["ops", "exp", "cfg"]);
export type FlagKind = z.infer<typeof flagKindSchema>;

const readingPathSchema = z.enum(["ai", "safe", "manual"]);

export const opsSarvamConfigSchema = z.object({
  speech_model: z.string(),
  speech_mode: z.string(),
  reading_model: z.string(),
  reasoning_effort: z.enum(["low", "medium", "high"]).nullable(),
  max_tokens: z.int().positive(),
  translation_model: z.string(),
});
export type OpsSarvamConfig = z.infer<typeof opsSarvamConfigSchema>;

export const opsFlagValueSchema = z.union([
  z.boolean(),
  z.string(),
  opsSarvamConfigSchema,
]);
export type OpsFlagValue = z.infer<typeof opsFlagValueSchema>;

export const opsFlagSchema = z.object({
  name: z.string(),
  kind: flagKindSchema,
  value: opsFlagValueSchema,
  default: opsFlagValueSchema,
  is_default: z.boolean(),
});
export type OpsFlag = z.infer<typeof opsFlagSchema>;

export const overridableFlagSchema = z.enum(["ops_reading", "cfg_sarvam"]);
export type OverridableFlag = z.infer<typeof overridableFlagSchema>;

export const opsSegmentSchema = z.object({
  segment: z.string(),
  language: z.string(),
  from: z.enum(["flagsmith", "defaults"]),
  ops_reading: readingPathSchema,
  exp_reading_path: z.enum(["native", "translate_first"]),
  in_experiment: z.boolean(),
  cfg_sarvam: opsSarvamConfigSchema,
  in_memory: z.array(overridableFlagSchema),
});
export type OpsSegment = z.infer<typeof opsSegmentSchema>;

export const opsOverrideSchema = z.object({
  segment: z.string(),
  ops_reading: readingPathSchema.nullable(),
  cfg_sarvam: opsSarvamConfigSchema.nullable(),
});
export type OpsOverride = z.infer<typeof opsOverrideSchema>;

export const opsVariationSchema = z.object({
  value: z.string(),
  key: z.string(),
  exposures: z.int().nonnegative(),
  conversions: z.int().nonnegative(),
});
export type OpsVariation = z.infer<typeof opsVariationSchema>;

// The Flagsmith section of the developer console. Keys are only named, with
// whether each one is set: their values never leave the server.
export const opsFlagsSchema = z.object({
  read_at: z.int(),
  started_at: z.int(),
  connection: z.object({
    source: z.enum(["flagsmith", "defaults"]),
    api_url: z.string(),
    admin_api_url: z.string(),
    changes_via: changeViaSchema,
    keys: z.array(z.object({ name: z.string(), set: z.boolean() })),
  }),
  flags: z.array(opsFlagSchema),
  segments: z.array(opsSegmentSchema),
  overrides: z.array(opsOverrideSchema),
  experiment: z.object({
    flag: z.string(),
    metric: z.string(),
    variations: z.array(opsVariationSchema),
    conversions_outside: z.int().nonnegative(),
  }),
});
export type OpsFlags = z.infer<typeof opsFlagsSchema>;

export const sarvamOutcomeSchema = z.enum([
  "ok",
  "invalid",
  "rate_limited",
  "no_credit",
  "error",
  "timeout",
]);
export type SarvamOutcome = z.infer<typeof sarvamOutcomeSchema>;

const count = z.int().nonnegative();

export const opsSarvamCallsSchema = z.object({
  api: z.string(),
  model: z.string(),
  calls: count,
  outcomes: z.record(sarvamOutcomeSchema, count),
});
export type OpsSarvamCalls = z.infer<typeof opsSarvamCallsSchema>;

// The Sarvam section of the developer console: the numbers come from the
// metrics registry of this server, since it started.
export const opsSarvamSchema = z.object({
  read_at: z.int(),
  started_at: z.int(),
  mode: z.enum(["live", "recorded"]),
  api_key_set: z.boolean(),
  base_url: z.string(),
  recordings: z.object({
    saved: count,
    placeholders: count,
    test_only: count,
    by_api: z.array(
      z.object({ api: z.string(), saved: count, placeholders: count }),
    ),
  }),
  calls: z.array(opsSarvamCallsSchema),
  billed: z.array(
    z.object({
      api: z.string(),
      unit: z.string(),
      units: z.number().nonnegative(),
    }),
  ),
});
export type OpsSarvam = z.infer<typeof opsSarvamSchema>;
