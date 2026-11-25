export type Repeat = {
  press(): void;
  release(): void;
  takeRepeated(): boolean;
};

export const holdDelayMs = 400;
export const repeatEveryMs = 100;

// Holding a stepper repeats the step. A tap steps once, on the click that the
// lifted finger makes. After a hold, that click must not add one more step.
export function createRepeat(
  step: () => boolean,
  { delayMs = holdDelayMs, everyMs = repeatEveryMs } = {},
): Repeat {
  let delay: ReturnType<typeof setTimeout> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let forget: ReturnType<typeof setTimeout> | undefined;
  let repeated = false;

  const stop = () => {
    clearTimeout(delay);
    clearInterval(ticker);
    delay = undefined;
    ticker = undefined;
  };

  return {
    press() {
      stop();
      clearTimeout(forget);
      repeated = false;
      delay = setTimeout(() => {
        delay = undefined;
        repeated = true;
        if (!step()) return;
        ticker = setInterval(() => {
          if (!step()) stop();
        }, everyMs);
      }, delayMs);
    },
    release() {
      stop();
      // The click of this lift comes in the same task. A later click is new.
      clearTimeout(forget);
      forget = setTimeout(() => {
        repeated = false;
      }, 0);
    },
    takeRepeated() {
      const was = repeated;
      repeated = false;
      return was;
    },
  };
}
