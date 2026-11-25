import assert from "node:assert/strict";
import { test } from "node:test";
import { createWait } from "../wait/wait.ts";
import { createSearchRuns, type Timers } from "./search-runs.ts";

function setup() {
  const control = { setAttribute() {}, removeAttribute() {} };
  const pending: { resolve: (value: string) => void; signal: AbortSignal }[] =
    [];
  const answers: string[] = [];
  const errors: unknown[] = [];
  const queued = new Map<number, () => void>();
  let next = 0;
  const timers: Timers = {
    setTimeout: (run) => {
      next += 1;
      queued.set(next, run);
      return next;
    },
    clearTimeout: (timer) => void queued.delete(timer as number),
  };
  const runs = createSearchRuns({
    wait: createWait({ control }),
    words: "Finding cooks",
    read: (signal) =>
      new Promise<string>((resolve) => pending.push({ resolve, signal })),
    onAnswer: (answer) => answers.push(answer),
    onError: (error) => errors.push(error),
    timers,
  });
  const fire = () => {
    const runs = [...queued.values()];
    queued.clear();
    for (const run of runs) run();
  };
  return { runs, pending, answers, errors, queued, fire };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a new search cancels the one before it, so only the newest answer shows", async () => {
  const { runs, pending, answers, errors } = setup();
  runs.now();
  runs.now();
  assert.equal(pending[0]?.signal.aborted, true);
  pending[0]?.resolve("old");
  pending[1]?.resolve("new");
  await settle();
  assert.deepEqual(answers, ["new"]);
  assert.deepEqual(errors, []);
});

test("typing searches once, a moment after the last letter", async () => {
  const { runs, pending, queued, fire } = setup();
  runs.soon();
  runs.soon();
  runs.soon();
  assert.equal(queued.size, 1);
  assert.equal(pending.length, 0);
  fire();
  assert.equal(pending.length, 1);
  pending[0]?.resolve("done");
  await settle();
});

test("Search now does not wait for the typing delay, and drops it", async () => {
  const { runs, pending, queued } = setup();
  runs.soon();
  runs.now();
  assert.equal(queued.size, 0);
  assert.equal(pending.length, 1);
  pending[0]?.resolve("done");
  await settle();
});

test("a failed search reaches the page", async () => {
  const control = { setAttribute() {}, removeAttribute() {} };
  const errors: unknown[] = [];
  const runs = createSearchRuns({
    wait: createWait({ control }),
    words: "Finding cooks",
    read: async () => {
      throw new Error("offline");
    },
    onAnswer: () => {},
    onError: (error) => errors.push(error),
  });
  runs.now();
  await settle();
  assert.equal(errors.length, 1);
});
