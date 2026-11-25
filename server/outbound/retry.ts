import { setTimeout as sleep } from "node:timers/promises";

export type RetryOptions = {
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  tries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  neverRetry?: (response: Response) => boolean | Promise<boolean>;
  fetch?: typeof fetch;
  random?: () => number;
};

const retryStatuses = new Set([429, 500, 502, 503]);
const maxTries = 3;
const delaySeconds = /^\d+(\.\d+)?$/;
const httpDate = /^[a-z]{3}, \d{2} [a-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/i;

// A retry sends init.body again, so the body must not be a stream.
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  {
    timeoutMs,
    signal,
    tries = maxTries,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    neverRetry,
    fetch: send = fetch,
    random = Math.random,
  }: RetryOptions,
): Promise<Response> {
  const allowedTries = Math.min(Math.max(tries, 1), maxTries);
  for (let attempt = 1; ; attempt += 1) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await send(input, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (attempt >= allowedTries || !retryStatuses.has(response.status)) {
      return response;
    }
    if (await mustNotRetry(neverRetry, response)) return response;
    const delay =
      retryAfterMs(response.headers.get("Retry-After"), Date.now()) ??
      backoffMs(attempt, baseDelayMs, random);
    if (delay > maxDelayMs) return response;
    await response.body?.cancel();
    await sleep(delay, undefined, { signal });
  }
}

async function mustNotRetry(
  neverRetry: RetryOptions["neverRetry"],
  response: Response,
): Promise<boolean> {
  if (neverRetry === undefined) return false;
  const copy = response.clone();
  try {
    return await neverRetry(copy);
  } catch {
    return false;
  } finally {
    // A cancel of the original body waits until this copy is read or cancelled.
    copy.body?.cancel().catch(() => {});
  }
}

export function retryAfterMs(
  header: string | null,
  now: number,
): number | undefined {
  if (header === null) return undefined;
  const value = header.trim();
  if (delaySeconds.test(value)) return Math.round(Number(value) * 1000);
  if (!httpDate.test(value)) return undefined;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export function backoffMs(
  attempt: number,
  baseMs: number,
  random: () => number,
): number {
  const ceiling = baseMs * 2 ** (attempt - 1);
  return ceiling / 2 + (random() * ceiling) / 2;
}
