import assert from "node:assert/strict";
import { test } from "node:test";
import { flagDefaults, type OrderFlags } from "../flags/decisions.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { createFlagOverrides } from "../flags/overrides.ts";
import {
  experimentReport,
  flagKind,
  flagRows,
  overrideRows,
  previewOrderId,
  segmentRow,
} from "./flags-report.ts";
import { incidentSarvam } from "./incident.ts";

const decision: OrderFlags = {
  identity: "order:x",
  ops_reading: "safe",
  cfg_sarvam: incidentSarvam,
  exp_reading_path: "native",
  in_experiment: false,
  cfg_demo_trace: false,
  segment: "lang_kn",
  from: "defaults",
};

test("each flag has the kind of its prefix", () => {
  assert.equal(flagKind("ops_voice"), "ops");
  assert.equal(flagKind("exp_reading_path"), "exp");
  assert.equal(flagKind("cfg_sarvam"), "cfg");
  assert.throws(() => flagKind("voice"));
});

test("a flag row shows the value, the default and whether they differ", () => {
  const rows = flagRows({
    ...flagDefaults,
    ops_voice: false,
    cfg_sarvam: { ...flagDefaults.cfg_sarvam },
  });
  assert.equal(rows.length, Object.keys(flagDefaults).length);
  assert.deepEqual(rows[0], {
    name: "ops_voice",
    kind: "ops",
    value: false,
    default: true,
    is_default: false,
  });
  assert.equal(
    rows.find(({ name }) => name === "cfg_sarvam")?.is_default,
    true,
  );
});

test("a segment row names the flags that an in-memory override sets", () => {
  assert.deepEqual(segmentRow("kn-IN", decision, { ops_reading: "safe" }), {
    segment: "lang_kn",
    language: "kn-IN",
    from: "defaults",
    ops_reading: "safe",
    exp_reading_path: "native",
    in_experiment: false,
    cfg_sarvam: incidentSarvam,
    in_memory: ["ops_reading"],
  });
});

test("the override rows list the segments with an in-memory override", () => {
  const overrides = createFlagOverrides(createDefaultFlags());
  assert.deepEqual(overrideRows(overrides), []);
  overrides.set("lang_kn", { ops_reading: "safe" });
  assert.deepEqual(overrideRows(overrides), [
    { segment: "lang_kn", ops_reading: "safe", cfg_sarvam: null },
  ]);
});

test("the experiment report counts each variation by its key", () => {
  assert.deepEqual(
    experimentReport({
      exposures: new Map([["control", 4]]),
      conversions: new Map([["control", 1]]),
      outside: 2,
    }),
    {
      flag: "exp_reading_path",
      metric: "order_saved_unedited",
      variations: [
        { value: "native", key: "control", exposures: 4, conversions: 1 },
        {
          value: "translate_first",
          key: "translate_first",
          exposures: 0,
          conversions: 0,
        },
      ],
      conversions_outside: 2,
    },
  );
});

test("the preview order of a language is fixed", () => {
  assert.equal(previewOrderId("kn-IN"), "developer-console-kn-IN");
});
