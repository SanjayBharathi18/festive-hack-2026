import assert from "node:assert/strict";
import { test } from "node:test";
import type { Api } from "../api/api.ts";
import type { Draft } from "./draft.ts";
import { createPublishFlow, type PublishStep } from "./publish-flow.ts";
import { readyDraft, storeId } from "./test-draft.ts";

type Call = { method: string; path: string; body: unknown };
type Reply = (call: Call) => unknown;

const otherId = "44444444-4444-4444-8444-444444444444";
const published = (id: string) => ({
  store: { id, slug: "shobhas-kitchen", name: "Shobha's Kitchen" },
  url: "http://localhost:8093/s/shobhas-kitchen",
  qr_svg: "/api/stores/shobhas-kitchen/qr.svg",
});
const state = (id: string) => ({
  store: {
    id,
    slug: "shobhas-kitchen",
    name: "Shobha's Kitchen",
    language: "kn",
    area: "Basavanagudi",
    city: "Bengaluru",
    offers_pickup: true,
    offers_delivery: false,
    has_address: false,
    has_location: false,
    cover_photo: null,
    slug_changed: false,
    published: false,
  },
  items: [],
});

function apiError(code: string, status: number) {
  return Object.assign(new Error(code), { code, status, name: "ApiError" });
}

function setup(
  replies: Record<string, Reply> = {},
  start: Partial<Draft> = {},
) {
  let draft = readyDraft({ step: "publish", furthest: "publish", ...start });
  const calls: Call[] = [];
  const steps: PublishStep[] = [];
  const answer = (call: Call): unknown => {
    const custom = replies[`${call.method} ${call.path}`];
    if (custom !== undefined) return custom(call);
    if (call.path === "/api/verify/start")
      return { prototype: true, code: "123456", expires_at: 1 };
    if (call.path === "/api/verify/check")
      return { purpose: "publish", store: null };
    if (call.path.endsWith("/publish")) return published(draft.store_id);
    if (call.path.endsWith("/cover")) return { cover_photo: null };
    return state(draft.store_id);
  };
  const api: Pick<Api, "send"> = {
    send: (async (
      method: string,
      path: string,
      body: unknown,
      schema: { parse(value: unknown): unknown },
    ) => {
      const call = { method, path, body };
      calls.push(call);
      return schema.parse(answer(call));
    }) as Api["send"],
  };
  const flow = createPublishFlow({
    api,
    waitFor: () => ({
      run: (work) => work(new AbortController().signal, () => {}),
    }),
    words: { phone: "Getting the code", publishing: "Publishing your store" },
    draft: () => draft,
    adopt: (id) => (draft = { ...draft, store_id: id }),
    onStep: (step) => steps.push(step),
  });
  return { flow, calls, steps, draft: () => draft };
}

test("the number gets a code, and the code publishes the store", async () => {
  const { flow, calls } = setup();
  await flow.sendPhone("98450 12345");
  assert.deepEqual(flow.step, {
    name: "code",
    phone: "+919845012345",
    code: "123456",
    error: undefined,
  });
  await flow.sendCode("123 456");
  assert.deepEqual(flow.step, {
    name: "done",
    published: {
      slug: "shobhas-kitchen",
      name: "Shobha's Kitchen",
      url: "http://localhost:8093/s/shobhas-kitchen",
    },
  });
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path}`),
    [
      "POST /api/verify/start",
      "POST /api/verify/check",
      `PUT /api/desk/stores/${storeId}`,
      `PUT /api/desk/stores/${storeId}/items`,
      `DELETE /api/desk/stores/${storeId}/cover`,
      `POST /api/desk/stores/${storeId}/publish`,
    ],
  );
  assert.deepEqual(calls[0]?.body, {
    phone: "+919845012345",
    purpose: "publish",
  });
  assert.deepEqual(calls.at(-1)?.body, {
    whatsapp_updates: true,
    food_safety: true,
  });
});

test("a photo goes up as a file", async () => {
  const { flow, calls } = setup(
    {},
    { photo: "data:image/jpeg;base64,/9j/4AAQ" },
  );
  await flow.sendPhone("9845012345");
  await flow.sendCode("123456");
  const cover = calls.find((call) => call.path.endsWith("/cover"));
  assert.equal(cover?.method, "PUT");
  assert.ok(cover?.body instanceof Blob);
});

test("a wrong number or code is caught before the network", async () => {
  const { flow, calls } = setup();
  await flow.sendPhone("12345");
  assert.equal(
    (flow.step as { error: { code: string } }).error.code,
    "phone_invalid",
  );
  await flow.sendPhone("9845012345");
  await flow.sendCode("12 34");
  assert.equal(flow.step.name, "code");
  assert.equal(
    (flow.step as { error: { code: string } }).error.code,
    "code_invalid",
  );
  assert.equal(calls.length, 1);
});

test("a wrong code stays on the code step with the server's reason", async () => {
  const { flow } = setup({
    "POST /api/verify/check": () => {
      throw apiError("code_wrong", 400);
    },
  });
  await flow.sendPhone("9845012345");
  await flow.sendCode("654321");
  assert.equal(flow.step.name, "code");
  assert.equal(
    (flow.step as { error: { code: string } }).error.code,
    "code_wrong",
  );
});

test("a failed upload is tried again without a new code", async () => {
  let fail = true;
  const { flow, calls } = setup({
    [`PUT /api/desk/stores/${storeId}/items`]: () => {
      if (fail) throw apiError("network", 0);
      return state(storeId);
    },
  });
  await flow.sendPhone("9845012345");
  await flow.sendCode("123456");
  assert.equal(flow.step.name, "retry");
  fail = false;
  await flow.retry();
  assert.equal(flow.step.name, "done");
  assert.equal(
    calls.filter((call) => call.path === "/api/verify/check").length,
    1,
  );
});

test("a link that another store took sends her back to the link", async () => {
  const { flow } = setup({
    [`PUT /api/desk/stores/${storeId}`]: () => {
      throw apiError("invalid_input", 409);
    },
  });
  await flow.sendPhone("9845012345");
  await flow.sendCode("123456");
  assert.deepEqual(flow.step, { name: "slug_taken" });
});

test("a number with a published store is sent to its desk", async () => {
  const { flow, calls } = setup({
    "POST /api/verify/check": () => ({
      purpose: "publish",
      store: {
        id: otherId,
        slug: "ghar-ki-mithai",
        name: "Ghar Ki Mithai",
        published: true,
      },
    }),
  });
  await flow.sendPhone("9845012345");
  await flow.sendCode("123456");
  assert.deepEqual(flow.step, {
    name: "has_store",
    store: { slug: "ghar-ki-mithai", name: "Ghar Ki Mithai" },
  });
  assert.equal(calls.length, 2);
  flow.changeNumber();
  assert.equal(flow.step.name, "phone");
});

test("her draft from an earlier try takes the server's store id", async () => {
  const { flow, calls, draft } = setup({
    "POST /api/verify/check": () => ({
      purpose: "publish",
      store: {
        id: otherId,
        slug: "shobhas-kitchen",
        name: "Shobha's Kitchen",
        published: false,
      },
    }),
  });
  await flow.sendPhone("9845012345");
  await flow.sendCode("123456");
  assert.equal(draft().store_id, otherId);
  assert.ok(
    calls.some((call) => call.path === `/api/desk/stores/${otherId}/publish`),
  );
  assert.equal(flow.step.name, "done");
});

test("an expired session asks for a new code", async () => {
  const { flow } = setup({
    [`PUT /api/desk/stores/${storeId}`]: () => {
      throw apiError("not_signed_in", 401);
    },
  });
  await flow.sendPhone("9845012345");
  await flow.sendCode("123456");
  assert.equal(flow.step.name, "phone");
});
