import { z } from "zod";
import { fetchWithRetry } from "../outbound/retry.ts";
import {
  apiPaths,
  timeoutsMs,
  type FailedOutcome,
  type SarvamAnswer,
  type SarvamApi,
  type SarvamTransport,
} from "./api.ts";

export type LiveOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch | undefined;
  timeouts?: Partial<Record<SarvamApi, number>>;
  baseDelayMs?: number;
  random?: () => number;
};

const errorBodySchema = z.object({
  error: z.object({ code: z.string().optional() }),
});

export function createLiveTransport({
  baseUrl,
  apiKey,
  fetch: send = fetch,
  timeouts = {},
  baseDelayMs,
  random,
}: LiveOptions): SarvamTransport {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    mode: "live",
    send: async ({ api, body }, signal) => {
      const form = body instanceof FormData;
      let response: Response;
      try {
        response = await fetchWithRetry(
          `${base}${apiPaths[api]}`,
          {
            method: "POST",
            headers: form
              ? { "api-subscription-key": apiKey }
              : {
                  "api-subscription-key": apiKey,
                  "Content-Type": "application/json",
                },
            body: form ? body : JSON.stringify(body),
          },
          {
            timeoutMs: timeouts[api] ?? timeoutsMs[api],
            signal,
            neverRetry: hasNoCredit,
            fetch: send,
            ...(baseDelayMs === undefined ? {} : { baseDelayMs }),
            ...(random === undefined ? {} : { random }),
          },
        );
      } catch (error) {
        if (signal?.aborted) throw error;
        return failure(isTimeout(error) ? "timeout" : "error", null, null);
      }
      if (!response.ok) {
        const code = await errorCode(response);
        return failure(
          failedOutcome(response.status, code),
          response.status,
          code,
        );
      }
      try {
        const answer: unknown = await response.json();
        return {
          ok: true,
          status: response.status,
          body: answer,
          placeholder: false,
        };
      } catch (error) {
        if (signal?.aborted) throw error;
        return failure(
          isTimeout(error) ? "timeout" : "invalid",
          response.status,
          null,
        );
      }
    },
  };
}

export function failedOutcome(
  status: number,
  code: string | null,
): FailedOutcome {
  if (status === 402 || code === "seat_budget_exhausted_error") {
    return "no_credit";
  }
  if (status === 429 || code === "rate_limit_exceeded_error") {
    return "rate_limited";
  }
  return "error";
}

async function hasNoCredit(response: Response): Promise<boolean> {
  return (
    response.status === 402 ||
    (response.status === 429 &&
      (await errorCode(response)) === "seat_budget_exhausted_error")
  );
}

async function errorCode(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => undefined);
  return errorBodySchema.safeParse(body).data?.error.code ?? null;
}

function isTimeout(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "TimeoutError";
}

function failure(
  outcome: FailedOutcome,
  status: number | null,
  code: string | null,
): SarvamAnswer {
  return { ok: false, outcome, status, code, missing: false };
}
