import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { isAbortError } from "../api/api.ts";
import { createWait } from "./wait.ts";

test("under 300 ms nothing changes", async (t) => {
  const { control, line, wait } = setup(t);
  const work = deferred<string>();
  const result = wait.run(() => work.promise, "Saving the order");
  t.mock.timers.tick(299);
  assert.equal(control.busy(), false);
  work.resolve("saved");
  assert.equal(await result, "saved");
  t.mock.timers.tick(2000);
  assert.equal(control.busy(), false);
  assert.deepEqual(line.read(), ["", ""]);
  assert.equal(control.changes, 0);
});

test("after 300 ms the control is busy; after 1 s the progress shows in words", async (t) => {
  const { control, line, wait } = setup(t);
  const work = deferred<string>();
  let progress = (_words: string) => {};
  const result = wait.run((_signal, report) => {
    progress = report;
    return work.promise;
  }, "Reading the voice note");
  t.mock.timers.tick(300);
  assert.equal(wait.phase, "busy");
  assert.equal(control.busy(), true);
  assert.deepEqual(line.read(), ["", ""]);
  t.mock.timers.tick(700);
  assert.equal(wait.phase, "progress");
  assert.deepEqual(line.read(), ["Reading the voice note", "· 1 s"]);
  t.mock.timers.tick(3000);
  assert.deepEqual(line.read(), ["Reading the voice note", "· 4 s"]);
  progress("Checking the menu");
  assert.deepEqual(line.read(), ["Checking the menu", "· 4 s"]);
  work.resolve("draft");
  assert.equal(await result, "draft");
  assert.equal(control.busy(), false);
  assert.deepEqual(line.read(), ["", ""]);
  assert.equal(wait.running, false);
});

test("cancel resets the control at once and rejects with an AbortError", async (t) => {
  const { control, wait } = setup(t);
  let seen: AbortSignal | undefined;
  const result = wait.run((signal) => {
    seen = signal;
    return new Promise<never>(() => {});
  }, "Saving the order");
  t.mock.timers.tick(500);
  assert.equal(control.busy(), true);
  wait.cancel();
  assert.equal(control.busy(), false);
  assert.equal(seen?.aborted, true);
  await assert.rejects(result, isAbortError);
  assert.equal(wait.running, false);
});

test("a second tap while a run runs is ignored, and the first run goes on", async (t) => {
  const { wait } = setup(t);
  const work = deferred<string>();
  let firstSignal: AbortSignal | undefined;
  let secondStarted = false;
  const first = wait.run((signal) => {
    firstSignal = signal;
    return work.promise;
  }, "Reading the voice note");
  const second = wait.run(async () => {
    secondStarted = true;
    return "again";
  }, "Reading the voice note");
  await assert.rejects(second, isAbortError);
  assert.equal(secondStarted, false);
  assert.equal(firstSignal?.aborted, false);
  work.resolve("draft");
  assert.equal(await first, "draft");
});

test("restart cancels the running work and starts again, for search", async (t) => {
  const { wait } = setup(t);
  const first = wait.run(() => new Promise<never>(() => {}), "Searching");
  const second = wait.run(async () => "results", "Searching", {
    restart: true,
  });
  await assert.rejects(first, isAbortError);
  assert.equal(await second, "results");
});

test("a run that was replaced cannot write the line any more", async (t) => {
  const { line, wait } = setup(t);
  let reportOld = (_words: string) => {};
  const old = wait.run((_signal, report) => {
    reportOld = report;
    return new Promise<never>(() => {});
  }, "Reading A");
  old.catch(() => {});
  t.mock.timers.tick(100);
  const current = wait.run(() => new Promise<never>(() => {}), "Saving B", {
    restart: true,
  });
  current.catch(() => {});
  t.mock.timers.tick(1500);
  assert.equal(line.read()[0], "Saving B");
  reportOld("Sending part 2 of 3");
  assert.equal(line.read()[0], "Saving B");
  wait.cancel();
});

test("a failed work clears the busy mark and passes on its error", async (t) => {
  const { control, wait } = setup(t);
  const work = deferred<string>();
  const result = wait.run(() => work.promise, "Saving the order");
  t.mock.timers.tick(1200);
  work.reject(new Error("No network"));
  await assert.rejects(result, /No network/);
  assert.equal(control.busy(), false);
  t.mock.timers.tick(5000);
  assert.equal(control.busy(), false);
});

test("a wait without a line only marks the control", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const control = fakeControl();
  const wait = createWait({ control, line: null });
  const work = deferred<void>();
  const result = wait.run(() => work.promise, "Sharing");
  t.mock.timers.tick(1500);
  assert.equal(control.busy(), true);
  work.resolve();
  await result;
  assert.equal(control.busy(), false);
});

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const control = fakeControl();
  const line = fakeLine();
  return { control, line, wait: createWait({ control, line }) };
}

function fakeControl() {
  const attributes = new Map<string, string>();
  const control = {
    changes: 0,
    busy: () => attributes.get("aria-busy") === "true",
    setAttribute(name: string, value: string) {
      control.changes += 1;
      attributes.set(name, value);
    },
    removeAttribute(name: string) {
      if (attributes.delete(name)) control.changes += 1;
    },
  };
  return control;
}

function fakeLine() {
  const words = { textContent: "" as string | null };
  const seconds = { textContent: "" as string | null };
  return {
    read: () => [words.textContent, seconds.textContent],
    querySelector: (selectors: string) =>
      selectors === "[role=status]"
        ? words
        : selectors === ".num"
          ? seconds
          : null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}
