import assert from "node:assert/strict";
import { test } from "node:test";
import { flagDefaults, safeSarvam, type CfgSarvam } from "./decisions.ts";
import {
  enrolmentFor,
  flagKinds,
  flagNames,
  isFlagName,
  maxValueBytes,
  readFlag,
  storedDefault,
  type ExperimentState,
} from "./flag-values.ts";

const reasoning: CfgSarvam = {
  ...safeSarvam,
  reasoning_effort: "low",
  max_tokens: 256,
};

test("each flag has a kind, and the names are the flags of the contract", () => {
  assert.deepEqual(flagNames, Object.keys(flagDefaults));
  assert.equal(flagKinds.ops_voice, "on_off");
  assert.equal(flagKinds.cfg_demo_trace, "on_off");
  assert.equal(flagKinds.cfg_sarvam, "json");
  assert.equal(flagKinds.exp_reading_path, "experiment");
  assert.equal(flagKinds.ops_reading, "value");
});

test("isFlagName knows only the flags of the contract", () => {
  assert.equal(isFlagName("ops_reading"), true);
  assert.equal(isFlagName("constructor"), false);
  assert.equal(isFlagName("ops_unknown"), false);
});

test("the stored defaults are the Flagsmith form of the defaults in code", () => {
  assert.deepEqual(storedDefault("ops_voice"), { enabled: true, value: null });
  assert.deepEqual(storedDefault("cfg_demo_trace"), {
    enabled: false,
    value: null,
  });
  assert.deepEqual(storedDefault("ops_reading"), {
    enabled: true,
    value: "ai",
  });
  assert.deepEqual(storedDefault("exp_reading_path"), {
    enabled: true,
    value: "native",
  });
  const sarvam = storedDefault("cfg_sarvam");
  assert.equal(typeof sarvam.value, "string");
  assert.deepEqual(JSON.parse(sarvam.value ?? ""), safeSarvam);
});

test("each stored default reads back as its default in code", () => {
  for (const name of flagNames) {
    const reading = readFlag(name, storedDefault(name));
    assert.deepEqual(reading, { value: flagDefaults[name] }, name);
  }
});

test("on/off flags read the state and ignore the value", () => {
  assert.deepEqual(readFlag("ops_voice", { enabled: false, value: "on" }), {
    value: false,
  });
  assert.deepEqual(readFlag("cfg_demo_trace", { enabled: true, value: null }), {
    value: true,
  });
});

test("value flags read the value and ignore the state", () => {
  assert.deepEqual(
    readFlag("ops_reading", { enabled: false, value: "manual" }),
    { value: "manual" },
  );
  assert.deepEqual(
    readFlag("ops_review_check", { enabled: true, value: "wordlist" }),
    { value: "wordlist" },
  );
});

test("an invalid value gives the default and names the problem", () => {
  assert.deepEqual(readFlag("ops_reading", { enabled: true, value: "AI" }), {
    value: "ai",
    problem: 'Invalid option: expected one of "ai"|"safe"|"manual"',
  });
  const missing = readFlag("ops_search", { enabled: true, value: null });
  assert.equal(missing.value, "ai");
  assert.ok(missing.problem);
});

test("the experiment flag reads the value when it is on, and native when it is off", () => {
  assert.deepEqual(
    readFlag("exp_reading_path", { enabled: true, value: "translate_first" }),
    { value: "translate_first" },
  );
  assert.deepEqual(
    readFlag("exp_reading_path", { enabled: false, value: "translate_first" }),
    { value: "native" },
  );
});

test("cfg_sarvam is parsed from JSON, then checked with its schema", () => {
  assert.deepEqual(
    readFlag("cfg_sarvam", { enabled: true, value: JSON.stringify(reasoning) }),
    { value: reasoning },
  );
  const cases: [unknown, RegExp][] = [
    [{ ...reasoning }, /^is not a JSON string$/],
    [null, /^is not a JSON string$/],
    [12, /^is not a JSON string$/],
    ["{not json", /is not valid JSON/],
    [JSON.stringify({ ...reasoning, max_tokens: 0 }), /^max_tokens: /],
    [
      JSON.stringify({ ...reasoning, reasoning_effort: "none" }),
      /reasoning_effort/,
    ],
    [JSON.stringify({ speech_model: "saaras:v4" }), /speech_mode/],
  ];
  for (const [value, problem] of cases) {
    const reading = readFlag("cfg_sarvam", { enabled: true, value });
    assert.deepEqual(reading.value, safeSarvam, String(value));
    assert.match(reading.problem ?? "", problem, String(value));
  }
});

test("cfg_sarvam may hold 20,000 bytes, counted in UTF-8, and no more", () => {
  const json = JSON.stringify(reasoning);
  const exact = json + " ".repeat(maxValueBytes - json.length);
  assert.equal(Buffer.byteLength(exact), maxValueBytes);
  assert.deepEqual(readFlag("cfg_sarvam", { enabled: true, value: exact }), {
    value: reasoning,
  });
  assert.deepEqual(
    readFlag("cfg_sarvam", { enabled: true, value: `${exact} ` }).problem,
    "is over 20000 bytes",
  );
  const kannada = JSON.stringify({
    ...reasoning,
    speech_model: "ಕ".repeat(7000),
  });
  assert.ok(kannada.length < maxValueBytes);
  assert.equal(
    readFlag("cfg_sarvam", { enabled: true, value: kannada }).problem,
    "is over 20000 bytes",
  );
});

test("an order is enrolled only when the flag is on, in the rollout, with a variant whose key matches the value", () => {
  const state: ExperimentState = {
    enabled: true,
    value: "translate_first",
    variant: "translate_first",
    experiment: { id: 7, inExperiment: true },
  };
  const path = { value: "translate_first" as const };
  assert.deepEqual(enrolmentFor(state, path), {
    enrolment: { id: 7, variant: "translate_first" },
  });
  assert.deepEqual(
    enrolmentFor(
      { ...state, value: "native", variant: "control" },
      { value: "native" },
    ),
    { enrolment: { id: 7, variant: "control" } },
  );
  for (const other of [
    { ...state, enabled: false },
    { ...state, isDefault: true },
    { ...state, variant: undefined },
    { ...state, experiment: undefined },
    { ...state, experiment: { id: 7, inExperiment: false } },
  ]) {
    assert.deepEqual(enrolmentFor(other, path), {}, JSON.stringify(other));
  }
  assert.deepEqual(
    enrolmentFor(state, { value: "native", problem: "is not valid" }),
    {},
  );
  assert.deepEqual(enrolmentFor({ ...state, variant: "control" }, path), {
    problem:
      "the variant key does not match the value, so the order is not in the experiment",
  });
});
