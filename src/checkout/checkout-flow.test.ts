import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckoutAnswer } from "../../shared/orders.ts";
import { createApi, isApiError } from "../api/api.ts";
import {
  createCheckoutFlow,
  proofMarginMs,
  type Kept,
  type OrderInput,
} from "./checkout-flow.ts";

const order: OrderInput = {
  store_id: "00000000-0000-4000-8000-0000000000aa",
  day: "2026-11-28",
  fulfilment: "pickup",
  buyer_name: "Arjun",
  buyer_language: "en",
  cart: [
    {
      pack_id: "00000000-0000-4000-8000-000000000001",
      quantity: 1,
      price: 88000,
    },
  ],
};

test("the code comes first, then the check and the order", async () => {
  const { flow, calls } = setup();
  assert.equal(flow.phase, "details");
  const code = await flow.sendCode("98765 43210");
  assert.equal(code.code, "123456");
  assert.equal(flow.phase, "code");
  const answer = await flow.place(order, {
    phone: "98765 43210",
    code: "123456",
  });
  assert.equal(answer.token, "token-1");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/verify/start", "/api/verify/check", "/api/orders"],
  );
  assert.deepEqual(calls[0]?.body, { phone: "98765 43210", purpose: "order" });
  assert.equal(
    (calls[2]?.body as { proof: string }).proof,
    "proof-".padEnd(40, "x"),
  );
});

test("a retry after a full day reuses the proof", async () => {
  const { flow, calls } = setup({ failOrders: ["day_full"] });
  await flow.sendCode("98765 43210");
  await assert.rejects(
    flow.place(order, { phone: "98765 43210", code: "123456" }),
    (error) => isApiError(error) && error.code === "day_full",
  );
  await flow.place(
    { ...order, day: "2026-11-29" },
    { phone: "98765 43210", code: "123456" },
  );
  assert.equal(
    calls.filter((call) => call.path === "/api/verify/check").length,
    1,
  );
  assert.equal(calls.filter((call) => call.path === "/api/orders").length, 2);
});

test("a proof near its end asks for a new code, because its code is used", async () => {
  let clock = 0;
  const { flow, calls } = setup({ failOrders: ["day_full"], now: () => clock });
  await flow.sendCode("98765 43210");
  await flow
    .place(order, { phone: "98765 43210", code: "123456" })
    .catch(() => {});
  clock = 15 * 60_000 - proofMarginMs;
  await assert.rejects(
    flow.place(order, { phone: "98765 43210", code: "123456" }),
    (error) => (error as { code?: string }).code === "proof_invalid",
  );
  assert.equal(flow.phase, "details");
  assert.equal(
    calls.filter((call) => call.path === "/api/verify/check").length,
    1,
  );
});

test("a proof the server refuses sends the buyer back for a new code", async () => {
  const { flow } = setup({ failOrders: ["proof_invalid"] });
  await flow.sendCode("98765 43210");
  await assert.rejects(
    flow.place(order, { phone: "98765 43210", code: "123456" }),
  );
  assert.equal(flow.phase, "details");
  assert.equal(flow.code, undefined);
});

test("a new number needs a new code; the same number in another form does not", async () => {
  const { flow } = setup();
  await flow.sendCode("98765 43210");
  assert.equal(flow.phoneChanged("+91 98765-43210"), false);
  assert.equal(flow.phase, "code");
  assert.equal(flow.phoneChanged("98765 43211"), true);
  assert.equal(flow.phase, "details");
  assert.equal(flow.phoneChanged("98765 43212"), false);
});

test("a wrong code keeps the code step, so the buyer can type it again", async () => {
  const { flow, calls } = setup({ wrongCodes: 1 });
  await flow.sendCode("98765 43210");
  await assert.rejects(
    flow.place(order, { phone: "98765 43210", code: "000000" }),
    (error) => isApiError(error) && error.code === "code_wrong",
  );
  assert.equal(flow.phase, "code");
  await flow.place(order, { phone: "98765 43210", code: "123456" });
  assert.equal(
    calls.filter((call) => call.path === "/api/verify/check").length,
    2,
  );
});

test("the tab keeps the sent code, then the proof, until the order is placed", async () => {
  const kept: unknown[] = [];
  const { flow } = setup({
    failOrders: ["day_full"],
    onKeep: (value) => kept.push(value),
  });
  await flow.sendCode("98765 43210");
  await flow
    .place(order, { phone: "98765 43210", code: "123456" })
    .catch(() => {});
  assert.equal(flow.phase, "verified");
  await flow.place(order, { phone: "98765 43210", code: "" });
  assert.deepEqual(kept, [
    {
      sent: {
        phone: "+919876543210",
        answer: { prototype: true, code: "123456", expires_at: 5 * 60_000 },
      },
    },
    {
      proof: {
        token: "proof-".padEnd(40, "x"),
        expiresAt: 15 * 60_000,
        phone: "+919876543210",
      },
    },
    undefined,
  ]);
});

test("a new page goes on from a kept proof, with no new code", async () => {
  const { flow, calls } = setup({
    kept: {
      proof: {
        token: "proof-".padEnd(40, "y"),
        expiresAt: 15 * 60_000,
        phone: "+919876543210",
      },
    },
  });
  assert.equal(flow.phase, "verified");
  assert.equal(flow.phoneChanged("98765 43210"), false);
  await flow.place(order, { phone: "98765 43210", code: "" });
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/orders"],
  );
  assert.equal(
    (calls[0]?.body as { proof: string }).proof,
    "proof-".padEnd(40, "y"),
  );
});

test("a new page shows a kept code while it is valid, and forgets an expired one", () => {
  const sent = {
    phone: "+919876543210",
    answer: { prototype: true as const, code: "123456", expires_at: 60_000 },
  };
  const fresh = setup({ kept: { sent } }).flow;
  assert.equal(fresh.phase, "code");
  assert.equal(fresh.code?.code, "123456");
  const late = setup({ kept: { sent }, now: () => 60_000 }).flow;
  assert.equal(late.phase, "details");
  assert.equal(late.code, undefined);
});

test("a kept proof that runs out, or a new number, asks for a new code", async () => {
  let clock = 0;
  const proof = {
    token: "proof-".padEnd(40, "z"),
    expiresAt: 15 * 60_000,
    phone: "+919876543210",
  };
  const { flow, calls } = setup({ kept: { proof }, now: () => clock });
  clock = 15 * 60_000;
  await assert.rejects(
    flow.place(order, { phone: "98765 43210", code: "" }),
    (error) => (error as { code?: string }).code === "proof_invalid",
  );
  assert.equal(flow.phase, "details");
  assert.equal(calls.length, 0);
  const other = setup({ kept: { proof } }).flow;
  assert.equal(other.phoneChanged("98765 43211"), true);
  assert.equal(other.phase, "details");
});

function setup({
  failOrders = [],
  wrongCodes = 0,
  now = () => 0,
  kept,
  onKeep,
}: {
  failOrders?: string[];
  wrongCodes?: number;
  now?: () => number;
  kept?: Kept;
  onKeep?: (kept: Kept | undefined) => void;
} = {}) {
  const calls: { path: string; body: unknown }[] = [];
  const failures = [...failOrders];
  let wrong = wrongCodes;
  const api = createApi({
    fetch: async (path, init) => {
      const body: unknown = JSON.parse(String(init.body));
      calls.push({ path, body });
      if (path === "/api/verify/start") {
        return Response.json(
          { prototype: true, code: "123456", expires_at: 5 * 60_000 },
          { status: 201 },
        );
      }
      if (path === "/api/verify/check") {
        if (wrong > 0) {
          wrong -= 1;
          return Response.json(
            { error: { code: "code_wrong", message: "x" } },
            { status: 400 },
          );
        }
        return Response.json({
          purpose: "order",
          proof: "proof-".padEnd(40, "x"),
          expires_at: 15 * 60_000,
        });
      }
      const failure = failures.shift();
      if (failure !== undefined) {
        return Response.json(
          { error: { code: failure, message: "x" } },
          { status: 409 },
        );
      }
      return Response.json(answer(), { status: 201 });
    },
  });
  return { flow: createCheckoutFlow({ api, now, kept, onKeep }), calls };
}

function answer(): CheckoutAnswer {
  return {
    token: "token-1",
    order: {
      number: 13,
      status: "new",
      paid: false,
      payment_required: false,
      day: "2026-11-28",
      fulfilment: "pickup",
      total: 88000,
      lines: [],
      buyer_name: "Arjun",
      address: null,
      gift: null,
      note: null,
      cancel_reason: null,
      created_at: 0,
      store: {
        slug: "shobhas-kitchen",
        name: "Shobha's Kitchen",
        area: "Basavanagudi",
        is_demo: true,
        message_url: "https://wa.me/910000000001",
        pickup: {
          address: "No. 1, Demo Lane",
          map_url: "https://www.google.com/maps?q=12.94,77.57",
        },
      },
      messages: [],
      payment: { online: true, refunded: false, pay_by: null },
    },
  };
}
