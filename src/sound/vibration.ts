import type { Cue } from "./sounds.ts";

export type Vibrate = (pattern: number[]) => boolean;
export type Vibration = { buzz(pattern: readonly number[]): void };

const recordBuzz = buzzes(1, 15, 0);
const savedBuzz = buzzes(3, 20, 60);
const arrivalBuzz = buzzes(2, 40, 80);
const quoteBuzz = buzzes(1, 40, 0);

/** Android only, because other phones and laptops have no vibration in the browser. */
export function createVibration({
  userAgent,
  vibrate,
}: {
  userAgent: string;
  vibrate: Vibrate | undefined;
}): Vibration {
  const allowed = vibrate !== undefined && isAndroid(userAgent);
  return {
    buzz(pattern) {
      if (allowed) vibrate([...pattern]);
    },
  };
}

/** The buzz count matches the sound: record start and stop, order saved, and arrival. */
export function patternFor(cue: Cue): readonly number[] | undefined {
  if (cue.role === "record") return recordBuzz;
  if (cue.role === "saved") return savedBuzz;
  if (cue.role === "arrival") {
    return cue.params.kind === "quote" ? quoteBuzz : arrivalBuzz;
  }
  return undefined;
}

/** `count` buzzes of `ms`, their starts `apartMs` apart, as a navigator.vibrate pattern. */
export function buzzes(count: number, ms: number, apartMs: number): number[] {
  return Array.from({ length: count * 2 - 1 }, (_, index) =>
    index % 2 === 0 ? ms : apartMs - ms,
  );
}

export function isAndroid(userAgent: string): boolean {
  return /\bAndroid\b/i.test(userAgent);
}
