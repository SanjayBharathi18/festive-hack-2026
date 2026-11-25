import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  createApi,
  isAbortError,
  isApiError,
  retryAfterSeconds,
  type ApiDeps,
} from "./api.ts";

type Call = { input: string; init: RequestInit };
type Answer = (call: Call) => Response | Promise<Response>;

const storeSchema = z.object({ name: z.string() });

test("get validates the answer with the schema and asks for JSON", async () => {
  const server = fakeServer([() => json({ name: "Shobha's Kitchen" })]);
  const store = await createApi(server.deps).get(
    "/api/stores/shobha",
    storeSchema,
  );
  assert.deepEqual(store, { name: "Shobha's Kitchen" });
  const [call] = server.calls;
  assert.equal(call?.input, "/api/stores/shobha");
  assert.equal(call?.init.method, "GET");
  assert.equal(headers(call).get("Accept"), "application/json");
  assert.equal(headers(call).has("Idempotency-Key"), false);
});

test("an answer that does not fit the schema is a bad response", async () => {
  const server = fakeServer([
    () => json({ title: "no name" }),
    () => new Response("not json", { status: 200 }),
  ]);
  const api = createApi(server.deps);
  await rejectsWith(api.get("/api/a", storeSchema), "bad_response");
  await rejectsWith(api.get("/api/b", storeSchema), "bad_response");
});

test("an empty answer is undefined", async () => {
  const server = fakeServer([() => new Response(null, { status: 204 })]);
  const value = await createApi(server.deps).send(
    "DELETE",
    "/api/me",
    undefined,
    z.undefined(),
  );
  assert.equal(value, undefined);
});

test("the error body of the server gives its code and request ID", async () => {
  const server = fakeServer([
    () =>
      json(
        { error: { code: "day_full", message: "Full.", request_id: "r-1" } },
        409,
      ),
  ]);
  const error = await rejectsWith(
    createApi(server.deps).send(
      "POST",
      "/api/orders",
      { day: "x" },
      storeSchema,
    ),
    "day_full",
  );
  assert.equal(error.status, 409);
  assert.equal(error.requestId, "r-1");
});

test("rate_limited takes its seconds from Retry-After", async () => {
  const server = fakeServer([
    () =>
      json({ error: { code: "rate_limited", message: "Slow down." } }, 429, {
        "Retry-After": "42",
      }),
    () => new Response("", { status: 429 }),
  ]);
  const api = createApi(server.deps);
  const first = await rejectsWith(
    api.get("/api/a", storeSchema),
    "rate_limited",
  );
  assert.deepEqual(first.params, { seconds: 42 });
  const second = await rejectsWith(
    api.get("/api/b", storeSchema),
    "rate_limited",
  );
  assert.deepEqual(second.params, { seconds: 60 });
});

test("an error page without our error body maps from its status", async () => {
  const server = fakeServer([
    () => new Response("<h1>Bad gateway</h1>", { status: 502 }),
    () => new Response("", { status: 404 }),
    () => new Response("", { status: 500 }),
  ]);
  const api = createApi(server.deps);
  await rejectsWith(api.get("/api/a", storeSchema), "unavailable");
  await rejectsWith(api.get("/api/b", storeSchema), "not_found");
  await rejectsWith(api.get("/api/c", storeSchema), "internal_error");
});

test("offline, the call stops with network and sends nothing", async () => {
  const server = fakeServer([]);
  const api = createApi({ ...server.deps, online: () => false });
  await rejectsWith(api.get("/api/a", storeSchema), "network");
  assert.equal(server.calls.length, 0);
});

test("a failed fetch is a network error", async () => {
  const server = fakeServer([
    () => Promise.reject(new TypeError("Failed to fetch")),
  ]);
  await rejectsWith(
    createApi(server.deps).get("/api/a", storeSchema),
    "network",
  );
});

test("a call that takes too long is a timeout", async () => {
  const server = fakeServer([untilAborted]);
  const api = createApi({ ...server.deps, timeoutMs: 10 });
  await rejectsWith(api.get("/api/a", storeSchema), "timeout");
});

test("the caller's abort rejects with the AbortError, not an API error", async () => {
  const server = fakeServer([untilAborted]);
  const controller = new AbortController();
  const call = createApi(server.deps).get("/api/a", storeSchema, {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(
    call,
    (error) => isAbortError(error) && !isApiError(error),
  );
});

test("a create keeps its Idempotency-Key across retries of the same body", async () => {
  const server = fakeServer([
    () => Promise.reject(new TypeError("Failed to fetch")),
    () => json({ name: "order 1" }),
    () => json({ name: "order 2" }),
    () => json({ name: "other order" }),
  ]);
  const api = createApi(server.deps);
  const body = { day: "2026-11-28", cart: [{ pack_id: "p", quantity: 2 }] };
  await rejectsWith(
    api.send("POST", "/api/orders", body, storeSchema),
    "network",
  );
  await api.send("POST", "/api/orders", { ...body }, storeSchema);
  await api.send("POST", "/api/orders", body, storeSchema);
  await api.send(
    "POST",
    "/api/orders",
    { ...body, day: "2026-11-29" },
    storeSchema,
  );
  const keys = server.calls.map((call) => headers(call).get("Idempotency-Key"));
  assert.deepEqual(keys, ["key-1", "key-1", "key-2", "key-3"]);
  assert.equal(
    headers(server.calls[0]).get("Content-Type"),
    "application/json",
  );
  assert.equal(server.calls[0]?.init.body, JSON.stringify(body));
});

test("a Blob goes as it is, and keeps its key until it is sent", async () => {
  const server = fakeServer([
    () => json({ error: { code: "internal_error", message: "x" } }, 500),
    () => json({ name: "part" }),
  ]);
  const api = createApi(server.deps);
  const part = new Blob([new Uint8Array(8)], { type: "audio/wav" });
  await rejectsWith(
    api.send("POST", "/api/parts", part, storeSchema),
    "internal_error",
  );
  await api.send("POST", "/api/parts", part, storeSchema);
  assert.equal(server.calls[1]?.init.body, part);
  assert.equal(headers(server.calls[1]).has("Content-Type"), false);
  assert.deepEqual(
    server.calls.map((call) => headers(call).get("Idempotency-Key")),
    ["key-1", "key-1"],
  );
});

test("PATCH and DELETE carry no Idempotency-Key", async () => {
  const server = fakeServer([() => json({ name: "x" })]);
  await createApi(server.deps).send(
    "PATCH",
    "/api/desk/orders/1",
    { status: "ready" },
    storeSchema,
  );
  assert.equal(headers(server.calls[0]).has("Idempotency-Key"), false);
});

test("the headers option is read on each call, for the demo desk token", async () => {
  const server = fakeServer([
    () => json({ name: "x" }),
    () => json({ name: "y" }),
    () => json({ name: "z" }),
  ]);
  let token: string | undefined = "demo-1";
  const api = createApi({
    ...server.deps,
    headers: () => ({ "X-Demo-Token": token }),
  });
  await api.get("/api/desk/store", storeSchema);
  token = "demo-2";
  await api.send(
    "PATCH",
    "/api/desk/orders/1",
    { status: "ready" },
    storeSchema,
  );
  token = undefined;
  await api.send("POST", "/api/desk/orders", { day: "x" }, storeSchema);
  assert.deepEqual(
    server.calls.map((call) => headers(call).get("X-Demo-Token")),
    ["demo-1", "demo-2", null],
  );
  assert.equal(headers(server.calls[2]).get("Accept"), "application/json");
  assert.equal(headers(server.calls[2]).get("Idempotency-Key"), "key-1");
});

test("keepalive goes to fetch, which starts before send() returns", async () => {
  const server = fakeServer([
    () => json({ name: "x" }),
    () => json({ name: "y" }),
  ]);
  const api = createApi(server.deps);
  const flushed = api.send(
    "PATCH",
    "/api/desk/orders/1",
    { status: "ready" },
    storeSchema,
    {
      keepalive: true,
    },
  );
  assert.equal(server.calls.length, 1);
  assert.equal(server.calls[0]?.init.keepalive, true);
  await flushed;
  await api.get("/api/desk/store", storeSchema);
  assert.equal(server.calls[1]?.init.keepalive, false);
});

test("retryAfterSeconds reads seconds or an HTTP date", () => {
  const now = Date.parse("2026-11-24T10:00:00Z");
  assert.equal(retryAfterSeconds("30", now), 30);
  assert.equal(retryAfterSeconds("Tue, 24 Nov 2026 10:01:00 GMT", now), 60);
  assert.equal(retryAfterSeconds(null, now), undefined);
  assert.equal(retryAfterSeconds("soon", now), undefined);
});

function fakeServer(answers: Answer[]) {
  const calls: Call[] = [];
  let keys = 0;
  const deps: ApiDeps = {
    fetch: async (input, init) => {
      const call = { input, init };
      calls.push(call);
      const answer = answers.shift();
      if (answer === undefined) throw new Error(`No answer for ${input}`);
      return answer(call);
    },
    online: () => true,
    newKey: () => `key-${++keys}`,
  };
  return { calls, deps };
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function untilAborted({ init }: Call): Promise<Response> {
  return new Promise((_, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

function headers(call: Call | undefined): Headers {
  return new Headers(call?.init.headers);
}

async function rejectsWith(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    assert.ok(isApiError(error), `expected an API error, got ${String(error)}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ${code}`);
}
