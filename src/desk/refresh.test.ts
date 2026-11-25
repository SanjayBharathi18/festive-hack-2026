import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { keepFresh } from "./refresh.ts";

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const window = new EventTarget();
  const document = new EventTarget();
  const controller = new AbortController();
  let shown = true;
  let loads = 0;
  keepFresh({
    load: () => loads++,
    everyMs: 60_000,
    window,
    document,
    visible: () => shown,
    signal: controller.signal,
  });
  return {
    window,
    document,
    controller,
    hide: (hidden: boolean) => {
      shown = !hidden;
    },
    loads: () => loads,
    tick: (ms: number) => t.mock.timers.tick(ms),
  };
}

test("the desk asks again on an interval while it shows", (t) => {
  const desk = setup(t);
  assert.equal(desk.loads(), 0);
  desk.tick(60_000);
  assert.equal(desk.loads(), 1);
  desk.hide(true);
  desk.tick(60_000);
  assert.equal(desk.loads(), 1);
});

test("the desk asks again when she comes back to it", (t) => {
  const desk = setup(t);
  desk.tick(10_000);
  desk.hide(true);
  desk.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(desk.loads(), 0);
  desk.hide(false);
  desk.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(desk.loads(), 1);
  desk.window.dispatchEvent(new Event("focus"));
  assert.equal(desk.loads(), 1);
  desk.tick(6000);
  desk.window.dispatchEvent(new Event("focus"));
  assert.equal(desk.loads(), 2);
});

test("an aborted watch asks no more", (t) => {
  const desk = setup(t);
  desk.controller.abort();
  desk.tick(120_000);
  desk.window.dispatchEvent(new Event("focus"));
  assert.equal(desk.loads(), 0);
});
