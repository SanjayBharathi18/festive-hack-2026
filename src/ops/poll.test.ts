import assert from "node:assert/strict";
import { test } from "node:test";
import { createPoll, type Timers } from "./poll.ts";

function fakeTimers() {
  const pending = new Map<number, { run: () => void; ms: number }>();
  let next = 1;
  const timers: Timers = {
    set: (run, ms) => {
      pending.set(next, { run, ms });
      return next++;
    },
    clear: (id) => void pending.delete(id as number),
  };
  const fire = () => {
    const [id, entry] = [...pending][0] ?? [];
    if (id === undefined || entry === undefined) return false;
    pending.delete(id);
    entry.run();
    return true;
  };
  return { timers, pending, fire };
}

function page() {
  const listeners: (() => void)[] = [];
  return {
    visibilityState: "visible",
    addEventListener: (_type: "visibilitychange", listener: () => void) =>
      void listeners.push(listener),
    change(state: string) {
      this.visibilityState = state;
      for (const listener of listeners) listener();
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("the poll loads, then loads again after each pause", async () => {
  const { timers, pending, fire } = fakeTimers();
  let loads = 0;
  const poll = createPoll({
    load: async () => void (loads += 1),
    everyMs: 2000,
    visibility: page(),
    timers,
  });
  await poll.now();
  assert.equal(loads, 1);
  assert.deepEqual(
    [...pending.values()].map(({ ms }) => ms),
    [2000],
  );
  fire();
  await settle();
  assert.equal(loads, 2);
  assert.equal(pending.size, 1);
});

test("a failed load still schedules the next one", async () => {
  const { timers, pending } = fakeTimers();
  const poll = createPoll({
    load: async () => {
      throw new Error("offline");
    },
    everyMs: 2000,
    visibility: page(),
    timers,
  });
  await assert.rejects(poll.now(), /offline/);
  assert.equal(pending.size, 1);
});

test("a hidden page stops polling and aborts the load; visible again loads at once", async () => {
  const { timers, pending } = fakeTimers();
  const visibility = page();
  const signals: AbortSignal[] = [];
  let finish: () => void = () => {};
  const poll = createPoll({
    load: (signal) => {
      signals.push(signal);
      return new Promise<void>((resolve) => (finish = resolve));
    },
    everyMs: 2000,
    visibility,
    timers,
  });
  const first = poll.now();
  visibility.change("hidden");
  assert.equal(signals[0]?.aborted, true);
  finish();
  await first;
  assert.equal(pending.size, 0);
  visibility.change("visible");
  assert.equal(signals.length, 2);
  finish();
  await settle();
  assert.equal(pending.size, 1);
});

test("a new load aborts the one before it, and only the newest schedules", async () => {
  const { timers, pending } = fakeTimers();
  const signals: AbortSignal[] = [];
  const finishers: (() => void)[] = [];
  const poll = createPoll({
    load: (signal) => {
      signals.push(signal);
      return new Promise<void>((resolve) => finishers.push(resolve));
    },
    everyMs: 2000,
    visibility: page(),
    timers,
  });
  const first = poll.now();
  const second = poll.now();
  assert.equal(signals[0]?.aborted, true);
  for (const finish of finishers) finish();
  await Promise.all([first, second]);
  assert.equal(pending.size, 1);
});
