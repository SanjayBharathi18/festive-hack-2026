import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import type { DeskStore } from "../../shared/desk.ts";
import type { Api, WriteMethod } from "../api/api.ts";
import { createStock, sameChange } from "./stock.ts";

type Call = {
  method: WriteMethod;
  path: string;
  body: Record<string, boolean>;
  keepalive: boolean;
  answer(): void;
  fail(error: unknown): void;
};

const mysorePak = "0b6f3c3e-7d0a-4b8e-9a51-2f9c1d4e5a60";
const chakkuli = "5f51e217-1da8-4358-9d21-196f83ea559f";

function setup(desk: Partial<Pick<DeskStore, "closed_dates">> = {}) {
  const calls: Call[] = [];
  const latches: string[] = [];
  const api: Pick<Api, "send"> = {
    send: <S extends z.ZodType>(
      method: WriteMethod,
      path: string,
      body: unknown,
      schema: S,
      options?: { keepalive?: boolean | undefined },
    ) =>
      new Promise<z.output<S>>((resolve, reject) => {
        const sent = body as Record<string, boolean>;
        calls.push({
          method,
          path,
          body: sent,
          keepalive: options?.keepalive ?? false,
          answer() {
            const day = /closed-dates\/([\d-]+)$/.exec(path)?.[1];
            const item = /items\/([^/]+)\/sold-out$/.exec(path)?.[1];
            resolve(
              schema.parse({
                ...sent,
                ...(day === undefined ? {} : { day }),
                ...(item === undefined ? {} : { item_id: item }),
              }),
            );
          },
          fail: reject,
        });
      }),
  };
  const stock = createStock({
    api,
    desk: {
      store: { paused: false } as DeskStore["store"],
      menu: [
        { id: mysorePak, sold_out: false },
        { id: chakkuli, sold_out: true },
      ] as DeskStore["menu"],
      closed_dates: desk.closed_dates ?? ["2026-11-29"],
    },
    sounds: { avail: (change) => latches.push(change) },
  });
  let changes = 0;
  stock.subscribe(() => changes++);
  return { stock, calls, latches, changes: () => changes };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const offline = Object.assign(new Error("No network."), { code: "network" });

test("the stock starts from the desk store", () => {
  const { stock, calls } = setup();
  assert.equal(stock.paused(), false);
  assert.equal(stock.isSoldOut(mysorePak), false);
  assert.equal(stock.isSoldOut(chakkuli), true);
  assert.equal(stock.isClosed("2026-11-29"), true);
  assert.equal(stock.isClosed("2026-11-28"), false);
  assert.deepEqual(stock.closedDays(), ["2026-11-29"]);
  assert.equal(stock.failure(), undefined);
  assert.equal(calls.length, 0);
});

test("one touch sells an item out at once and sends it to the server", async () => {
  const { stock, calls, changes } = setup();
  stock.sellOut(mysorePak, true);
  assert.equal(stock.isSoldOut(mysorePak), true);
  assert.equal(changes(), 1);
  await settle();
  assert.equal(calls.length, 1);
  assert.deepEqual(
    { ...calls[0], answer: undefined, fail: undefined },
    {
      method: "PUT",
      path: `/api/desk/items/${mysorePak}/sold-out`,
      body: { sold_out: true },
      keepalive: true,
      answer: undefined,
      fail: undefined,
    },
  );
  calls[0]?.answer();
  await settle();
  assert.equal(stock.isSoldOut(mysorePak), true);
  assert.equal(changes(), 2);
});

test("touches go to the server in order, one at a time, and the last one wins", async () => {
  const { stock, calls } = setup();
  stock.sellOut(mysorePak, true);
  stock.sellOut(mysorePak, false);
  assert.equal(stock.isSoldOut(mysorePak), false);
  await settle();
  assert.equal(calls.length, 1);
  calls[0]?.answer();
  await settle();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1]?.body, { sold_out: false });
  assert.equal(stock.isSoldOut(mysorePak), false);
  calls[1]?.answer();
  await settle();
  assert.equal(stock.isSoldOut(mysorePak), false);
});

test("a failed touch goes back to what the server has, and says why", async () => {
  const { stock, calls } = setup();
  stock.pause(true);
  assert.equal(stock.paused(), true);
  await settle();
  calls[0]?.fail(offline);
  await settle();
  assert.equal(stock.paused(), false);
  const failure = stock.failure();
  assert.deepEqual(failure?.change, { kind: "paused" });
  assert.equal(failure?.error, offline);

  stock.pause(true);
  assert.equal(stock.failure(), undefined);
  await settle();
  calls[1]?.answer();
  await settle();
  assert.equal(stock.paused(), true);
});

test("a later touch that the server takes clears an earlier failure", async () => {
  const { stock, calls } = setup();
  stock.close("2026-11-28", true);
  stock.close("2026-11-28", false);
  stock.close("2026-11-28", true);
  await settle();
  calls[0]?.fail(offline);
  await settle();
  assert.equal(stock.failure()?.error, offline);
  assert.equal(stock.isClosed("2026-11-28"), true);
  calls[1]?.answer();
  await settle();
  calls[2]?.answer();
  await settle();
  assert.equal(stock.failure(), undefined);
  assert.equal(stock.isClosed("2026-11-28"), true);
  assert.deepEqual(stock.closedDays(), ["2026-11-28", "2026-11-29"]);
});

test("a failure of one item stays when another item changes", async () => {
  const { stock, calls } = setup();
  stock.sellOut(mysorePak, true);
  stock.sellOut(chakkuli, false);
  await settle();
  calls[0]?.fail(offline);
  calls[1]?.answer();
  await settle();
  assert.equal(stock.isSoldOut(mysorePak), false);
  assert.equal(stock.isSoldOut(chakkuli), false);
  assert.deepEqual(stock.failure()?.change, {
    kind: "sold_out",
    itemId: mysorePak,
  });
});

test("a closed day opens again with one more touch, and the list stays in order", async () => {
  const { stock, calls } = setup({ closed_dates: ["2026-12-01"] });
  stock.close("2026-11-25", true);
  assert.deepEqual(stock.closedDays(), ["2026-11-25", "2026-12-01"]);
  stock.close("2026-12-01", false);
  assert.deepEqual(stock.closedDays(), ["2026-11-25"]);
  await settle();
  assert.deepEqual(
    calls.map((call) => [call.path, call.body]),
    [
      ["/api/desk/closed-dates/2026-11-25", { closed: true }],
      ["/api/desk/closed-dates/2026-12-01", { closed: false }],
    ],
  );
});

test("a touch that changes nothing sends nothing", async () => {
  const { stock, calls, changes } = setup();
  stock.sellOut(chakkuli, true);
  stock.close("2026-11-29", true);
  stock.pause(false);
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(changes(), 0);
});

test("two changes are the same when they stop the same thing", () => {
  assert.equal(sameChange({ kind: "paused" }, { kind: "paused" }), true);
  assert.equal(
    sameChange(
      { kind: "closed", day: "2026-11-28" },
      { kind: "closed", day: "2026-11-29" },
    ),
    false,
  );
  assert.equal(
    sameChange(
      { kind: "sold_out", itemId: mysorePak },
      { kind: "sold_out", itemId: mysorePak },
    ),
    true,
  );
});

test("each touch plays the latch: close and open for an item or a day, pause and resume for the store", () => {
  const { stock, latches } = setup();
  stock.close("2026-11-29", true);
  assert.deepEqual(latches, [], "a touch that changes nothing is quiet");
  stock.sellOut(mysorePak, true);
  stock.sellOut(chakkuli, false);
  stock.close("2026-12-01", true);
  stock.pause(true);
  stock.pause(false);
  assert.deepEqual(latches, ["close", "open", "close", "pause", "resume"]);
});
