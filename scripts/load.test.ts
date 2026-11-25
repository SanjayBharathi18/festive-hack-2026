import assert from "node:assert/strict";
import { test } from "node:test";
import type { VoiceLine } from "./record-fixtures.ts";
import { formatSummary, rotation, runLoad, testKitchenPhone } from "./load.ts";

const lines: VoiceLine[] = [
  { id: "VK1", language: "kn-IN", text: "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್" },
  { id: "VK2", language: "kn-IN", text: "ಎರಡು ಕೆಜಿ ಕಾಜು ಕಟ್ಲಿ" },
  { id: "VH1", language: "hi-IN", text: "एक किलो काजू कतली" },
  { id: "VE1", language: "en-IN", text: "One kilo of Mysore pak" },
  { id: "VM2", language: "kn-IN", text: "Friday ge one kg besan laddu" },
];

type Seen = { path: string; headers: Headers; body: unknown };

function fakeServer(
  answer: (body: { language: string }, index: number) => Response = (body) =>
    Response.json({
      outcome: body.language === "kn-IN" ? "invalid" : "ok",
      language: body.language,
    }),
) {
  const seen: Seen[] = [];
  let reads = 0;
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const body = request.method === "POST" ? await request.json() : undefined;
    seen.push({ path, headers: request.headers, body });
    if (path === "/api/verify/start") {
      return Response.json(
        { prototype: true, code: "123456", expires_at: 1 },
        { status: 201 },
      );
    }
    if (path === "/api/verify/check") {
      return new Response(JSON.stringify({ purpose: "desk" }), {
        headers: {
          "Set-Cookie":
            "__Host-desk_session=signed-token; Path=/; HttpOnly; Secure",
        },
      });
    }
    reads += 1;
    return answer(body as { language: string }, reads);
  }) as typeof fetch;
  return { send, seen };
}

function clock() {
  let now = 0;
  const waits: number[] = [];
  return {
    now: () => now,
    waits,
    wait: async (ms: number) => {
      waits.push(ms);
      now += ms;
    },
  };
}

test("the rotation takes Kannada, Hindi and English in turn, with no mixed lines", () => {
  assert.deepEqual(
    rotation(lines).map(({ id }) => id),
    ["VK1", "VH1", "VE1", "VK2", "VH1", "VE1"],
  );
});

test("the load signs in with the on-screen code, then sends text orders with language and source load", async () => {
  const server = fakeServer();
  const time = clock();
  const printed: string[] = [];
  const summary = await runLoad({
    baseUrl: "http://localhost:8095/",
    lines,
    fetch: server.send,
    limit: 4,
    print: (line) => printed.push(line),
    ...time,
  });
  assert.deepEqual(
    server.seen.slice(0, 2).map(({ path, body }) => [path, body]),
    [
      ["/api/verify/start", { phone: testKitchenPhone, purpose: "desk" }],
      [
        "/api/verify/check",
        { phone: testKitchenPhone, purpose: "desk", code: "123456" },
      ],
    ],
  );
  const reads = server.seen.slice(2);
  assert.equal(reads.length, 4);
  assert.deepEqual(reads[0]?.body, {
    text: "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್",
    language: "kn-IN",
    source: "load",
  });
  for (const read of reads) {
    assert.equal(read.path, "/api/desk/read");
    assert.equal(
      read.headers.get("Cookie"),
      "__Host-desk_session=signed-token",
    );
    assert.match(read.headers.get("Idempotency-Key") ?? "", /^[0-9a-f-]{36}$/);
  }
  assert.equal(
    new Set(reads.map(({ headers }) => headers.get("Idempotency-Key"))).size,
    4,
  );
  assert.deepEqual(time.waits, [4000, 4000, 4000]);
  assert.deepEqual(summary, {
    sent: 4,
    seconds: 12,
    outcomes: {
      "kn-IN": { invalid: 2 },
      "hi-IN": { ok: 1 },
      "en-IN": { ok: 1 },
    },
  });
  assert.match(printed[0] ?? "", /Signed in/);
  assert.equal(printed[1], "1 VK1 kn-IN: invalid");
  assert.equal(
    formatSummary(summary),
    "Sent 4 text orders in 12 s.\n  kn-IN: invalid 2\n  hi-IN: ok 1\n  en-IN: ok 1",
  );
});

test("a refused reading is counted, and a 429 waits for its Retry-After", async () => {
  const server = fakeServer((body, index) =>
    index === 1
      ? Response.json(
          { error: { code: "rate_limited", message: "Too many requests." } },
          { status: 429, headers: { "Retry-After": "30" } },
        )
      : index === 2
        ? Response.json(
            { error: { code: "internal_error", message: "x" } },
            { status: 500 },
          )
        : Response.json({ outcome: "ok", language: body.language }),
  );
  const time = clock();
  const summary = await runLoad({
    baseUrl: "http://localhost:8095",
    lines,
    fetch: server.send,
    limit: 3,
    ...time,
  });
  assert.deepEqual(time.waits, [30_000, 4000]);
  assert.deepEqual(summary.outcomes, {
    "kn-IN": { http_429_rate_limited: 1 },
    "hi-IN": { http_500_internal_error: 1 },
    "en-IN": { ok: 1 },
  });
});

test("Ctrl-C stops the load and keeps the counts", async () => {
  const server = fakeServer();
  const controller = new AbortController();
  let now = 0;
  const summary = await runLoad({
    baseUrl: "http://localhost:8095",
    lines,
    fetch: server.send,
    signal: controller.signal,
    now: () => now,
    wait: async (ms, signal) => {
      now += ms;
      if (now >= 8000) controller.abort();
      signal?.throwIfAborted();
    },
  });
  assert.equal(summary.sent, 2);
  assert.deepEqual(summary.outcomes, {
    "kn-IN": { invalid: 1 },
    "hi-IN": { ok: 1 },
  });
});

test("a failed sign-in stops the load with the next step", async () => {
  const send = (async () =>
    Response.json(
      { error: { code: "seller_not_found", message: "No store." } },
      { status: 404 },
    )) as typeof fetch;
  await assert.rejects(
    runLoad({ baseUrl: "http://localhost:8095", lines, fetch: send }),
    /refused \(404 seller_not_found\)\. Check that the server runs at http:\/\/localhost:8095/,
  );
});

test("the rate stays within the reading limit of the server", async () => {
  const server = fakeServer();
  await assert.rejects(
    runLoad({
      baseUrl: "http://x.test",
      lines,
      fetch: server.send,
      perMinute: 30,
    }),
    /20 a minute at most/,
  );
  assert.equal(server.seen.length, 0);
});
