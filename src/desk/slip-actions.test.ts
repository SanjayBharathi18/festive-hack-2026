import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { z } from "zod";
import type {
  DeskOrderAnswer,
  DeskOrderPatch,
  DeskSlip,
} from "../../shared/orders.ts";
import { createApi } from "../api/api.ts";
import { createBoard } from "./board.ts";
import { createSlipActions, holdMs, undoMs } from "./slip-actions.ts";
import { nextStamp } from "./stamps.ts";
import { fakeSlip } from "./test-slips.ts";

type Call = {
  id: string;
  patch: DeskOrderPatch;
  keepalive: boolean;
  answer(slip?: Partial<DeskSlip>): void;
  fail(error: unknown): void;
};

function setup(t: TestContext, first: Partial<DeskSlip> = {}) {
  const played: string[] = [];
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const board = createBoard({ unit: "kg", limit: 25_000 });
  const slip = fakeSlip({ number: 7, ...first });
  board.load({
    today: "2026-11-24",
    limit_unit: "kg",
    daily_limit: 25_000,
    days: [{ day: slip.day, load: 1000, space_left: 24_000, slips: [slip] }],
  });
  const calls: Call[] = [];
  const refunds: Omit<Call, "patch">[] = [];
  let stale = 0;
  const server = { ...slip };
  const actions = createSlipActions({
    slips: board,
    onStale: () => stale++,
    sounds: {
      tick: () => played.push("tick"),
      stamp: (status) => played.push(`stamp:${status}`),
      undo: () => played.push("undo"),
      cancel: () => played.push("cancel"),
      commit: () => played.push("commit"),
      settle: () => played.push("settle"),
      error: () => played.push("error"),
      arrival: () => played.push("arrival"),
    },
    sendRefund: (id, options) =>
      new Promise<DeskOrderAnswer>((resolve, reject) => {
        refunds.push({
          id,
          keepalive: options?.keepalive ?? false,
          answer(changes = {}) {
            Object.assign(server, { paid: false }, changes);
            resolve({ order: { ...server }, warning: null });
          },
          fail: reject,
        });
      }),
    send: (id, patch, options) =>
      new Promise<DeskOrderAnswer>((resolve, reject) => {
        calls.push({
          id,
          patch,
          keepalive: options?.keepalive ?? false,
          answer(changes = {}) {
            Object.assign(server, applied(server, patch), changes);
            resolve({ order: { ...server }, warning: null });
          },
          fail: reject,
        });
      }),
  });
  return {
    board,
    actions,
    calls,
    refunds,
    played,
    id: slip.id,
    stale: () => stale,
  };
}

function applied(slip: DeskSlip, patch: DeskOrderPatch): Partial<DeskSlip> {
  switch (patch.action) {
    case "stamp":
      return {
        status: patch.status,
        next_stamp: nextStamp(patch.status, slip.fulfilment),
      };
    case "paid":
      return { paid: patch.paid };
    case "cancel":
      return { status: "cancelled", cancel_reason: patch.reason };
    case "edit":
      return { day: patch.day };
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("one touch stamps the next status at once, then tells the server", async (t) => {
  const { board, actions, calls, id } = setup(t);
  actions.stamp(id);
  assert.equal(board.get(id)?.status, "making");
  assert.equal(board.get(id)?.next_stamp, "ready");
  assert.equal(actions.takeLanding(id), "status");
  assert.equal(actions.takeLanding(id), undefined);
  await settle();
  assert.deepEqual(calls[0]?.patch, { action: "stamp", status: "making" });
  calls[0]?.answer();
  await settle();
  assert.equal(board.get(id)?.status, "making");
});

test("one tap is one step: a tap while the stamp is on its way does nothing", async (t) => {
  const { board, actions, calls, played, id } = setup(t);
  actions.stamp(id);
  actions.stamp(id);
  assert.equal(board.get(id)?.status, "making");
  assert.deepEqual(played, ["stamp:making"]);
  await settle();
  assert.equal(calls.length, 1);
  calls[0]?.answer();
  await settle();
  actions.stamp(id);
  assert.equal(board.get(id)?.status, "ready");
  await settle();
  assert.deepEqual(calls[1]?.patch, { action: "stamp", status: "ready" });
  calls[1]?.answer();
  await settle();
  assert.equal(board.get(id)?.status, "ready");
});

test("a tap while the undo of a stamp is on its way does nothing", async (t) => {
  const { board, actions, calls, id } = setup(t);
  actions.stamp(id);
  await settle();
  calls[0]?.answer();
  await settle();
  actions.undo(id);
  actions.stamp(id);
  assert.equal(board.get(id)?.status, "new");
  await settle();
  calls[1]?.answer();
  await settle();
  assert.equal(calls.length, 2);
});

test("undo is one step back, for 10 s", async (t) => {
  const { board, actions, calls, id } = setup(t);
  actions.stamp(id);
  assert.equal(actions.ui(id).undoSeconds, 10);
  t.mock.timers.tick(4000);
  assert.equal(actions.ui(id).undoSeconds, 6);
  actions.undo(id);
  assert.equal(board.get(id)?.status, "new");
  assert.equal(actions.ui(id).undoSeconds, undefined);
  await settle();
  calls[0]?.answer();
  await settle();
  assert.deepEqual(calls[1]?.patch, { action: "stamp", status: "new" });
  calls[1]?.answer();
  await settle();
  assert.equal(board.get(id)?.status, "new");
});

test("the undo goes after 10 s", (t) => {
  const { actions, id } = setup(t);
  actions.stamp(id);
  t.mock.timers.tick(undoMs);
  assert.equal(actions.ui(id).undoSeconds, undefined);
  actions.undo(id);
  assert.equal(actions.ui(id).undoSeconds, undefined);
});

test("PAID by hand tilts, and its undo takes it back", async (t) => {
  const { board, actions, calls, id } = setup(t);
  actions.markPaid(id);
  assert.equal(board.get(id)?.paid, true);
  assert.equal(actions.ui(id).handPaid, true);
  assert.equal(actions.takeLanding(id), "paid");
  actions.undo(id);
  assert.equal(board.get(id)?.paid, false);
  assert.equal(actions.ui(id).handPaid, false);
  await settle();
  calls[0]?.answer();
  await settle();
  assert.deepEqual(calls[1]?.patch, { action: "paid", paid: false });
});

test("a cancel waits 10 s before it is sent, and undo keeps the order", (t) => {
  const { board, actions, calls, id } = setup(t);
  actions.cancel(id, "item_ran_out");
  assert.deepEqual(actions.ui(id).cancelling, {
    reason: "item_ran_out",
    seconds: 10,
  });
  assert.equal(board.get(id)?.status, "new");
  t.mock.timers.tick(holdMs - 1000);
  assert.equal(calls.length, 0);
  actions.keep(id);
  t.mock.timers.tick(5000);
  assert.equal(calls.length, 0);
  assert.equal(actions.ui(id).cancelling, undefined);
  assert.equal(board.get(id)?.status, "new");
});

test("after 10 s the cancel goes, and the space goes back to the day", async (t) => {
  const { board, actions, calls, id } = setup(t);
  actions.cancel(id, "day_full");
  t.mock.timers.tick(holdMs);
  assert.equal(board.get(id)?.status, "cancelled");
  assert.equal(board.dayOf(board.get(id)?.day ?? "")?.load, 0);
  await settle();
  assert.deepEqual(calls[0]?.patch, { action: "cancel", reason: "day_full" });
  assert.equal(calls[0]?.keepalive, false);
});

test("a page that goes away sends the held cancel with keepalive", (t) => {
  const { board, actions, calls, id } = setup(t);
  actions.cancel(id, "other");
  actions.flush();
  assert.equal(calls[0]?.keepalive, true);
  assert.deepEqual(calls[0]?.patch, { action: "cancel", reason: "other" });
  assert.equal(board.get(id)?.status, "cancelled");
  actions.flush();
  assert.equal(calls.length, 1);
});

test("a failed stamp puts back what the server knows, and says why", async (t) => {
  const { board, actions, calls, id } = setup(t);
  actions.stamp(id);
  actions.stamp(id);
  await settle();
  calls[0]?.fail(Object.assign(new Error("offline"), { code: "network" }));
  await settle();
  await settle();
  assert.equal(board.get(id)?.status, "new");
  assert.equal(calls.length, 1, "the later stamp is not sent");
  assert.equal(actions.ui(id).undoSeconds, undefined);
  assert.ok(actions.ui(id).error);
  actions.stamp(id);
  assert.equal(actions.ui(id).error, undefined);
  await settle();
  assert.equal(calls.length, 2);
});

test("a stale slip asks the page to load the board again", async (t) => {
  for (const [code, status, shown] of [
    ["stamp_not_allowed", 409, "stamp_not_allowed"],
    ["not_found", 404, "order_gone"],
  ] as const) {
    await t.test(code, async (t) => {
      const { actions, calls, id, stale } = setup(t);
      actions.stamp(id);
      await settle();
      const api = createApi({
        fetch: async () =>
          Response.json({ error: { code, message: "No." } }, { status }),
      });
      const error = await api
        .send("PATCH", "/x", {}, z.unknown())
        .catch((e) => e);
      calls[0]?.fail(error);
      await settle();
      await settle();
      assert.equal(stale(), 1);
      assert.equal((actions.ui(id).error as { code: string }).code, shown);
    });
  }
});

test("live news of a slip waits while her change is on its way", async (t) => {
  const { board, actions, calls, id } = setup(t);
  actions.stamp(id);
  const before = board.get(id);
  assert.ok(before);
  actions.accept({ ...before, status: "new", next_stamp: "making" });
  assert.equal(board.get(id)?.status, "making");
  await settle();
  calls[0]?.answer();
  await settle();
  actions.accept({ ...before, status: "making", buyer_name: "Lakshmi R." });
  assert.equal(board.get(id)?.buyer_name, "Lakshmi R.");
});

test("an edit waits for the server and gives back its warning", async (t) => {
  const { board, actions, calls, id } = setup(t);
  const edited = actions.edit(id, {
    action: "edit",
    day: "2026-11-29",
    fulfilment: "pickup",
    cart: [{ pack_id: "5f51e217-1da8-8358-9d21-196f83ea559f", quantity: 1 }],
  });
  await settle();
  calls[0]?.answer();
  const answer = await edited;
  assert.equal(answer.order.day, "2026-11-29");
  assert.equal(board.get(id)?.day, "2026-11-29");
});

test("a finished order takes no cancel", (t) => {
  const { actions, id } = setup(t, { status: "delivered", next_stamp: null });
  actions.cancel(id, "other");
  assert.equal(actions.ui(id).cancelling, undefined);
  actions.stamp(id);
  assert.equal(actions.takeLanding(id), undefined);
});

test("a refund waits 10 s with undo, then returns the full amount", async (t) => {
  const { board, actions, refunds, id } = setup(t, { paid: true });
  actions.refund(id, true);
  assert.deepEqual(actions.ui(id).refunding, { seconds: 10 });
  assert.equal(board.get(id)?.paid, true);
  t.mock.timers.tick(holdMs - 1000);
  assert.equal(refunds.length, 0);
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0]?.keepalive, false);
  assert.equal(board.get(id)?.paid, false);
  assert.equal(actions.ui(id).refunding, undefined);
  assert.deepEqual(actions.ui(id).refunded, { online: true, amount: 88_000 });
  refunds[0]?.answer();
  await settle();
  assert.equal(board.get(id)?.paid, false);
  assert.deepEqual(actions.ui(id).refunded, { online: true, amount: 88_000 });
});

test("undo keeps the payment before the refund goes", (t) => {
  const { board, actions, refunds, id } = setup(t, { paid: true });
  actions.refund(id, false);
  t.mock.timers.tick(4000);
  actions.keep(id);
  assert.equal(actions.ui(id).refunding, undefined);
  t.mock.timers.tick(holdMs);
  assert.equal(refunds.length, 0);
  assert.equal(board.get(id)?.paid, true);
  assert.equal(actions.ui(id).refunded, undefined);
});

test("a failed refund brings the payment back and says why", async (t) => {
  const { board, actions, refunds, id } = setup(t, { paid: true });
  actions.refund(id, false);
  t.mock.timers.tick(holdMs);
  await settle();
  assert.deepEqual(actions.ui(id).refunded, { online: false, amount: 88_000 });
  const offline = Object.assign(new Error("No network."), { code: "network" });
  refunds[0]?.fail(offline);
  await settle();
  await settle();
  assert.equal(board.get(id)?.paid, true);
  assert.equal(actions.ui(id).refunded, undefined);
  assert.equal(actions.ui(id).error, offline);
});

test("a page that goes away sends the held refund with keepalive", (t) => {
  const { board, actions, refunds, id } = setup(t, { paid: true });
  actions.refund(id, true);
  actions.flush();
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0]?.keepalive, true);
  assert.equal(board.get(id)?.paid, false);
});

test("only a paid order can be refunded, and PAID by hand again ends the refund", async (t) => {
  const { actions, refunds, calls, id } = setup(t);
  actions.refund(id, true);
  assert.equal(actions.ui(id).refunding, undefined);
  actions.markPaid(id);
  await settle();
  calls[0]?.answer();
  await settle();
  actions.refund(id, false);
  t.mock.timers.tick(holdMs);
  await settle();
  refunds[0]?.answer();
  await settle();
  assert.deepEqual(actions.ui(id).refunded, { online: false, amount: 88_000 });
  actions.markPaid(id);
  assert.equal(actions.ui(id).refunded, undefined);
});

test("a stamp, PAID by hand, undo and a cancel each play their sound at the tap", async (t) => {
  const { actions, calls, played, id } = setup(t);
  actions.stamp(id);
  actions.undo(id);
  actions.markPaid(id);
  actions.cancel(id, "other");
  actions.keep(id);
  assert.deepEqual(played, [
    "stamp:making",
    "undo",
    "stamp:paid",
    "cancel",
    "undo",
  ]);
  for (const call of calls) call.answer();
  await settle();
});

test("a refund ticks at the tap and plays commit on the server's reply", async (t) => {
  const { actions, refunds, played, id } = setup(t, { paid: true });
  actions.refund(id, true);
  assert.deepEqual(played, ["tick"]);
  t.mock.timers.tick(holdMs);
  await settle();
  assert.deepEqual(played, ["tick"]);
  refunds[0]?.answer();
  await settle();
  assert.deepEqual(played, ["tick", "commit"]);
});

test("a failed stamp plays the error", async (t) => {
  const { actions, calls, played, id } = setup(t);
  actions.stamp(id);
  await settle();
  calls[0]?.fail(Object.assign(new Error("offline"), { code: "network" }));
  await settle();
  await settle();
  assert.deepEqual(played, ["stamp:making", "error"]);
});

test("a new buyer order rings, an online payment settles, and her own desk order is quiet", (t) => {
  const { board, actions, played, id } = setup(t);
  actions.accept(fakeSlip({ number: 8 }));
  actions.accept(fakeSlip({ number: 9, source: "desk" }));
  actions.accept({ ...board.get(id)!, paid: true });
  assert.deepEqual(played, ["arrival", "settle"]);
});

test("after a reload, a refunded online payment still shows as refunded", (t) => {
  const { actions, id } = setup(t, { paid: false, refunded: true });
  assert.deepEqual(actions.ui(id).refunded, { online: true, amount: 88_000 });
});

test("after a reload, a cash refund shows its amount, with no online payment", (t) => {
  const { actions, id } = setup(t, {
    paid: false,
    status: "cancelled",
    refund: { amount: 50_000, online: false },
  });
  assert.deepEqual(actions.ui(id).refunded, { online: false, amount: 50_000 });
});

test("a saved change offers Undo for 10 s, which saves the old values back", async (t) => {
  const { board, actions, calls, played, id } = setup(t);
  const before = board.get(id);
  assert.ok(before);
  const edited = actions.edit(id, {
    action: "edit",
    day: "2026-11-29",
    fulfilment: "pickup",
    cart: [{ pack_id: "5f51e217-1da8-8358-9d21-196f83ea559f", quantity: 2 }],
  });
  await settle();
  calls[0]?.answer();
  await edited;
  assert.equal(board.get(id)?.day, "2026-11-29");
  assert.equal(actions.ui(id).undoSeconds, 10);
  actions.undo(id);
  assert.deepEqual(played, ["undo"]);
  assert.equal(board.get(id)?.day, before.day);
  assert.equal(board.get(id)?.fulfilment, before.fulfilment);
  await settle();
  assert.deepEqual(calls[1]?.patch, {
    action: "edit",
    day: before.day,
    fulfilment: before.fulfilment,
    address: before.address,
    note: before.note,
    buyer_name: before.buyer_name,
    buyer_phone: before.buyer_phone,
    cart: [{ pack_id: "5f51e217-1da8-8358-9d21-196f83ea559f", quantity: 1 }],
  });
  calls[1]?.answer();
  await settle();
  assert.equal(actions.ui(id).undoSeconds, undefined);
});

test("the Undo of a change goes after 10 s", async (t) => {
  const { actions, calls, id } = setup(t);
  const edited = actions.edit(id, {
    action: "edit",
    day: "2026-11-29",
    fulfilment: "pickup",
    cart: [{ pack_id: "5f51e217-1da8-8358-9d21-196f83ea559f", quantity: 1 }],
  });
  await settle();
  calls[0]?.answer();
  await edited;
  t.mock.timers.tick(undoMs);
  assert.equal(actions.ui(id).undoSeconds, undefined);
  actions.undo(id);
  assert.equal(calls.length, 1);
});

test("an unpaid order with no refund shows no refund", (t) => {
  const { actions, id } = setup(t, { paid: false, refunded: false });
  assert.equal(actions.ui(id).refunded, undefined);
});
