import assert from "node:assert/strict";
import { test } from "node:test";
import type { OpsState } from "../../shared/ops.ts";
import {
  heldClock,
  languageName,
  languageRow,
  runView,
  sharePercent,
} from "./ops-model.ts";

const state = (incident: Partial<OpsState["incident"]>): OpsState => ({
  recorded: true,
  flags_from: "defaults",
  changes_via: "memory",
  window_seconds: 120,
  hold_seconds: 120,
  languages: [],
  overrides: { bad_config: true, ops_reading: null },
  incident: {
    step: "watching",
    decided_at: null,
    via: null,
    since_change: null,
    ...incident,
  },
});

test("a row shows the counts, the share and the alert words", () => {
  assert.deepEqual(
    languageRow({
      language: "kn-IN",
      readings: 6,
      invalid: 5,
      invalid_rate: 5 / 6,
      would_fire: true,
      held_seconds: 75,
      state: "pending",
    }),
    {
      code: "kn-IN",
      name: "ops.language.kn",
      readings: 6,
      invalid: 5,
      share: "83%",
      alert: "ops.readings.pending",
      held: "1:15",
      fires: true,
    },
  );
});

test("names, shares and clocks", () => {
  assert.equal(languageName("hi-IN"), "ops.language.hi");
  assert.equal(languageName("bn-IN"), "ops.language.other");
  assert.equal(languageName("unknown"), "ops.language.unknown");
  assert.equal(sharePercent(null), null);
  assert.equal(sharePercent(0.3), "30%");
  assert.equal(heldClock(0), "0:00");
  assert.equal(heldClock(120), "2:00");
});

test("the run shows the step of the incident", () => {
  assert.deepEqual(runView(state({})), {
    watching: true,
    approval: false,
    approved: null,
    rejected: false,
    recovery: null,
  });
  assert.equal(runView(state({ step: "approval" })).approval, true);
  assert.equal(runView(state({ step: "rejected" })).rejected, true);
  const approved = runView(
    state({
      step: "approved",
      via: "flagsmith",
      since_change: { readings: 3, invalid: 0 },
    }),
  );
  assert.equal(approved.approved, "flagsmith");
  assert.deepEqual(approved.recovery, {
    readings: 3,
    invalid: 0,
    recovered: true,
  });
  assert.equal(
    runView(
      state({ step: "approved", since_change: { readings: 0, invalid: 0 } }),
    ).recovery?.recovered,
    false,
  );
});
