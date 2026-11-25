import {
  daysResponseSchema,
  type CartLine,
  type DaysResponse,
} from "../../shared/store.ts";
import { isAbortError, type Api } from "../api/api.ts";

export type DayCheck = {
  check(cart: readonly CartLine[], options?: { delayMs?: number }): void;
  cancel(): void;
};

export const checkDelayMs = 150;
export const checkTimeoutMs = 10_000;

// The days follow the cart. A burst of steps sends one request, and only the
// answer for the newest cart reaches the page.
export function createDayCheck({
  api,
  storeId,
  onDays,
  onError,
}: {
  api: Pick<Api, "send">;
  storeId: string;
  onDays: (days: DaysResponse) => void;
  onError: (error: unknown) => void;
}): DayCheck {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: AbortController | undefined;

  async function run(cart: CartLine[]): Promise<void> {
    current?.abort();
    const controller = new AbortController();
    current = controller;
    try {
      const days = await api.send(
        "POST",
        "/api/days",
        { store_id: storeId, cart },
        daysResponseSchema,
        { signal: controller.signal, timeoutMs: checkTimeoutMs },
      );
      if (current === controller) onDays(days);
    } catch (error) {
      if (current === controller && !isAbortError(error)) onError(error);
    }
  }

  return {
    check(cart, { delayMs = checkDelayMs } = {}) {
      clearTimeout(timer);
      const lines = cart.map(({ pack_id, quantity }) => ({
        pack_id,
        quantity,
      }));
      timer = setTimeout(() => void run(lines), delayMs);
    },
    cancel() {
      clearTimeout(timer);
      current?.abort();
      current = undefined;
    },
  };
}
