import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { createFlagOverrides } from "../flags/overrides.ts";
import { createTestClock } from "../test-app.ts";
import {
  createIncident,
  incidentSarvam,
  incidentSegment,
  sinceChange,
  type SendRollback,
} from "./incident.ts";
import type { RollbackSettings } from "./rollback.ts";

const settings: RollbackSettings = {
  adminUrl: "https://flagsmith.test/api/v1/",
  orgKey: "org-key",
  environmentKey: "env-key",
  featureId: 11,
  segmentId: 22,
};

function setup(rollback?: RollbackSettings, send?: SendRollback) {
  const overrides = createFlagOverrides(createDefaultFlags());
  const clock = createTestClock();
  const incident = createIncident({ overrides, clock, rollback, send });
  return { overrides, clock, incident };
}

test("the steps follow the alert, then the decision", async () => {
  const { incident, clock } = setup();
  assert.equal(incident.step(false), "watching");
  assert.equal(incident.step(true), "approval");
  await incident.approve({ readings: 5, invalid: 5 });
  assert.equal(incident.step(false), "approved");
  assert.deepEqual(incident.decision(), {
    step: "approved",
    at: clock.now(),
    via: "memory",
    baseline: { readings: 5, invalid: 5 },
  });
  incident.reset();
  assert.equal(incident.step(true), "approval");
  incident.reject();
  assert.equal(incident.step(true), "rejected");
  assert.equal(incident.decision()?.via, null);
});

test("trigger sets the bad cfg_sarvam for lang_kn and starts a new run", async () => {
  const { incident, overrides } = setup();
  await incident.approve({ readings: 0, invalid: 0 });
  incident.trigger();
  assert.deepEqual(overrides.get(incidentSegment), {
    cfg_sarvam: incidentSarvam,
  });
  assert.equal(incident.decision(), null);
  assert.equal(incidentSarvam.reasoning_effort, "medium");
  assert.equal(incidentSarvam.max_tokens, 256);
});

test("approve without Flagsmith sets ops_reading safe for lang_kn in memory", async () => {
  const { incident, overrides } = setup();
  incident.trigger();
  assert.deepEqual(await incident.approve({ readings: 5, invalid: 5 }), {
    ok: true,
  });
  assert.deepEqual(overrides.get(incidentSegment), {
    cfg_sarvam: incidentSarvam,
    ops_reading: "safe",
  });
  incident.reset();
  assert.deepEqual(overrides.get(incidentSegment), {});
});

test("approve with Flagsmith sends the rollback and changes nothing in memory", async () => {
  const sent: RollbackSettings[] = [];
  const { incident, overrides } = setup(settings, async (given) => {
    sent.push(given);
    return { ok: true };
  });
  assert.equal(incident.via, "flagsmith");
  await incident.approve({ readings: 1, invalid: 1 });
  assert.deepEqual(sent, [settings]);
  assert.deepEqual(overrides.get(incidentSegment), {});
  assert.equal(incident.decision()?.via, "flagsmith");
});

test("a failed rollback keeps the approval open", async () => {
  const { incident } = setup(settings, async () => ({
    ok: false,
    status: 403,
  }));
  assert.deepEqual(await incident.approve({ readings: 1, invalid: 1 }), {
    ok: false,
    status: 403,
  });
  assert.equal(incident.decision(), null);
  assert.equal(incident.step(true), "approval");
});

test("sinceChange counts the Kannada readings after the baseline", () => {
  const counts = new Map([
    ["kn-IN", { readings: 12, invalid: 5 }],
    ["hi-IN", { readings: 3, invalid: 0 }],
  ]);
  assert.deepEqual(sinceChange(counts, { readings: 5, invalid: 5 }), {
    readings: 7,
    invalid: 0,
  });
  assert.deepEqual(sinceChange(new Map(), { readings: 0, invalid: 0 }), {
    readings: 0,
    invalid: 0,
  });
});
