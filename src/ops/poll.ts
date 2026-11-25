export type Visibility = {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
};

export type Timers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
};

export type Poll = { now: () => Promise<void> };

// Loads at once, then again everyMs after each load ends, while the page is
// visible. A hidden page does not poll. Only the newest load may finish.
export function createPoll({
  load,
  everyMs,
  visibility,
  timers = {
    set: (run, ms) => setTimeout(run, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
}: {
  load: (signal: AbortSignal) => Promise<void>;
  everyMs: number;
  visibility: Visibility;
  timers?: Timers;
}): Poll {
  let timer: unknown;
  let current: AbortController | undefined;

  const run = async (): Promise<void> => {
    if (timer !== undefined) timers.clear(timer);
    timer = undefined;
    current?.abort();
    const controller = new AbortController();
    current = controller;
    try {
      await load(controller.signal);
    } finally {
      if (current === controller && visibility.visibilityState === "visible") {
        timer = timers.set(() => void run(), everyMs);
      }
    }
  };

  visibility.addEventListener("visibilitychange", () => {
    if (visibility.visibilityState === "visible") {
      void run();
      return;
    }
    current?.abort();
    if (timer !== undefined) timers.clear(timer);
    timer = undefined;
  });
  return { now: run };
}
