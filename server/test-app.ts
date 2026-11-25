import { createApp, type AppDeps } from "./app.ts";
import type { Clock } from "./clock.ts";
import { parseConfig } from "./config.ts";
import { openDatabase } from "./db/database.ts";
import { createDefaultFlags } from "./flags/default-flags.ts";
import { createLog } from "./log.ts";
import { createMetrics } from "./metrics/metrics.ts";
import { createRecordedTransport, savedRecordings } from "./sarvam/recorded.ts";

export type TestClock = Clock & { advance: (ms: number) => void };

export function createTestClock(start = Date.parse("2026-11-24T06:30:00Z")) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  } satisfies TestClock;
}

export function createTestApp(overrides: Partial<AppDeps> = {}) {
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    SARVAM_MODE: "recorded",
  });
  if (!parsed.ok) throw new Error("The test configuration is not valid.");
  const clock = overrides.clock ?? createTestClock();
  const lines: string[] = [];
  const deps: AppDeps = {
    config: parsed.config,
    db: openDatabase(":memory:"),
    clock,
    log: createLog((line) => lines.push(line), clock),
    metrics: createMetrics(),
    isShuttingDown: () => false,
    stopping: new AbortController().signal,
    flags: createDefaultFlags(),
    sarvam: createRecordedTransport(savedRecordings()),
    readPage: async () => undefined,
    ...overrides,
  };
  const logs = () =>
    lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { app: createApp(deps), deps, lines, logs };
}
