import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createLinkCheck, type LinkState } from "./link-check.ts";
import { storeId } from "./test-draft.ts";

function setup(
  answer: (path: string, signal: AbortSignal) => Promise<unknown>,
) {
  const paths: string[] = [];
  const states: LinkState[] = [];
  const check = createLinkCheck({
    api: {
      get: (async (
        path: string,
        schema: { parse(value: unknown): unknown },
        options?: { signal?: AbortSignal },
      ) => {
        paths.push(path);
        return schema.parse(
          await answer(path, options?.signal ?? new AbortController().signal),
        );
      }) as never,
    },
    storeId: () => storeId,
    onState: (state) => states.push(state),
    delayMs: 400,
  });
  return { check, paths, states };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("a link is checked once after a pause, with her own store id", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { check, paths, states } = setup(async () => ({
    slug: "shobhas-kitchen",
    available: true,
    suggestion: null,
  }));
  check.check("shobhas-k");
  check.check("shobhas-kitchen");
  assert.deepEqual(states.at(-1), {
    kind: "checking",
    slug: "shobhas-kitchen",
  });
  t.mock.timers.tick(400);
  await flush();
  assert.deepEqual(paths, [`/api/sell/slugs/shobhas-kitchen?store=${storeId}`]);
  assert.deepEqual(check.state, { kind: "free", slug: "shobhas-kitchen" });
  check.check("shobhas-kitchen");
  assert.equal(paths.length, 1);
});

test("a taken link gives the suggestion, and a bad or empty link asks nothing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { check, paths } = setup(async () => ({
    slug: "shobhas-kitchen",
    available: false,
    suggestion: "shobhas-kitchen-2",
  }));
  check.check("");
  assert.deepEqual(check.state, { kind: "empty" });
  check.check("Shobhas Kitchen");
  assert.deepEqual(check.state, { kind: "invalid", slug: "Shobhas Kitchen" });
  check.check("shobhas-kitchen");
  t.mock.timers.tick(400);
  await flush();
  assert.deepEqual(check.state, {
    kind: "taken",
    slug: "shobhas-kitchen",
    suggestion: "shobhas-kitchen-2",
  });
  assert.equal(paths.length, 1);
});

test("a failed check does not stop her, and a newer check wins", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { check, states } = setup(async (path, signal) => {
    if (path.includes("slow")) {
      await new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        ),
      );
    }
    throw Object.assign(new Error("network"), { code: "network" });
  });
  check.check("slow-link");
  t.mock.timers.tick(400);
  check.check("fast-link");
  t.mock.timers.tick(400);
  await flush();
  assert.deepEqual(check.state, { kind: "unknown", slug: "fast-link" });
  assert.equal(
    states.some(
      (state) => state.kind === "unknown" && state.slug === "slow-link",
    ),
    false,
  );
  check.stop();
});

test("a fresh check asks again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let available = true;
  const { check, paths } = setup(async () => ({
    slug: "shobhas-kitchen",
    available,
    suggestion: available ? null : "shobhas-kitchen-2",
  }));
  check.check("shobhas-kitchen");
  t.mock.timers.tick(400);
  await flush();
  available = false;
  check.check("shobhas-kitchen", true);
  t.mock.timers.tick(400);
  await flush();
  assert.equal(paths.length, 2);
  assert.equal(check.state.kind, "taken");
});
