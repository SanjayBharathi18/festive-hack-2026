import assert from "node:assert/strict";
import { test } from "node:test";
import {
  opsFlagsSchema,
  opsSarvamSchema,
  opsStateSchema,
  type OpsFlags,
  type OpsSarvam,
  type OpsState,
} from "./ops.ts";

const state: OpsState = {
  recorded: true,
  flags_from: "defaults",
  changes_via: "memory",
  window_seconds: 120,
  hold_seconds: 120,
  languages: [
    {
      language: "kn-IN",
      readings: 6,
      invalid: 5,
      invalid_rate: 5 / 6,
      would_fire: true,
      held_seconds: 30,
      state: "pending",
    },
  ],
  overrides: { bad_config: true, ops_reading: null },
  incident: {
    step: "approval",
    decided_at: null,
    via: null,
    since_change: null,
  },
};

test("the ops state schema takes a valid state", () => {
  assert.deepEqual(opsStateSchema.parse(state), state);
});

test("the ops state schema refuses an unknown step or a rate above 1", () => {
  assert.equal(
    opsStateSchema.safeParse({
      ...state,
      incident: { ...state.incident, step: "investigating" },
    }).success,
    false,
  );
  assert.equal(
    opsStateSchema.safeParse({
      ...state,
      languages: [{ ...state.languages[0], invalid_rate: 1.5 }],
    }).success,
    false,
  );
});

const sarvamConfig = {
  speech_model: "saaras:v4",
  speech_mode: "codemix",
  reading_model: "sarvam-105b",
  reasoning_effort: null,
  max_tokens: 1024,
  translation_model: "mayura:v1",
};

const flags: OpsFlags = {
  read_at: 1,
  started_at: 0,
  connection: {
    source: "defaults",
    api_url: "https://edge.api.flagsmith.com/api/v1/",
    admin_api_url: "https://api.flagsmith.com/api/v1/",
    changes_via: "memory",
    keys: [{ name: "FLAGSMITH_ENVIRONMENT_KEY", set: false }],
  },
  flags: [
    {
      name: "ops_voice",
      kind: "ops",
      value: true,
      default: true,
      is_default: true,
    },
    {
      name: "cfg_sarvam",
      kind: "cfg",
      value: sarvamConfig,
      default: sarvamConfig,
      is_default: true,
    },
  ],
  segments: [
    {
      segment: "lang_kn",
      language: "kn-IN",
      from: "defaults",
      ops_reading: "ai",
      exp_reading_path: "native",
      in_experiment: false,
      cfg_sarvam: sarvamConfig,
      in_memory: ["cfg_sarvam"],
    },
  ],
  overrides: [{ segment: "lang_kn", ops_reading: "safe", cfg_sarvam: null }],
  experiment: {
    flag: "exp_reading_path",
    metric: "order_saved_unedited",
    variations: [
      { value: "native", key: "control", exposures: 2, conversions: 1 },
    ],
    conversions_outside: 0,
  },
};

const sarvam: OpsSarvam = {
  read_at: 1,
  started_at: 0,
  mode: "recorded",
  api_key_set: false,
  base_url: "https://api.sarvam.ai/",
  recordings: {
    saved: 3,
    placeholders: 1,
    test_only: 0,
    by_api: [{ api: "chat", saved: 3, placeholders: 1 }],
  },
  calls: [
    {
      api: "chat",
      model: "sarvam-105b",
      calls: 2,
      outcomes: {
        ok: 1,
        invalid: 1,
        rate_limited: 0,
        no_credit: 0,
        error: 0,
        timeout: 0,
      },
    },
  ],
  billed: [{ api: "translate", unit: "characters", units: 42.5 }],
};

test("the console flags schema takes a valid report and refuses an unknown kind", () => {
  assert.deepEqual(opsFlagsSchema.parse(flags), flags);
  assert.equal(
    opsFlagsSchema.safeParse({
      ...flags,
      flags: [{ ...flags.flags[0], kind: "kill" }],
    }).success,
    false,
  );
});

test("the console Sarvam schema takes a valid report and refuses a missing outcome", () => {
  assert.deepEqual(opsSarvamSchema.parse(sarvam), sarvam);
  assert.equal(
    opsSarvamSchema.safeParse({
      ...sarvam,
      calls: [{ ...sarvam.calls[0], outcomes: { ok: 1 } }],
    }).success,
    false,
  );
});
