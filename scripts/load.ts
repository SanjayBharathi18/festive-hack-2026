import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { readVoiceLines, type VoiceLine } from "./record-fixtures.ts";

export type LoadOptions = {
  baseUrl: string;
  lines: readonly VoiceLine[];
  phone?: string;
  perMinute?: number;
  limit?: number;
  fetch?: typeof fetch;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  print?: (line: string) => void;
};

export type LoadSummary = {
  sent: number;
  seconds: number;
  outcomes: Record<string, Record<string, number>>;
};

export const testKitchenPhone = "+910000000002";
export const loadLanguages = ["kn-IN", "hi-IN", "en-IN"] as const;
export const defaultPerMinute = 15;
export const maxPerMinute = 20;
export const readTimeoutMs = 45_000;

const startAnswerSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const readAnswerSchema = z.object({
  outcome: z.string(),
  language: z.string().nullable(),
});
const errorAnswerSchema = z.object({ error: z.object({ code: z.string() }) });

// The incident load (docs/system.md, "Incident runbook"): text orders for
// test-kitchen in Kannada, Hindi and English, with a known language and the
// source load, so each one uses the reading step only and is no exposure.
export async function runLoad({
  baseUrl,
  lines,
  phone = testKitchenPhone,
  perMinute = defaultPerMinute,
  limit = Number.POSITIVE_INFINITY,
  fetch: send = fetch,
  wait = (ms, signal) => sleep(ms, undefined, { signal }),
  now = Date.now,
  signal,
  print = () => {},
}: LoadOptions): Promise<LoadSummary> {
  if (!(perMinute > 0 && perMinute <= maxPerMinute)) {
    throw new Error(
      `The rate must be more than 0 and ${maxPerMinute} a minute at most: the server allows ${maxPerMinute} readings a minute from one address.`,
    );
  }
  const base = baseUrl.replace(/\/+$/, "");
  const cookie = await signIn(base, phone, send, signal);
  print(
    `Signed in to the desk of ${phone}. Sending ${perMinute} text orders a minute. Press Ctrl-C to stop.`,
  );
  const order = rotation(lines);
  const gapMs = Math.round(60_000 / perMinute);
  const started = now();
  const summary: LoadSummary = { sent: 0, seconds: 0, outcomes: {} };
  try {
    while (summary.sent < limit && !signal?.aborted) {
      const line = order[summary.sent % order.length];
      if (line === undefined) break;
      const tick = now();
      const result = await readOrder(base, cookie, line, send, signal);
      summary.sent += 1;
      count(summary, line.language, result.outcome);
      print(`${summary.sent} ${line.id} ${line.language}: ${result.outcome}`);
      if (summary.sent >= limit) break;
      const pause = Math.max(result.retryAfterMs, gapMs - (now() - tick));
      await wait(pause, signal);
    }
  } catch (error) {
    if (!signal?.aborted) throw error;
  }
  summary.seconds = Math.round((now() - started) / 1000);
  return summary;
}

export async function signIn(
  base: string,
  phone: string,
  send: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  const post = (path: string, body: unknown) =>
    send(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: timeoutSignal(10_000, signal),
    });
  const started = await post("/api/verify/start", { phone, purpose: "desk" });
  if (started.status !== 201) {
    throw new Error(
      `The desk code for ${phone} was refused (${started.status} ${await errorCode(started)}). Check that the server runs at ${base} and has the test-kitchen seed.`,
    );
  }
  const { code } = startAnswerSchema.parse(await started.json());
  const checked = await post("/api/verify/check", {
    phone,
    purpose: "desk",
    code,
  });
  const cookie = checked.headers
    .getSetCookie()
    .map((value) => value.split(";")[0] ?? "")
    .find((value) => value.startsWith("__Host-desk_session="));
  if (!checked.ok || cookie === undefined) {
    throw new Error(
      `The desk sign-in for ${phone} failed (${checked.status} ${await errorCode(checked)}). Run the script again for a new code.`,
    );
  }
  return cookie;
}

export function rotation(lines: readonly VoiceLine[]): VoiceLine[] {
  const groups = loadLanguages.map((language) =>
    lines.filter(
      (line) => line.language === language && /^V[KHE]\d+$/.test(line.id),
    ),
  );
  const longest = Math.max(0, ...groups.map((group) => group.length));
  const order: VoiceLine[] = [];
  for (let index = 0; index < longest * groups.length; index += 1) {
    const group = groups[index % groups.length] ?? [];
    const line = group[Math.floor(index / groups.length) % group.length];
    if (line !== undefined) order.push(line);
  }
  return order;
}

export function formatSummary({
  sent,
  seconds,
  outcomes,
}: LoadSummary): string {
  const rows = Object.entries(outcomes).map(
    ([language, counts]) =>
      `  ${language}: ${Object.entries(counts)
        .map(([outcome, total]) => `${outcome} ${total}`)
        .join(", ")}`,
  );
  return [`Sent ${sent} text orders in ${seconds} s.`, ...rows].join("\n");
}

async function readOrder(
  base: string,
  cookie: string,
  line: VoiceLine,
  send: typeof fetch,
  signal?: AbortSignal,
): Promise<{ outcome: string; retryAfterMs: number }> {
  let response: Response;
  try {
    response = await send(`${base}/api/desk/read`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        text: line.text,
        language: line.language,
        source: "load",
      }),
      signal: timeoutSignal(readTimeoutMs, signal),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      outcome:
        (error as { name?: unknown }).name === "TimeoutError"
          ? "timeout"
          : "network",
      retryAfterMs: 0,
    };
  }
  if (response.ok) {
    const answer = readAnswerSchema.safeParse(await response.json());
    return {
      outcome: answer.success ? answer.data.outcome : "bad_answer",
      retryAfterMs: 0,
    };
  }
  const retryAfter = Number(response.headers.get("Retry-After"));
  return {
    outcome: `http_${response.status}_${await errorCode(response)}`,
    retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : 0,
  };
}

function count(summary: LoadSummary, language: string, outcome: string): void {
  const counts = (summary.outcomes[language] ??= {});
  counts[outcome] = (counts[outcome] ?? 0) + 1;
}

async function errorCode(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined);
  return errorAnswerSchema.safeParse(body).data?.error.code ?? "no_code";
}

function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      rate: { type: "string" },
    },
  });
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  try {
    const summary = await runLoad({
      baseUrl: values.url ?? process.env.PUBLIC_URL ?? "http://localhost:8080",
      lines: await readVoiceLines(),
      perMinute:
        values.rate === undefined ? defaultPerMinute : Number(values.rate),
      signal: controller.signal,
      print: (line) => console.log(line),
    });
    console.log(formatSummary(summary));
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
