import { isAbortError } from "../api/api.ts";
import type { Wait } from "../wait/wait.ts";

export type SearchRuns = { now(): void; soon(): void };

export type Timers = {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
};

export const typingDelayMs = 300;

// Each search replaces the one before it, so only the newest answer shows.
// Typing waits a moment first, so the page does not search for each letter.
export function createSearchRuns<T>({
  wait,
  words,
  read,
  onAnswer,
  onError,
  timers = {
    setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
    clearTimeout: (timer) =>
      globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
  },
  delayMs = typingDelayMs,
}: {
  wait: Pick<Wait, "run">;
  words: string;
  read: (signal: AbortSignal) => Promise<T>;
  onAnswer: (answer: T) => void;
  onError: (error: unknown) => void;
  timers?: Timers;
  delayMs?: number;
}): SearchRuns {
  let timer: unknown;

  const now = () => {
    timers.clearTimeout(timer);
    wait.run(read, words, { restart: true }).then(onAnswer, (error) => {
      if (!isAbortError(error)) onError(error);
    });
  };

  return {
    now,
    soon() {
      timers.clearTimeout(timer);
      timer = timers.setTimeout(now, delayMs);
    },
  };
}
