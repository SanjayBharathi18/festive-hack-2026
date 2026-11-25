import { sarvamLanguageCodeSchema } from "../../shared/languages.ts";
import type { Metrics, Outcome } from "../metrics/metrics.ts";
import type {
  FailedOutcome,
  SarvamAnswer,
  SarvamRequest,
  SarvamTransport,
} from "./api.ts";

export type SarvamDeps = {
  sarvam: SarvamTransport;
  metrics: Metrics;
  report?: ((call: SarvamCall) => void) | undefined;
};

export type SarvamCall = {
  api: SarvamRequest["api"];
  model: string;
  language: string;
  outcome: Outcome;
  status: number | null;
  reason: string | null;
  units: Record<string, number>;
  seconds: number;
  placeholder: boolean;
};

export type SarvamResult<T> =
  | { ok: true; value: T; placeholder: boolean }
  | { ok: false; outcome: FailedOutcome; missing: boolean };

export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

export type Meter<T> = {
  parse: (body: unknown) => Parsed<T>;
  language: (value: T | undefined) => string | null;
  units: (body: unknown) => Record<string, number>;
};

export async function callSarvam<T>(
  { sarvam, metrics, report }: SarvamDeps,
  request: SarvamRequest,
  meter: Meter<T>,
  signal?: AbortSignal,
): Promise<SarvamResult<T>> {
  const start = performance.now();
  const answer = await sarvam.send(request, signal);
  const seconds = (performance.now() - start) / 1000;
  const parsed = answer.ok ? meter.parse(answer.body) : undefined;
  const result: SarvamResult<T> =
    answer.ok && parsed?.ok
      ? { ok: true, value: parsed.value, placeholder: answer.placeholder }
      : {
          ok: false,
          outcome: answer.ok ? "invalid" : answer.outcome,
          missing: !answer.ok && answer.missing,
        };
  const outcome = result.ok ? "ok" : result.outcome;
  const language = languageLabel(
    meter.language(result.ok ? result.value : undefined),
  );
  const billed =
    sarvam.mode === "live" &&
    answer.status !== null &&
    answer.status >= 200 &&
    answer.status < 300;
  const units = billed
    ? positive(meter.units(answer.ok ? answer.body : undefined))
    : {};
  const { api, model } = request;
  metrics.sarvamRequests.inc({ api, model, language, outcome });
  metrics.sarvamRequestDuration.observe({ api, model, language }, seconds);
  for (const [unit, amount] of Object.entries(units)) {
    metrics.sarvamBilledUnits.inc({ api, unit }, amount);
  }
  report?.({
    api,
    model,
    language,
    outcome,
    status: answer.status,
    reason: reasonOf(answer, parsed),
    units,
    seconds,
    placeholder: answer.ok && answer.placeholder,
  });
  return result;
}

export function languageLabel(language: string | null | undefined): string {
  if (language === null || language === undefined) return "unknown";
  return sarvamLanguageCodeSchema.safeParse(language).success
    ? language
    : "other";
}

function reasonOf(
  answer: SarvamAnswer,
  parsed: Parsed<unknown> | undefined,
): string | null {
  if (!answer.ok) return answer.missing ? "no saved answer" : answer.code;
  return parsed?.ok === false ? parsed.reason : null;
}

function positive(units: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(units).filter(([, amount]) => amount > 0),
  );
}
