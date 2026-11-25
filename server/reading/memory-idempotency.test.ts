import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { errorBodySchema } from "../../shared/errors.ts";
import type { AppEnv } from "../http/context.ts";
import { handleError } from "../http/errors.ts";
import { createTestClock } from "../test-app.ts";
import { createMemoryIdempotency } from "./memory-idempotency.ts";

const ttlMs = 15 * 60_000;
const key = "7f9c2ba4-e88f-4f2b-9d2a-1c4b5d6e7f80";

function setup({
  capacity,
  status = 201,
}: { capacity?: number; status?: ContentfulStatusCode } = {}) {
  const clock = createTestClock();
  const idempotent = createMemoryIdempotency(clock, {
    ttlMs,
    ...(capacity === undefined ? {} : { capacity }),
  });
  let runs = 0;
  let gate: Promise<void> = Promise.resolve();
  let answer = status;
  const app = new Hono<AppEnv>();
  app.onError(handleError(() => {}));
  app.post(
    "/api/test/parts",
    idempotent<AppEnv>((c) => c.req.header("X-Store") ?? ""),
    async (c) => {
      runs += 1;
      await gate;
      return c.json({ run: runs, body: await c.req.text() }, answer);
    },
  );
  const post = (
    body: string,
    { idempotencyKey = key, store = "shobhas-kitchen" } = {},
  ) =>
    app.request("/api/test/parts", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey, "X-Store": store },
      body,
    });
  return {
    clock,
    post,
    runs: () => runs,
    answerWith: (next: ContentfulStatusCode) => {
      answer = next;
    },
    hold: () => {
      let open = () => {};
      gate = new Promise((resolve) => {
        open = resolve;
      });
      return () => open();
    },
  };
}

async function code(response: Response): Promise<string> {
  return errorBodySchema.parse(await response.json()).error.code;
}

test("a retry with the same key and body replays the answer, and the handler still reads the body", async () => {
  const { post, runs } = setup();
  const first = await post("wav bytes");
  const again = await post("wav bytes");
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { run: 1, body: "wav bytes" });
  assert.equal(again.status, 201);
  assert.equal(again.headers.get("Idempotent-Replayed"), "true");
  assert.match(again.headers.get("Content-Type") ?? "", /application\/json/);
  assert.deepEqual(await again.json(), { run: 1, body: "wav bytes" });
  assert.equal(runs(), 1);
});

test("the same key with another body is refused", async () => {
  const { post, runs } = setup();
  await post("first part");
  const reused = await post("another part");
  assert.equal(reused.status, 422);
  assert.equal(await code(reused), "idempotency_key_reused");
  assert.equal(runs(), 1);
});

test("the same key from another caller is a request of its own", async () => {
  const { post, runs } = setup();
  await post("same body", { store: "shobhas-kitchen" });
  const other = await post("same body", { store: "test-kitchen" });
  assert.equal(other.headers.get("Idempotent-Replayed"), null);
  assert.deepEqual(await other.json(), { run: 2, body: "same body" });
  assert.equal(runs(), 2);
});

test("a key whose first request still runs gets 409", async () => {
  const { post, hold } = setup();
  const open = hold();
  const first = post("part");
  await new Promise((resolve) => setImmediate(resolve));
  const second = await post("part");
  assert.equal(second.status, 409);
  assert.equal(await code(second), "idempotency_key_in_use");
  open();
  assert.equal((await first).status, 201);
});

test("a failed answer frees the key, so a retry runs again", async () => {
  const { post, runs, answerWith } = setup({ status: 503 });
  assert.equal((await post("part")).status, 503);
  answerWith(201);
  const retry = await post("part");
  assert.equal(retry.status, 201);
  assert.equal(retry.headers.get("Idempotent-Replayed"), null);
  assert.equal(runs(), 2);
});

test("an answer is kept for the TTL only", async () => {
  const { post, runs, clock } = setup();
  await post("part");
  clock.advance(ttlMs - 1);
  assert.equal((await post("part")).headers.get("Idempotent-Replayed"), "true");
  clock.advance(1);
  const late = await post("part");
  assert.equal(late.headers.get("Idempotent-Replayed"), null);
  assert.equal(runs(), 2);
});

test("only a limited number of answers are kept, and the oldest go first", async () => {
  const { post, runs } = setup({ capacity: 2 });
  for (const idempotencyKey of [
    "key-one-111",
    "key-two-222",
    "key-three-333",
  ]) {
    await post("part", { idempotencyKey });
  }
  await post("part", { idempotencyKey: "key-three-333" });
  assert.equal(runs(), 3);
  await post("part", { idempotencyKey: "key-one-111" });
  assert.equal(runs(), 4);
});

test("a missing or short key is refused", async () => {
  const { post } = setup();
  const short = await post("part", { idempotencyKey: "short" });
  assert.equal(short.status, 400);
  assert.equal(await code(short), "idempotency_key_missing");
});
