import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { backoffMs, fetchWithRetry, retryAfterMs } from "./retry.ts";

type Answer = Response | (() => Promise<Response>);

function fakeFetch(answers: Answer[]) {
  const signals: AbortSignal[] = [];
  const send = async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    const answer = answers.shift();
    if (answer === undefined) throw new Error("No answer left.");
    return typeof answer === "function" ? answer() : answer;
  };
  return { send: send as typeof fetch, signals };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const url = "https://api.example.com/call";
const half = () => 0.5;

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

test("a 503 is retried after the backoff, and the next answer returns", async () => {
  const { send, signals } = fakeFetch([
    new Response("busy", { status: 503 }),
    new Response("done", { status: 200 }),
  ]);
  let settled = false;
  const result = fetchWithRetry(
    url,
    {},
    {
      timeoutMs: 1000,
      fetch: send,
      random: half,
    },
  ).finally(() => {
    settled = true;
  });
  await settle();
  mock.timers.tick(374);
  await settle();
  assert.equal(settled, false);
  mock.timers.tick(1);
  const response = await result;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "done");
  assert.equal(signals.length, 2);
});

test("429, 500, 502 and 503 are retried, 3 tries at most", async () => {
  for (const status of [429, 500, 502, 503]) {
    const { send, signals } = fakeFetch([
      new Response(null, { status }),
      new Response(null, { status }),
      new Response(null, { status }),
      new Response(null, { status: 200 }),
    ]);
    const result = fetchWithRetry(
      url,
      {},
      {
        timeoutMs: 1000,
        fetch: send,
        random: half,
      },
    );
    for (let i = 0; i < 3; i += 1) {
      await settle();
      mock.timers.tick(10_000);
    }
    assert.equal((await result).status, status);
    assert.equal(signals.length, 3);
  }
});

test("other answers are not retried", async () => {
  for (const status of [200, 400, 402, 403, 404, 422, 504]) {
    const { send, signals } = fakeFetch([new Response(null, { status })]);
    const response = await fetchWithRetry(
      url,
      {},
      {
        timeoutMs: 1000,
        fetch: send,
      },
    );
    assert.equal(response.status, status);
    assert.equal(signals.length, 1);
  }
});

test("the backoff doubles, with jitter", async () => {
  assert.equal(
    backoffMs(1, 500, () => 0),
    250,
  );
  assert.equal(
    backoffMs(1, 500, () => 1),
    500,
  );
  assert.equal(
    backoffMs(2, 500, () => 0),
    500,
  );
  assert.equal(
    backoffMs(2, 500, () => 1),
    1000,
  );
  assert.equal(backoffMs(3, 500, half), 1500);
});

test("Retry-After in seconds sets the wait", async () => {
  const { send, signals } = fakeFetch([
    new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
    new Response(null, { status: 200 }),
  ]);
  const result = fetchWithRetry(
    url,
    {},
    {
      timeoutMs: 1000,
      fetch: send,
      random: half,
    },
  );
  await settle();
  mock.timers.tick(1999);
  await settle();
  assert.equal(signals.length, 1);
  mock.timers.tick(1);
  assert.equal((await result).status, 200);
  assert.equal(signals.length, 2);
});

test("Retry-After can be a date", () => {
  const now = Date.parse("2026-11-24T06:30:00Z");
  assert.equal(retryAfterMs("Tue, 24 Nov 2026 06:30:03 GMT", now), 3000);
  assert.equal(retryAfterMs("Tue, 24 Nov 2026 06:29:00 GMT", now), 0);
  assert.equal(retryAfterMs("soon", now), undefined);
  assert.equal(retryAfterMs(null, now), undefined);
});

test("a wait longer than maxDelayMs returns the answer at once", async () => {
  const { send, signals } = fakeFetch([
    new Response(null, { status: 429, headers: { "Retry-After": "60" } }),
  ]);
  const response = await fetchWithRetry(
    url,
    {},
    {
      timeoutMs: 1000,
      fetch: send,
      maxDelayMs: 10_000,
    },
  );
  assert.equal(response.status, 429);
  assert.equal(signals.length, 1);
});

test("an answer that must never be retried returns at once, with its body", async () => {
  const body = JSON.stringify({
    error: { code: "seat_budget_exhausted_error" },
  });
  const { send, signals } = fakeFetch([new Response(body, { status: 429 })]);
  const response = await fetchWithRetry(
    url,
    {},
    {
      timeoutMs: 1000,
      fetch: send,
      neverRetry: async (answer) =>
        ((await answer.json()) as { error: { code: string } }).error.code ===
        "seat_budget_exhausted_error",
    },
  );
  assert.equal(response.status, 429);
  assert.equal(await response.text(), body);
  assert.equal(signals.length, 1);
});

test("each try has a timeout, and a timeout is not retried", async (t) => {
  const keepAlive = setInterval(() => {}, 10);
  t.after(() => clearInterval(keepAlive));
  const hang = (signal: AbortSignal) =>
    new Promise<Response>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason)),
    );
  const signals: AbortSignal[] = [];
  const send = (async (_input: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal;
    if (!signal) throw new Error("No signal.");
    signals.push(signal);
    return hang(signal);
  }) as typeof fetch;
  await assert.rejects(
    fetchWithRetry(url, {}, { timeoutMs: 20, fetch: send }),
    { name: "TimeoutError" },
  );
  assert.equal(signals.length, 1);
});

test("the caller's signal stops the wait between tries", async () => {
  const caller = new AbortController();
  const { send, signals } = fakeFetch([
    new Response(null, { status: 503 }),
    new Response(null, { status: 200 }),
  ]);
  const result = fetchWithRetry(
    url,
    {},
    {
      timeoutMs: 1000,
      signal: caller.signal,
      fetch: send,
    },
  );
  await settle();
  caller.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.aborted, true);
});

test("a network error is not retried", async () => {
  let calls = 0;
  const send = (async () => {
    calls += 1;
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  await assert.rejects(
    fetchWithRetry(url, {}, { timeoutMs: 1000, fetch: send }),
    TypeError,
  );
  assert.equal(calls, 1);
});

test("a fractional Retry-After is seconds; only an HTTP date is read as a date", () => {
  const now = Date.parse("2026-11-24T06:30:00Z");
  assert.equal(retryAfterMs("1.5", now), 1500);
  assert.equal(retryAfterMs(" 0.25 ", now), 250);
  assert.equal(retryAfterMs("1.5.2", now), undefined);
  assert.equal(retryAfterMs("-1", now), undefined);
  assert.equal(retryAfterMs("2026-11-24T06:30:03Z", now), undefined);
  assert.equal(retryAfterMs("Tue, 24 Nov 2026 06:30:03 GMT", now), 3000);
});

test("a fractional Retry-After sets the wait", async () => {
  const { send, signals } = fakeFetch([
    new Response(null, { status: 503, headers: { "Retry-After": "1.5" } }),
    new Response(null, { status: 200 }),
  ]);
  const result = fetchWithRetry(url, {}, { timeoutMs: 1000, fetch: send });
  await settle();
  mock.timers.tick(1499);
  await settle();
  assert.equal(signals.length, 1);
  mock.timers.tick(1);
  assert.equal((await result).status, 200);
});

test("a neverRetry check that fails, or does not read the body, still retries", async () => {
  for (const neverRetry of [
    () => {
      throw new Error("broken check");
    },
    async () => {
      throw new Error("broken check");
    },
    (answer: Response) => answer.headers.has("X-No-Retry"),
  ]) {
    const { send, signals } = fakeFetch([
      new Response("{", { status: 429 }),
      new Response(null, { status: 200 }),
    ]);
    const result = fetchWithRetry(
      url,
      {},
      {
        timeoutMs: 1000,
        fetch: send,
        random: half,
        neverRetry,
      },
    );
    await settle();
    mock.timers.tick(10_000);
    assert.equal((await result).status, 200);
    assert.equal(signals.length, 2);
  }
});
