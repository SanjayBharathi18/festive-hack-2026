import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuoteAnswer, QuoteBody } from "../../shared/quotes.ts";
import { createApi, isApiError, type Api } from "../api/api.ts";
import { createContactFlow, proofMarginMs } from "./contact-flow.ts";

type Call = { path: string; body: Record<string, unknown> };

const answer: QuoteAnswer = {
  id: "0b8c1f4e-1a2b-4c3d-8e9f-0123456789ab",
  store: { slug: "daawat-caterers", name: "Daawat Caterers" },
  seller_phone: "+910000000008",
  request: {
    kind: "bulk",
    lines: [
      {
        item_id: "0b8c1f4e-1a2b-4c3d-8e9f-0123456789ac",
        name: "Kaju katli",
        quantity: 500,
        unit: "pieces",
        price: 1500,
      },
    ],
    estimate: 750_000,
    need_by: null,
    place: null,
    note: null,
  },
  created_at: 1,
};

const request: Omit<QuoteBody, "proof"> = {
  buyer_name: "Meera",
  language: "en",
  request: {
    kind: "bulk",
    store_id: "0b8c1f4e-1a2b-4c3d-8e9f-0123456789ad",
    lines: [{ item_id: "0b8c1f4e-1a2b-4c3d-8e9f-0123456789ac", quantity: 500 }],
    need_by: null,
    place: null,
  },
};

function fakeApi(fail: Partial<Record<string, Error>> = {}) {
  const calls: Call[] = [];
  let expiresAt = 1_000_000;
  const api: Pick<Api, "send"> = {
    async send(_method, path, body, schema) {
      calls.push({ path, body: body as Record<string, unknown> });
      const failure = fail[path];
      if (failure !== undefined) {
        delete fail[path];
        throw failure;
      }
      const value =
        path === "/api/verify/start"
          ? { prototype: true, code: "123456", expires_at: 1 }
          : path === "/api/verify/check"
            ? { purpose: "order", proof: "p".repeat(43), expires_at: expiresAt }
            : answer;
      return schema.parse(value);
    },
  };
  return {
    api,
    calls,
    expire: (at: number) => {
      expiresAt = at;
    },
  };
}

test("a code, then the request with the proof", async () => {
  const { api, calls } = fakeApi();
  const flow = createContactFlow({ api, now: () => 0 });
  assert.equal(flow.phase, "details");
  const code = await flow.sendCode("98765 43210");
  assert.equal(code.code, "123456");
  assert.equal(flow.phase, "code");
  const sent = await flow.send(request, {
    phone: "98765 43210",
    code: "123456",
  });
  assert.equal(sent.id, answer.id);
  assert.equal(flow.phase, "sent");
  assert.equal(flow.answer?.seller_phone, "+910000000008");
  assert.deepEqual(
    calls.map(({ path }) => path),
    ["/api/verify/start", "/api/verify/check", "/api/quotes"],
  );
  assert.equal(calls[0]?.body.purpose, "order");
  assert.equal(calls[2]?.body.proof, "p".repeat(43));
  assert.equal(calls[2]?.body.buyer_name, "Meera");
});

test("a retry after a failed request reuses the proof", async () => {
  const { api, calls } = fakeApi({ "/api/quotes": new Error("network") });
  const flow = createContactFlow({ api, now: () => 0 });
  await flow.sendCode("9876543210");
  await assert.rejects(
    flow.send(request, { phone: "9876543210", code: "123456" }),
  );
  await flow.send(request, { phone: "9876543210", code: "123456" });
  assert.deepEqual(
    calls.map(({ path }) => path),
    ["/api/verify/start", "/api/verify/check", "/api/quotes", "/api/quotes"],
  );
});

test("a proof near its end, or for another number, is checked again", async () => {
  const { api, calls, expire } = fakeApi({ "/api/quotes": new Error("x") });
  let now = 0;
  const flow = createContactFlow({ api, now: () => now });
  await flow.sendCode("9876543210");
  expire(proofMarginMs + 5);
  await assert.rejects(
    flow.send(request, { phone: "9876543210", code: "123456" }),
  );
  now = 10;
  await flow.send(request, { phone: "9876543210", code: "123456" });
  assert.equal(
    calls.filter(({ path }) => path === "/api/verify/check").length,
    2,
  );
});

test("a changed number in the code step starts again", async () => {
  const { api } = fakeApi();
  const flow = createContactFlow({ api });
  await flow.sendCode("9876543210");
  assert.equal(flow.phoneChanged("+91 98765 43210"), false);
  assert.equal(flow.phase, "code");
  assert.equal(flow.phoneChanged("9876543211"), true);
  assert.equal(flow.phase, "details");
  assert.equal(flow.code, undefined);
});

test("a used-up proof sends the flow back to the number", async () => {
  const answers: Record<string, [number, unknown]> = {
    "/api/verify/start": [
      201,
      { prototype: true, code: "123456", expires_at: 1 },
    ],
    "/api/verify/check": [
      200,
      {
        purpose: "order",
        proof: "p".repeat(43),
        expires_at: Date.now() + 60_000,
      },
    ],
    "/api/quotes": [
      401,
      { error: { code: "proof_invalid", message: "Verify again." } },
    ],
  };
  const api = createApi({
    fetch: async (path) => {
      const [status, body] = answers[path] ?? [404, {}];
      return new Response(JSON.stringify(body), { status });
    },
    online: () => true,
  });
  const flow = createContactFlow({ api });
  await flow.sendCode("9876543210");
  await assert.rejects(
    flow.send(request, { phone: "9876543210", code: "123456" }),
    (error: unknown) => isApiError(error) && error.code === "proof_invalid",
  );
  assert.equal(flow.phase, "details");
  assert.equal(flow.code, undefined);
});
