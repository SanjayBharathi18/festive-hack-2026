import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { DaysResponse } from "../../shared/store.ts";
import { createApi } from "../api/api.ts";
import { checkDelayMs, createDayCheck } from "./day-check.ts";

const storeId = "00000000-0000-4000-8000-0000000000aa";
const packId = "00000000-0000-4000-8000-000000000001";

test("a burst of cart changes sends one request with the newest cart", async (t) => {
  const { server, seen, check } = setup(t);
  check.check([{ pack_id: packId, quantity: 1 }]);
  check.check([{ pack_id: packId, quantity: 2 }]);
  check.check([{ pack_id: packId, quantity: 3 }]);
  t.mock.timers.tick(checkDelayMs);
  await server.answered(1);
  await settle();
  assert.equal(server.bodies.length, 1);
  assert.deepEqual(server.bodies[0], {
    store_id: storeId,
    cart: [{ pack_id: packId, quantity: 3 }],
  });
  assert.equal(seen.days.length, 1);
});

test("only the answer for the newest cart reaches the page", async (t) => {
  const { server, seen, check } = setup(t, { slowFirst: true });
  check.check([], { delayMs: 0 });
  t.mock.timers.tick(0);
  check.check([{ pack_id: packId, quantity: 1 }], { delayMs: 0 });
  t.mock.timers.tick(0);
  await server.answered(2);
  server.releaseFirst();
  await settle();
  assert.deepEqual(
    seen.days.map((days) => days.cart_load),
    [1000],
  );
  assert.deepEqual(seen.errors, []);
});

test("a failure reaches the page; a cancelled check does not", async (t) => {
  const { server, seen, check } = setup(t, { fail: true });
  check.check([], { delayMs: 0 });
  t.mock.timers.tick(0);
  await server.answered(1);
  await settle();
  assert.equal(seen.errors.length, 1);
  check.check([], { delayMs: 10 });
  check.cancel();
  t.mock.timers.tick(10);
  assert.equal(server.bodies.length, 1);
});

async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function setup(
  t: TestContext,
  {
    slowFirst = false,
    fail = false,
  }: { slowFirst?: boolean; fail?: boolean } = {},
) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const seen = { days: [] as DaysResponse[], errors: [] as unknown[] };
  const bodies: unknown[] = [];
  const waiters: (() => void)[] = [];
  let releaseFirst = () => {};
  const server = {
    bodies,
    releaseFirst: () => releaseFirst(),
    answered: (count: number) =>
      new Promise<void>((resolve) => {
        const ready = () => {
          if (bodies.length >= count) resolve();
          else waiters.push(ready);
        };
        ready();
      }),
  };
  const api = createApi({
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init.body)) as {
        cart: { quantity: number }[];
      };
      bodies.push(body);
      for (const waiter of waiters.splice(0)) waiter();
      if (fail)
        return Response.json(
          { error: { code: "internal_error", message: "x" } },
          { status: 500 },
        );
      if (slowFirst && bodies.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      const load = body.cart.reduce(
        (sum, line) => sum + line.quantity * 1000,
        0,
      );
      return Response.json(daysAnswer(load));
    },
  });
  const check = createDayCheck({
    api,
    storeId,
    onDays: (days) => seen.days.push(days),
    onError: (error) => seen.errors.push(error),
  });
  return { server, seen, check };
}

function daysAnswer(load: number): DaysResponse {
  return {
    today: "2026-11-24",
    limit_unit: "kg",
    cart_load: load,
    days: [{ day: "2026-11-24", fits: true, reason: null, space_left: 25000 }],
    next_free_day: "2026-11-24",
  };
}
