import { undoWindowMs } from "../../shared/orders.ts";

export type AfterUndo<T> = ReturnType<typeof createAfterUndo<T>>;

type Pending<T> = { value: T; timer: ReturnType<typeof setTimeout> };

// Work that waits for the end of the undo window of the desk, so that an
// undone step has no effect: a newer schedule for the same key starts the
// wait again, a cancel drops it, and a stopping server runs all that waits.
export function createAfterUndo<T>({
  stopping,
  run,
  waitMs = undoWindowMs,
}: {
  stopping: AbortSignal;
  run: (key: string, value: T) => void;
  waitMs?: number;
}) {
  const pending = new Map<string, Pending<T>>();

  const fire = (key: string) => {
    const entry = pending.get(key);
    if (entry === undefined) return;
    clearTimeout(entry.timer);
    pending.delete(key);
    run(key, entry.value);
  };
  const cancel = (key: string): boolean => {
    const entry = pending.get(key);
    clearTimeout(entry?.timer);
    return pending.delete(key);
  };
  stopping.addEventListener(
    "abort",
    () => {
      for (const key of [...pending.keys()]) fire(key);
    },
    { once: true },
  );

  return {
    schedule(key: string, value: T): void {
      cancel(key);
      if (stopping.aborted) {
        run(key, value);
        return;
      }
      const timer = setTimeout(() => fire(key), waitMs);
      timer.unref?.();
      pending.set(key, { value, timer });
    },
    cancel,
    pending: () => pending.size,
  };
}
