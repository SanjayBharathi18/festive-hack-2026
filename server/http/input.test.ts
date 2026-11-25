import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { errorBodySchema } from "../../shared/errors.ts";
import { daySchema } from "../../shared/day.ts";
import { createTestApp } from "../test-app.ts";
import { parseInput, readJson } from "./input.ts";

const orderSchema = z.object({
  day: daySchema,
  items: z.array(z.object({ pack_id: z.string(), quantity: z.int().min(1) })),
});

function appWithRoute() {
  const { app } = createTestApp();
  app.post("/api/test/orders", async (c) => {
    const order = await readJson(c, orderSchema);
    return c.json({ items: order.items.length }, 201);
  });
  return app;
}

function post(body: string) {
  return appWithRoute().request("/api/test/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

test("a valid body reaches the handler as typed data", async () => {
  const response = await post(
    JSON.stringify({
      day: "2026-11-28",
      items: [{ pack_id: "p1", quantity: 2 }],
    }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { items: 1 });
});

test("an invalid body answers 400 and names the fields, without values", async () => {
  const response = await post(
    JSON.stringify({
      day: "2026-02-30",
      items: [{ pack_id: "p1", quantity: 0 }],
    }),
  );
  assert.equal(response.status, 400);
  const { error } = errorBodySchema.parse(await response.json());
  assert.equal(error.code, "invalid_input");
  assert.equal(error.message, "Check these fields: day, items.0.quantity.");
});

test("a body that is not JSON answers 400", async () => {
  const response = await post("{not json");
  assert.equal(response.status, 400);
  const { error } = errorBodySchema.parse(await response.json());
  assert.equal(error.code, "invalid_input");
});

test("parseInput checks other inputs, such as a query", () => {
  const schema = z.object({ veg: z.enum(["yes", "no"]) });
  assert.deepEqual(parseInput(schema, { veg: "yes" }), { veg: "yes" });
  assert.throws(
    () => parseInput(schema, { veg: "maybe" }),
    /Check these fields: veg/,
  );
});

async function errorCode(response: Response) {
  return errorBodySchema.parse(await response.json()).error.code;
}

const validOrder = JSON.stringify({
  day: "2026-11-28",
  items: [{ pack_id: "p1", quantity: 2 }],
});

test("a body that is not sent as JSON answers 415, so a cross-site form cannot post", async () => {
  const notJson: Record<string, string>[] = [
    { "Content-Type": "text/plain" },
    { "Content-Type": "application/x-www-form-urlencoded" },
    { "Content-Type": "multipart/form-data; boundary=x" },
    {},
  ];
  for (const headers of notJson) {
    const response = await appWithRoute().request("/api/test/orders", {
      method: "POST",
      headers,
      body: validOrder,
    });
    assert.equal(response.status, 415, JSON.stringify(headers));
    assert.equal(await errorCode(response), "unsupported_media_type");
  }
});

test("JSON with a charset, or a +json type, is read", async () => {
  for (const type of [
    "application/json; charset=utf-8",
    "application/merge-patch+json",
  ]) {
    const response = await appWithRoute().request("/api/test/orders", {
      method: "POST",
      headers: { "Content-Type": type },
      body: validOrder,
    });
    assert.equal(response.status, 201, type);
  }
});

test("a body over 64 KB answers 413, also without Content-Length", async () => {
  const big = JSON.stringify({
    day: "2026-11-28",
    items: [],
    pad: "x".repeat(70_000),
  });
  const declared = await post(big);
  assert.equal(declared.status, 413);
  assert.equal(await errorCode(declared), "payload_too_large");

  const bytes = new TextEncoder().encode(big);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += 8192) {
        controller.enqueue(bytes.subarray(at, at + 8192));
      }
      controller.close();
    },
  });
  const chunked = await appWithRoute().request(
    new Request("http://localhost/api/test/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit),
  );
  assert.equal(chunked.status, 413);
  assert.equal(await errorCode(chunked), "payload_too_large");
});

test("a route can set its own body limit", async () => {
  const { app } = createTestApp();
  app.post("/api/test/small", async (c) => {
    await readJson(c, z.object({ note: z.string() }), { limitBytes: 32 });
    return c.json({ ok: true });
  });
  const send = (note: string) =>
    app.request("/api/test/small", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
  assert.equal((await send("short")).status, 200);
  assert.equal(
    (await send("a note that is longer than the limit")).status,
    413,
  );
});
