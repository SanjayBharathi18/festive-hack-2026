export type Watched = Pick<EventTarget, "addEventListener">;

// No live event carries quote requests or board posts, so the desk asks
// again when she comes back to it, and every few minutes while it shows. A
// focus right after the page shows asks only once.
export function keepFresh({
  load,
  everyMs,
  window,
  document,
  visible,
  signal,
  now = Date.now,
  minGapMs = 5000,
}: {
  load: () => void;
  everyMs: number;
  window: Watched;
  document: Watched;
  visible: () => boolean;
  signal: AbortSignal;
  now?: () => number;
  minGapMs?: number;
}): void {
  let last = now();
  const ask = () => {
    if (!visible() || now() - last < minGapMs) return;
    last = now();
    load();
  };
  window.addEventListener("focus", ask, { signal });
  document.addEventListener("visibilitychange", ask, { signal });
  const timer = setInterval(ask, everyMs);
  signal.addEventListener("abort", () => clearInterval(timer), { once: true });
}
