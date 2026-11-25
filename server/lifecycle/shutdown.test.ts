import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { getRequestListener } from "@hono/node-server";
import { openDatabase } from "../db/database.ts";
import { createLog } from "../log.ts";
import { createTestApp, createTestClock } from "../test-app.ts";
import { createShutdown } from "./shutdown.ts";

async function startServer({ drainMs = 1000, hookMs = 1000 } = {}) {
  const clock = createTestClock();
  const lines: string[] = [];
  const exits: number[] = [];
  const db = openDatabase(":memory:");
  const server = createServer();
  const shutdown = createShutdown({
    server,
    db,
    log: createLog((line) => lines.push(line), clock),
    exit: (code) => exits.push(code),
    drainMs,
    hookMs,
  });
  const { app } = createTestApp({
    db,
    clock,
    isShuttingDown: shutdown.isShuttingDown,
  });
  let entered = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  app.get("/api/test/slow", async (c) => {
    entered = true;
    await gate;
    return c.json({ done: true });
  });
  const events: string[] = [];
  const listener = getRequestListener(app.fetch);
  server.on("request", (request, response) => {
    response.on("finish", () => events.push("response sent"));
    void listener(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const startSlowRequest = async () => {
    const response = fetch(`http://127.0.0.1:${port}/api/test/slow`);
    while (!entered) await new Promise((resolve) => setImmediate(resolve));
    return { response };
  };
  const messages = () =>
    lines.map((line) => (JSON.parse(line) as { msg?: string }).msg);
  return {
    db,
    server,
    shutdown,
    exits,
    events,
    messages,
    release,
    startSlowRequest,
  };
}

test("the current request finishes, then the hooks run, the database closes and the process exits 0", async () => {
  const {
    db,
    server,
    shutdown,
    exits,
    events,
    messages,
    release,
    startSlowRequest,
  } = await startServer();
  const { response: slow } = await startSlowRequest();
  shutdown.onShutdown(() => {
    events.push(db.open ? "hook ran, database open" : "hook ran too late");
  });
  const done = shutdown.run("SIGTERM");
  assert.equal(shutdown.isShuttingDown(), true);
  assert.equal(shutdown.signal.aborted, true);
  assert.equal(server.listening, false);
  release();
  const response = await slow;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { done: true });
  assert.equal(response.headers.get("Connection"), "close");
  await done;
  assert.deepEqual(events, ["response sent", "hook ran, database open"]);
  assert.equal(db.open, false);
  assert.deepEqual(exits, [0]);
  assert.deepEqual(messages(), ["shutdown started", "shutdown finished"]);
});

test("a request that runs past the deadline is cut, and shutdown still ends", async () => {
  const { shutdown, exits, startSlowRequest } = await startServer({
    drainMs: 50,
  });
  const { response } = await startSlowRequest();
  await shutdown.run("SIGTERM");
  await assert.rejects(response);
  assert.deepEqual(exits, [0]);
});

test("a failing or hanging hook is logged and does not stop the exit", async () => {
  const { shutdown, exits, messages } = await startServer({ hookMs: 50 });
  shutdown.onShutdown(() => {
    throw new Error("flush failed");
  });
  shutdown.onShutdown(() => new Promise(() => {}));
  await shutdown.run("SIGTERM");
  assert.deepEqual(exits, [0]);
  assert.equal(
    messages().filter((message) => message === "shutdown hook failed").length,
    2,
  );
});

test("a second signal joins the shutdown that runs", async () => {
  const { shutdown, exits } = await startServer();
  const first = shutdown.run("SIGTERM");
  const second = shutdown.run("SIGINT");
  assert.equal(first, second);
  await first;
  assert.deepEqual(exits, [0]);
});

test("each hook gets a signal that aborts at its deadline", async () => {
  const { shutdown, exits } = await startServer({ hookMs: 50 });
  const seen: string[] = [];
  shutdown.onShutdown((signal) => {
    seen.push(signal.aborted ? "aborted at the start" : "open at the start");
    return new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => {
        seen.push("aborted at the deadline");
        resolve();
      }),
    );
  });
  shutdown.onShutdown(async (signal) => {
    seen.push(signal.aborted ? "quick hook aborted" : "quick hook done");
  });
  await shutdown.run("SIGTERM");
  assert.deepEqual(seen.sort(), [
    "aborted at the deadline",
    "open at the start",
    "quick hook done",
  ]);
  assert.deepEqual(exits, [0]);
});
