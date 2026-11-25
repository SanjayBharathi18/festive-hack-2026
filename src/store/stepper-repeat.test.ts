import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createRepeat, holdDelayMs, repeatEveryMs } from "./stepper-repeat.ts";

test("a tap steps once, on its click", (t) => {
  const { repeat, steps } = setup(t);
  repeat.press();
  t.mock.timers.tick(holdDelayMs - 1);
  repeat.release();
  assert.equal(repeat.takeRepeated(), false);
  assert.equal(steps.count, 0);
});

test("a hold repeats the step until the finger lifts, and its click adds nothing", (t) => {
  const { repeat, steps } = setup(t);
  repeat.press();
  t.mock.timers.tick(holdDelayMs);
  assert.equal(steps.count, 1);
  t.mock.timers.tick(repeatEveryMs * 3);
  assert.equal(steps.count, 4);
  repeat.release();
  assert.equal(repeat.takeRepeated(), true);
  assert.equal(repeat.takeRepeated(), false);
  t.mock.timers.tick(repeatEveryMs * 5);
  assert.equal(steps.count, 4);
});

test("the hold stops when the step cannot go on", (t) => {
  const { repeat, steps } = setup(t, 2);
  repeat.press();
  t.mock.timers.tick(holdDelayMs);
  for (let tick = 0; tick < 10; tick++) t.mock.timers.tick(repeatEveryMs);
  assert.equal(steps.count, 2);
  repeat.release();
});

test("a click long after a hold is a new tap", (t) => {
  const { repeat } = setup(t);
  repeat.press();
  t.mock.timers.tick(holdDelayMs);
  t.mock.timers.tick(repeatEveryMs);
  repeat.release();
  t.mock.timers.tick(1);
  assert.equal(repeat.takeRepeated(), false);
});

test("a new press starts again from a tap", (t) => {
  const { repeat, steps } = setup(t);
  repeat.press();
  t.mock.timers.tick(holdDelayMs);
  repeat.release();
  repeat.press();
  assert.equal(repeat.takeRepeated(), false);
  t.mock.timers.tick(holdDelayMs - 1);
  repeat.release();
  assert.equal(steps.count, 1);
});

function setup(t: TestContext, limit = Number.POSITIVE_INFINITY) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const steps = { count: 0 };
  const repeat = createRepeat(() => {
    steps.count += 1;
    return steps.count < limit;
  });
  return { repeat, steps };
}
