import type { AlertState, OpsLanguage } from "../../shared/ops.ts";
import type { Clock } from "../clock.ts";
import type { Metrics } from "../metrics/metrics.ts";

export type Tally = { readings: number; invalid: number };
export type Counts = ReadonlyMap<string, Tally>;
export type Snapshot = { at: number; counts: Counts };

// ReadingInvalidRateHigh in deploy/prometheus-rules.yaml: over 2 minutes, for
// one language, invalid readings are more than 30% of 5 readings or more, and
// the alert fires when that holds for 2 minutes.
export const alertRule = {
  name: "ReadingInvalidRateHigh",
  windowMs: 2 * 60_000,
  holdMs: 2 * 60_000,
  invalidShare: 0.3,
  minReadings: 5,
} as const;

export const sampleMs = 5_000;
export const segmentLanguages = ["kn-IN", "hi-IN", "en-IN"] as const;

export type ReadingWindow = ReturnType<typeof createReadingWindow>;

export function createReadingWindow({
  metrics,
  clock,
}: {
  metrics: Metrics;
  clock: Clock;
}) {
  const snapshots: Snapshot[] = [];
  const heldSince = new Map<string, number>();
  let languages: OpsLanguage[] = [];

  return {
    // One evaluation, like one Prometheus rule evaluation: read the counter,
    // keep the samples of the window, and move the alert state on.
    sample: async (): Promise<Counts> => {
      const counts = await readingCounts(metrics);
      const at = clock.now();
      snapshots.push({ at, counts });
      pruneSnapshots(snapshots, at - alertRule.windowMs);
      const increase = windowIncrease(snapshots, at, alertRule.windowMs);
      const names = new Set<string>(segmentLanguages);
      for (const [language, { readings }] of increase) {
        if (readings > 0) names.add(language);
      }
      languages = [...names].map((language) => {
        const tally = increase.get(language) ?? { readings: 0, invalid: 0 };
        const fires = wouldFire(tally);
        if (!fires) heldSince.delete(language);
        else if (!heldSince.has(language)) heldSince.set(language, at);
        const since = heldSince.get(language);
        const heldMs = since === undefined ? 0 : at - since;
        return {
          language,
          readings: tally.readings,
          invalid: tally.invalid,
          invalid_rate:
            tally.readings === 0 ? null : tally.invalid / tally.readings,
          would_fire: fires,
          held_seconds: Math.floor(heldMs / 1000),
          state: alertState(fires, heldMs),
        };
      });
      return counts;
    },
    languages: (): OpsLanguage[] => languages,
  };
}

export async function readingCounts(metrics: Metrics): Promise<Counts> {
  const { values } = await metrics.readingResults.get();
  const counts = new Map<string, Tally>();
  for (const { labels, value } of values) {
    const language = String(labels.language ?? "unknown");
    const tally = counts.get(language) ?? { readings: 0, invalid: 0 };
    tally.readings += value;
    if (labels.outcome === "invalid") tally.invalid += value;
    counts.set(language, tally);
  }
  return counts;
}

export function wouldFire({ readings, invalid }: Tally): boolean {
  return (
    readings >= alertRule.minReadings &&
    invalid / readings > alertRule.invalidShare
  );
}

export function alertState(fires: boolean, heldMs: number): AlertState {
  if (!fires) return "inactive";
  return heldMs >= alertRule.holdMs ? "firing" : "pending";
}

// The increase of each language between the newest sample and the newest
// sample at least windowMs older, or the oldest sample when the server is
// younger than the window.
export function windowIncrease(
  snapshots: readonly Snapshot[],
  now: number,
  windowMs: number,
): Map<string, Tally> {
  const latest = snapshots.at(-1);
  if (latest === undefined) return new Map();
  const start =
    snapshots.findLast(({ at }) => at <= now - windowMs) ?? snapshots[0];
  return difference(latest.counts, start?.counts ?? new Map());
}

export function difference(later: Counts, earlier: Counts): Map<string, Tally> {
  const increase = new Map<string, Tally>();
  for (const [language, tally] of later) {
    const before = earlier.get(language) ?? { readings: 0, invalid: 0 };
    increase.set(language, {
      readings: tally.readings - before.readings,
      invalid: tally.invalid - before.invalid,
    });
  }
  return increase;
}

export function pruneSnapshots(snapshots: Snapshot[], cut: number): void {
  const start = snapshots.findLastIndex(({ at }) => at <= cut);
  if (start > 0) snapshots.splice(0, start);
}
