import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { DeskSlip } from "../../shared/orders.ts";
import { parseConfig } from "../config.ts";
import type { AppEnv } from "../http/context.ts";
import { handleError } from "../http/errors.ts";
import { createTestApp } from "../test-app.ts";
import { seedStore } from "../test-store.ts";
import { demoTokenHeader } from "../verify/desk-auth.ts";
import { eventRoutes } from "./event-routes.ts";
import { createEventHub } from "./hub.ts";
import { sseReader } from "./test-sse.ts";

const demoToken = "demo-token-for-the-tests-0123456789";

function setup(t: TestContext, heartbeat = 60_000) {
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    DEMO_DESK_TOKEN: demoToken,
  });
  assert.ok(parsed.ok);
  const stop = new AbortController();
  t.after(() => stop.abort());
  const { deps } = createTestApp({
    config: parsed.config,
    stopping: stop.signal,
  });
  const hero = seedStore(deps.db, { isDemo: true });
  const events = createEventHub();
  const app = new Hono<AppEnv>()
    .use(requestId())
    .onError(handleError(deps.log))
    .route("/", eventRoutes({ ...deps, events }, { heartbeat }));
  const open = async () => {
    const response = await app.request("/api/desk/events", {
      headers: { [demoTokenHeader]: demoToken },
    });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("Content-Type") ?? "",
      /^text\/event-stream/,
    );
    return sseReader(response);
  };
  return { app, events, hero, open, stop };
}

async function until(condition: () => boolean) {
  for (let tries = 0; tries < 100 && !condition(); tries += 1) await sleep(5);
  assert.ok(condition());
}

test("the stream starts with a heartbeat", async (t) => {
  const { open, stop } = setup(t);
  const stream = await open();
  assert.equal((await stream.next())?.event, "heartbeat");
  stop.abort();
});

test("an order event reaches the desk of its store, and no other desk", async (t) => {
  const { open, events, hero, stop } = setup(t);
  const stream = await open();
  await stream.next();
  events.publish("another-store", {
    type: "order_created",
    order: { id: "not-hers" } as DeskSlip,
  });
  events.publish(hero.storeId, {
    type: "order_changed",
    order: { id: "hers", number: 4 } as DeskSlip,
  });
  const event = await stream.next();
  assert.equal(event?.event, "order_changed");
  assert.deepEqual(JSON.parse(event?.data ?? ""), { id: "hers", number: 4 });
  stop.abort();
});

test("an order taken back and a new quote request reach the desk by id", async (t) => {
  const { open, events, hero, stop } = setup(t);
  const stream = await open();
  await stream.next();
  events.publish(hero.storeId, { type: "order_removed", order_id: "gone" });
  events.publish(hero.storeId, { type: "quote_created", quote_id: "asked" });
  const removed = await stream.next();
  assert.equal(removed?.event, "order_removed");
  assert.deepEqual(JSON.parse(removed?.data ?? ""), { id: "gone" });
  const quote = await stream.next();
  assert.equal(quote?.event, "quote_created");
  assert.deepEqual(JSON.parse(quote?.data ?? ""), { id: "asked" });
  stop.abort();
});

test("a heartbeat comes at each interval", async (t) => {
  const { open, stop } = setup(t, 10);
  const stream = await open();
  for (let count = 0; count < 3; count += 1) {
    assert.equal((await stream.next())?.event, "heartbeat");
  }
  stop.abort();
});

test("every stream ends when the server stops", async (t) => {
  const { open, events, hero, stop } = setup(t);
  const first = await open();
  const second = await open();
  await first.next();
  await second.next();
  assert.equal(events.listeners(hero.storeId), 2);
  stop.abort();
  assert.equal(await first.next(), undefined);
  assert.equal(await second.next(), undefined);
  assert.equal(events.listeners(hero.storeId), 0);
});

test("a stream that the desk closes stops listening", async (t) => {
  const { open, events, hero, stop } = setup(t);
  const stream = await open();
  await stream.next();
  await stream.cancel();
  await until(() => events.listeners(hero.storeId) === 0);
  stop.abort();
});

test("closed streams leave no listener on the stopping signal", async (t) => {
  const { open, stop } = setup(t);
  const listeners = () => getEventListeners(stop.signal, "abort").length;
  const before = listeners();
  const streams = [await open(), await open(), await open()];
  for (const stream of streams) await stream.next();
  assert.equal(listeners(), before + 3);
  for (const stream of streams) await stream.cancel();
  await until(() => listeners() === before);
  stop.abort();
});

test("the stream needs the seller session or the demo token", async (t) => {
  const { app, stop } = setup(t);
  const response = await app.request("/api/desk/events");
  assert.equal(response.status, 401);
  const viaQuery = await app.request(`/api/desk/events?demo=${demoToken}`);
  assert.equal(viaQuery.status, 200);
  await viaQuery.body?.cancel();
  stop.abort();
});
