import assert from "node:assert/strict";
import { test } from "node:test";
import { createRefresh, refreshEveryMs } from "./order-refresh.ts";

test("the page fetches again when it becomes visible, and not when hidden", async () => {
  const { visibility, show, hide } = fakeDocument();
  const signals: AbortSignal[] = [];
  const refresh = createRefresh({
    visibility,
    load: async (signal) => void signals.push(signal),
    timers: fakeTimers().timers,
  });
  await refresh.load();
  hide();
  assert.equal(signals.length, 1);
  show();
  await Promise.resolve();
  assert.equal(signals.length, 2);
});

test("a new fetch cancels the fetch before it", async () => {
  const { visibility, show } = fakeDocument();
  const signals: AbortSignal[] = [];
  const refresh = createRefresh({
    visibility,
    load: (signal) => {
      signals.push(signal);
      return new Promise(() => {});
    },
    timers: fakeTimers().timers,
  });
  void refresh.load();
  show();
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals[1]?.aborted, false);
});

test("a visible page fetches its status every 15 seconds, and a hidden page stops", async () => {
  const { visibility, show, hide } = fakeDocument();
  const clock = fakeTimers();
  let loads = 0;
  const refresh = createRefresh({
    visibility,
    load: async () => void (loads += 1),
    timers: clock.timers,
  });
  await refresh.load();
  assert.deepEqual(clock.waiting(), [refreshEveryMs]);
  await clock.fire();
  assert.equal(loads, 2);
  assert.deepEqual(clock.waiting(), [refreshEveryMs]);
  hide();
  assert.deepEqual(clock.waiting(), []);
  show();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(loads, 3);
  assert.deepEqual(clock.waiting(), [refreshEveryMs]);
});

test("a failed fetch still asks again later", async () => {
  const { visibility } = fakeDocument();
  const clock = fakeTimers();
  const refresh = createRefresh({
    visibility,
    load: () => Promise.reject(new Error("offline")),
    timers: clock.timers,
  });
  await assert.rejects(refresh.load(), /offline/);
  assert.deepEqual(clock.waiting(), [refreshEveryMs]);
});

function fakeDocument() {
  const listeners: (() => void)[] = [];
  const visibility = {
    visibilityState: "visible",
    addEventListener: (_type: "visibilitychange", listener: () => void) =>
      void listeners.push(listener),
  };
  const set = (state: string) => {
    visibility.visibilityState = state;
    for (const listener of listeners) listener();
  };
  return { visibility, show: () => set("visible"), hide: () => set("hidden") };
}

function fakeTimers() {
  const pending = new Map<number, { run: () => void; ms: number }>();
  let next = 0;
  const timers = {
    setTimeout: (run: () => void, ms: number) => {
      next += 1;
      pending.set(next, { run, ms });
      return next;
    },
    clearTimeout: (timer: unknown) => void pending.delete(timer as number),
  };
  return {
    timers,
    waiting: () => [...pending.values()].map(({ ms }) => ms),
    fire: async () => {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, { run }] of due) run();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
