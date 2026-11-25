export type WaitControl = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

export type WaitSlot = { textContent: string | null };

export type WaitLine = {
  querySelector(selectors: string): WaitSlot | null;
};

export type WaitPhase = "idle" | "busy" | "progress";

export type Work<T> = (
  signal: AbortSignal,
  progress: (words: string) => void,
) => Promise<T>;

export type RunOptions = { restart?: boolean | undefined };

export type Wait = {
  readonly phase: WaitPhase;
  readonly running: boolean;
  run<T>(work: Work<T>, words: string, options?: RunOptions): Promise<T>;
  cancel(): void;
};

export const busyAfterMs = 300;
export const wordsAfterMs = 1000;

export function createWait({
  control,
  line,
}: {
  control: WaitControl;
  line?: WaitLine | null | undefined;
}): Wait {
  const wordsSlot = line?.querySelector("[role=status]") ?? undefined;
  const secondsSlot = line?.querySelector(".num") ?? undefined;
  let phase: WaitPhase = "idle";
  let current: { cancel: () => void } | undefined;

  const show = (next: WaitPhase, words = "", seconds = 0) => {
    phase = next;
    if (next === "idle") control.removeAttribute("aria-busy");
    else control.setAttribute("aria-busy", "true");
    if (wordsSlot) wordsSlot.textContent = next === "progress" ? words : "";
    if (secondsSlot) {
      secondsSlot.textContent = next === "progress" ? `· ${seconds} s` : "";
    }
  };

  return {
    get phase() {
      return phase;
    },
    get running() {
      return current !== undefined;
    },
    async run(work, words, { restart = false } = {}) {
      if (current !== undefined && !restart) {
        throw new DOMException("A wait is already running.", "AbortError");
      }
      current?.cancel();
      const controller = new AbortController();
      const startedAt = Date.now();
      let label = words;
      let ticker: ReturnType<typeof setInterval> | undefined;
      let settled = false;
      const showProgress = () =>
        show("progress", label, Math.round((Date.now() - startedAt) / 1000));
      const timers = [
        setTimeout(() => show("busy"), busyAfterMs),
        setTimeout(() => {
          showProgress();
          ticker = setInterval(showProgress, 1000);
        }, wordsAfterMs),
      ];
      const settle = () => {
        if (settled) return;
        settled = true;
        for (const timer of timers) clearTimeout(timer);
        clearInterval(ticker);
        if (current === self) current = undefined;
        if (phase !== "idle") show("idle");
      };
      const self = {
        cancel() {
          settle();
          controller.abort();
        },
      };
      current = self;
      try {
        return await untilAborted(
          work(controller.signal, (next) => {
            if (settled) return;
            label = next;
            if (phase === "progress") showProgress();
          }),
          controller.signal,
        );
      } finally {
        settle();
      }
    },
    cancel() {
      current?.cancel();
    },
  };
}

function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}
