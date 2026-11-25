import assert from "node:assert/strict";
import { test } from "node:test";
import { undoWindowMs } from "../../shared/orders.ts";
import { createAfterUndo } from "./after-undo.ts";

function setup() {
  const stop = new AbortController();
  const ran: [string, number][] = [];
  const waiting = createAfterUndo<number>({
    stopping: stop.signal,
    run: (key, value) => ran.push([key, value]),
  });
  return { stop, ran, waiting };
}

test("the work runs at the end of the undo window, once", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { ran, waiting } = setup();
  waiting.schedule("a", 1);
  t.mock.timers.tick(undoWindowMs - 1);
  assert.deepEqual(ran, []);
  assert.equal(waiting.pending(), 1);
  t.mock.timers.tick(1);
  assert.deepEqual(ran, [["a", 1]]);
  assert.equal(waiting.pending(), 0);
  t.mock.timers.tick(undoWindowMs);
  assert.deepEqual(ran, [["a", 1]]);
});

test("a cancel drops the work, and a newer schedule waits again", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { ran, waiting } = setup();
  waiting.schedule("a", 1);
  assert.equal(waiting.cancel("a"), true);
  assert.equal(waiting.cancel("a"), false);
  waiting.schedule("b", 1);
  t.mock.timers.tick(undoWindowMs / 2);
  waiting.schedule("b", 2);
  t.mock.timers.tick(undoWindowMs / 2);
  assert.deepEqual(ran, []);
  t.mock.timers.tick(undoWindowMs / 2);
  assert.deepEqual(ran, [["b", 2]]);
});

test("a stopping server runs all that waits, and then runs new work at once", () => {
  const { stop, ran, waiting } = setup();
  waiting.schedule("a", 1);
  waiting.schedule("b", 2);
  stop.abort();
  assert.deepEqual(ran, [
    ["a", 1],
    ["b", 2],
  ]);
  waiting.schedule("c", 3);
  assert.deepEqual(ran.at(-1), ["c", 3]);
  assert.equal(waiting.pending(), 0);
});
