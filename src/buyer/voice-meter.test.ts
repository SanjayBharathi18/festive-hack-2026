import assert from "node:assert/strict";
import { test } from "node:test";
import { showVoiceMeter, timerText } from "./voice-meter.ts";

test("the timer counts up to the 5-minute limit", () => {
  assert.equal(timerText(0), "0:00 / 5:00");
  assert.equal(timerText(72_400), "1:12 / 5:00");
});

test("the meter and the timer show only while the microphone is open", () => {
  const set = new Map<string, string>();
  const parts = {
    level: {
      hidden: true,
      style: {
        setProperty: (name: string, value: string) => set.set(name, value),
      },
    },
    timer: { hidden: true, textContent: "" },
  };
  showVoiceMeter(parts, { phase: "recording", level: 0.4, ms: 3_000 });
  assert.equal(parts.level.hidden, false);
  assert.equal(parts.timer.hidden, false);
  assert.equal(set.get("--level"), "0.4");
  assert.equal(parts.timer.textContent, "0:03 / 5:00");
  showVoiceMeter(parts, { phase: "stopping", level: 0, ms: 0 });
  assert.equal(parts.level.hidden, true);
  assert.equal(parts.timer.hidden, true);
});
