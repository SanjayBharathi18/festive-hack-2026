export type Visibility = {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
};

export type Timers = {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
};

export type Refresh = { load(): Promise<void> };

// How often a visible order page asks for its status, so that READY shows
// without a reload.
export const refreshEveryMs = 15_000;

// The order page fetches again every refreshEveryMs while the buyer can see
// it, and at once when she comes back to it, for example from the WhatsApp
// message. A hidden page does not fetch. Only the newest fetch may change
// the page.
export function createRefresh({
  visibility,
  load,
  timers = {
    setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
    clearTimeout: (timer) =>
      globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
  },
  everyMs = refreshEveryMs,
}: {
  visibility: Visibility;
  load: (signal: AbortSignal) => Promise<void>;
  timers?: Timers;
  everyMs?: number;
}): Refresh {
  let current: AbortController | undefined;
  let timer: unknown;
  const visible = () => visibility.visibilityState === "visible";

  const run = async () => {
    timers.clearTimeout(timer);
    current?.abort();
    const controller = new AbortController();
    current = controller;
    try {
      await load(controller.signal);
    } finally {
      if (current === controller && visible()) {
        timer = timers.setTimeout(() => void run(), everyMs);
      }
    }
  };
  visibility.addEventListener("visibilitychange", () => {
    if (visible()) void run();
    else timers.clearTimeout(timer);
  });
  return { load: run };
}
