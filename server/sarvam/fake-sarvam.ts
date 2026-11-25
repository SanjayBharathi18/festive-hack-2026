import type { Counter } from "prom-client";
import { createMetrics, type Metrics } from "../metrics/metrics.ts";
import type { SarvamApi } from "./api.ts";
import type { SarvamDeps } from "./call.ts";
import { createLiveTransport } from "./live.ts";

export type FakeAnswer =
  Response | ((request: Request) => Response | Promise<Response>);

export const testBaseUrl = "https://api.sarvam.test";
export const testKey = "sk_test_secret";

export function fakeFetch(answers: FakeAnswer[]) {
  const requests: Request[] = [];
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    const answer = answers.shift();
    if (answer === undefined) throw new Error("No answer left.");
    return typeof answer === "function" ? answer(request) : answer;
  }) as typeof fetch;
  return { send, requests };
}

export function liveDeps(
  answers: FakeAnswer[],
  timeouts: Partial<Record<SarvamApi, number>> = {},
): SarvamDeps & { metrics: Metrics; requests: Request[] } {
  const { send, requests } = fakeFetch(answers);
  return {
    sarvam: createLiveTransport({
      baseUrl: testBaseUrl,
      apiKey: testKey,
      fetch: send,
      timeouts,
      baseDelayMs: 1,
      random: () => 0.5,
    }),
    metrics: createMetrics(),
    requests,
  };
}

export const hangUntilAborted: FakeAnswer = (request) =>
  new Promise((_, reject) => {
    // AbortSignal.timeout does not keep the event loop alive on its own.
    const keepAlive = setTimeout(() => {}, 5_000);
    request.signal.addEventListener("abort", () => {
      clearTimeout(keepAlive);
      reject(request.signal.reason);
    });
  });

export function sarvamError(status: number, code: string): Response {
  return Response.json(
    { error: { code, message: `A test ${code}.` } },
    { status },
  );
}

export async function counterValue(
  counter: Counter<string>,
  labels: Record<string, string>,
): Promise<number> {
  const { values } = await counter.get();
  return values
    .filter((value) =>
      Object.entries(labels).every(
        ([name, label]) => value.labels[name] === label,
      ),
    )
    .reduce((sum, value) => sum + value.value, 0);
}

export const failureCases = [
  {
    name: "a 402 means no credit, with no retry",
    answers: () => [sarvamError(402, "insufficient_quota_error")],
    outcome: "no_credit",
    requests: 1,
  },
  {
    name: "a 429 with seat_budget_exhausted_error means no credit, with no retry",
    answers: () => [sarvamError(429, "seat_budget_exhausted_error")],
    outcome: "no_credit",
    requests: 1,
  },
  {
    name: "three 429 answers are rate_limited after 3 tries",
    answers: () =>
      [1, 2, 3].map(() => sarvamError(429, "rate_limit_exceeded_error")),
    outcome: "rate_limited",
    requests: 3,
  },
  {
    name: "an answer that is not JSON is invalid",
    answers: () => [
      new Response("<html>busy</html>", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ],
    outcome: "invalid",
    requests: 1,
  },
  {
    name: "a 400 is an error, with no retry",
    answers: () => [sarvamError(400, "invalid_request_error")],
    outcome: "error",
    requests: 1,
  },
  {
    name: "no answer in time is a timeout",
    answers: () => [hangUntilAborted],
    outcome: "timeout",
    requests: 1,
  },
] as const;

export function retryAfterAnswers(success: Response): Response[] {
  return [
    new Response(
      JSON.stringify({ error: { code: "rate_limit_exceeded_error" } }),
      { status: 429, headers: { "Retry-After": "0" } },
    ),
    success,
  ];
}
