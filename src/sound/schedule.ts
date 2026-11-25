export type Throttle = {
  readonly lastAt: number | undefined;
  readonly dueAt: number | undefined;
};
export type ThrottleStep = {
  readonly state: Throttle;
  readonly play: "now" | "later" | "merge";
  readonly at: number;
};

export const stepGapMs = 60;
export const maxLagMs = 160;
export const separateMs = 100;
export const fastRepeatMs = 250;
export const repeatStepDb = 2;
export const repeatFloorDb = -6;
export const levelJitterDb = 1;
export const arrivalQuietMs = 10_000;
export const heldArrivalMs = 350;
export const heroLandMs = 300;
export const startMarkMs = 130;
export const fadeMs = 20;
export const leaveDelayMs = 150;
export const maxVoices = 24;
export const frequentRenders = 3;
export const openThrottle: Throttle = { lastAt: undefined, dueAt: undefined };

/**
 * Steppers: notes stay `gapMs` apart. A note that comes too soon waits; later notes merge into
 * the waiting one, so the last quantity always plays, and the queue is never more than `gapMs` behind.
 */
export function throttle(
  state: Throttle,
  now: number,
  gapMs = stepGapMs,
): ThrottleStep {
  if (state.dueAt !== undefined) {
    return { state, play: "merge", at: state.dueAt };
  }
  if (state.lastAt === undefined || now - state.lastAt >= gapMs) {
    return { state: { lastAt: now, dueAt: undefined }, play: "now", at: now };
  }
  const at = state.lastAt + gapMs;
  return { state: { lastAt: state.lastAt, dueAt: at }, play: "later", at };
}

/** The waiting note played at `now`. */
export function fire(now: number): Throttle {
  return { lastAt: now, dueAt: undefined };
}

/** Fast repeats of one role get quieter, 2 dB at a time, down to −6 dB; a pause resets them. */
export function repeatDb(
  previousDb: number,
  sinceMs: number | undefined,
): number {
  if (sinceMs === undefined || sinceMs >= fastRepeatMs) return 0;
  return Math.max(repeatFloorDb, previousDb - repeatStepDb);
}

/** Separate sounds start at least 100 ms apart, but never more than 160 ms behind the hand. */
export function separationDelay(
  lastStartAt: number | undefined,
  now: number,
): number {
  if (lastStartAt === undefined) return 0;
  return Math.min(maxLagMs, Math.max(0, lastStartAt + separateMs - now));
}

/** One bell for each burst: another order within 10 s shows with no bell. */
export function arrivalRings(
  lastBellAt: number | undefined,
  now: number,
): boolean {
  return lastBellAt === undefined || now - lastBellAt >= arrivalQuietMs;
}

/**
 * The saved slip moves for 600 ms from `moveStartedAt`. A reply within 300 ms plays the hero from
 * that far in, so that its main hit (the stamp, 300 ms in) lands when the move is 97% done.
 */
export function heroOffsetMs(moveStartedAt: number, now: number): number {
  const elapsed = now - moveStartedAt;
  return elapsed > 0 && elapsed < heroLandMs ? elapsed : 0;
}

/** Over the cap, a new voice takes the place of the oldest voice of the same role, else the oldest. */
export function voiceToStop(
  playing: readonly string[],
  role: string,
  cap = maxVoices,
): number {
  if (playing.length <= cap) return -1;
  const same = playing.findIndex(
    (other, index) => other === role && index < playing.length - 1,
  );
  return same >= 0 ? same : 0;
}

/** The renders of a sound in turn, starting after the one played last. */
export function seedOrder(last: number | undefined, count: number): number[] {
  return Array.from(
    { length: count },
    (_, index) => ((last ?? -1) + 1 + index) % count,
  );
}

/** A level within ±1 dB, from a random number in [0, 1). */
export function levelVariationDb(random: number): number {
  return (random * 2 - 1) * levelJitterDb;
}
