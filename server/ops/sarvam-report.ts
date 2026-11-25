import {
  sarvamOutcomeSchema,
  type OpsSarvam,
  type OpsSarvamCalls,
  type SarvamOutcome,
} from "../../shared/ops.ts";
import type { Clock } from "../clock.ts";
import type { Config } from "../config.ts";
import type { Metrics } from "../metrics/metrics.ts";
import { sarvamApis, type SarvamTransport } from "../sarvam/api.ts";
import { summarizeRecordings, type Recording } from "../sarvam/recorded.ts";
import { publicAddress } from "./public-address.ts";

export type MetricValue = {
  labels: Partial<Record<string, string | number>>;
  value: number;
};

export type SarvamReportDeps = {
  config: Pick<Config, "SARVAM_API_KEY" | "SARVAM_BASE_URL">;
  metrics: Metrics;
  sarvam: Pick<SarvamTransport, "mode">;
  recordings: () => readonly Recording[];
  clock: Clock;
  startedAt: number;
};

export async function readSarvamReport(
  deps: SarvamReportDeps,
): Promise<OpsSarvam> {
  const [requests, billed] = await Promise.all([
    deps.metrics.sarvamRequests.get(),
    deps.metrics.sarvamBilledUnits.get(),
  ]);
  return {
    read_at: deps.clock.now(),
    started_at: deps.startedAt,
    mode: deps.sarvam.mode,
    api_key_set: deps.config.SARVAM_API_KEY !== undefined,
    base_url: publicAddress(deps.config.SARVAM_BASE_URL),
    recordings: recordingCounts(deps.recordings()),
    calls: callRows(requests.values),
    billed: billedRows(billed.values),
  };
}

export function recordingCounts(
  recordings: readonly Recording[],
): OpsSarvam["recordings"] {
  const byApi = Map.groupBy(recordings, ({ api }) => api);
  return {
    ...summarizeRecordings(recordings),
    by_api: sarvamApis.map((api) => {
      const { saved, placeholders } = summarizeRecordings(byApi.get(api) ?? []);
      return { api, saved, placeholders };
    }),
  };
}

export function callRows(values: readonly MetricValue[]): OpsSarvamCalls[] {
  const rows = new Map<string, OpsSarvamCalls>();
  for (const { labels, value } of values) {
    const api = String(labels.api ?? "unknown");
    const model = String(labels.model ?? "unknown");
    const key = `${api} ${model}`;
    const row = rows.get(key) ?? { api, model, calls: 0, outcomes: noCalls() };
    const outcome = sarvamOutcomeSchema.safeParse(labels.outcome);
    row.calls += value;
    if (outcome.success) row.outcomes[outcome.data] += value;
    rows.set(key, row);
  }
  return [...rows.values()]
    .filter(({ calls }) => calls > 0)
    .sort((a, b) => order(a.api) - order(b.api) || compare(a.model, b.model));
}

export function billedRows(
  values: readonly MetricValue[],
): OpsSarvam["billed"] {
  const rows = new Map<string, OpsSarvam["billed"][number]>();
  for (const { labels, value } of values) {
    const api = String(labels.api ?? "unknown");
    const unit = String(labels.unit ?? "unknown");
    const key = `${api} ${unit}`;
    const row = rows.get(key) ?? { api, unit, units: 0 };
    row.units += value;
    rows.set(key, row);
  }
  return [...rows.values()]
    .filter(({ units }) => units > 0)
    .sort((a, b) => order(a.api) - order(b.api) || compare(a.unit, b.unit));
}

function noCalls(): Record<SarvamOutcome, number> {
  return Object.fromEntries(
    sarvamOutcomeSchema.options.map((outcome) => [outcome, 0]),
  ) as Record<SarvamOutcome, number>;
}

function order(api: string): number {
  const index = (sarvamApis as readonly string[]).indexOf(api);
  return index === -1 ? sarvamApis.length : index;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
