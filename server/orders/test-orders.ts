import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deskOrderAnswerSchema, type OrderLine } from "../../shared/orders.ts";
import { parseConfig } from "../config.ts";
import type { FlagValues } from "../flags/decisions.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { createTestApp, createTestClock } from "../test-app.ts";
import { seedStore, type StoreOptions, type TestStore } from "../test-store.ts";
import { demoTokenHeader } from "../verify/desk-auth.ts";
import { orderProof, postJson } from "../verify/test-sign-in.ts";
import { newToken, type NewOrder } from "./order-data.ts";

export const demoToken = "demo-token-for-the-tests-0123456789";
export const publicUrl = "https://34-12-56-78.sslip.io";
export const today = "2026-11-24";
export const saturday = "2026-11-28";
export const sunday = "2026-11-29";

type Body = Record<string, unknown>;

export function orderApp(
  storeOptions: StoreOptions = {},
  {
    env = {},
    flagValues = {},
    stopping = new AbortController().signal,
  }: {
    env?: Record<string, string>;
    flagValues?: Partial<FlagValues>;
    stopping?: AbortSignal;
  } = {},
) {
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    DEMO_DESK_TOKEN: demoToken,
    PUBLIC_URL: publicUrl,
    ...env,
  });
  assert.ok(parsed.ok);
  const clock = createTestClock();
  const flags = createDefaultFlags(flagValues);
  const test = createTestApp({
    clock,
    flags,
    config: parsed.config,
    stopping,
  });
  const store = seedStore(test.deps.db, { isDemo: true, ...storeOptions });
  let buyers = 0;

  const checkout = async (overrides: Body = {}, key: string = randomUUID()) => {
    buyers += 1;
    const phone = `+9198765${String(buyers).padStart(5, "0")}`;
    const proof = await orderProof(test.app, phone, {
      "X-Forwarded-For": `198.51.100.${buyers}`,
    });
    const response = await postJson(
      test.app,
      "/api/orders",
      { ...checkoutBody(store, proof), ...overrides },
      { "Idempotency-Key": key },
    );
    return { response, phone, proof, key };
  };
  const desk = (path: string, init: RequestInit = {}) =>
    test.app.request(path, {
      ...init,
      headers: {
        [demoTokenHeader]: demoToken,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  const deskPost = (body: Body, key: string = randomUUID()) =>
    desk("/api/desk/orders", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": key },
    });
  const deskPatch = (id: string, body: Body) =>
    desk(`/api/desk/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  const fillDay = async (day: string, kilos: number) => {
    const response = await deskPost(
      deskBody(store, {
        day,
        cart: [{ pack_id: store.items.mysorePak.packs[2].id, quantity: kilos }],
      }),
    );
    assert.equal(response.status, 201, await response.clone().text());
    return deskOrderAnswerSchema.parse(await response.json()).order;
  };
  return {
    ...test,
    clock,
    flags,
    store,
    checkout,
    desk,
    deskPost,
    deskPatch,
    fillDay,
  };
}

export function checkoutBody(store: TestStore, proof: string): Body {
  return {
    store_id: store.storeId,
    proof,
    day: saturday,
    fulfilment: "pickup",
    buyer_name: "Priya",
    buyer_language: "kn",
    cart: [
      {
        pack_id: store.items.mysorePak.packs[2].id,
        quantity: 1,
        price: 88000,
      },
    ],
  };
}

export function deskBody(store: TestStore, overrides: Body = {}): Body {
  return {
    day: saturday,
    fulfilment: "pickup",
    buyer_name: "Suresh",
    cart: [{ pack_id: store.items.chakkuli.packs[2].id, quantity: 1 }],
    ...overrides,
  };
}

export function newOrder(
  store: TestStore,
  overrides: Partial<NewOrder> = {},
): NewOrder {
  return {
    id: randomUUID(),
    storeId: store.storeId,
    token: newToken(),
    source: "link",
    status: "new",
    fulfilment: "pickup",
    day: saturday,
    address: null,
    note: null,
    giftName: null,
    giftPhone: null,
    giftMessage: null,
    buyerName: "Priya",
    buyerPhone: "+919876543210",
    buyerLanguage: "kn",
    total: 88000,
    paymentRequired: false,
    transcript: null,
    readingLanguage: null,
    readingVariant: null,
    edited: false,
    createdAt: 0,
    ...overrides,
  };
}

export function kiloLine(store: TestStore, quantity = 1): OrderLine {
  const item = store.items.mysorePak;
  const pack = item.packs[2];
  return {
    item_id: item.id,
    pack_id: pack.id,
    name: item.name,
    label: pack.label,
    quantity,
    price: pack.price,
    grams: pack.grams,
    pieces: null,
  };
}
