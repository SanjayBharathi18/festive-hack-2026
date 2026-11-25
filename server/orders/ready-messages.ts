import type { Log } from "../log.ts";
import { hasConsent, type Messenger } from "../messages/sender.ts";
import { createAfterUndo } from "./after-undo.ts";
import type { Notify } from "./notify.ts";
import type { OrderData } from "./order-data.ts";

export type ReadyMessages = ReturnType<typeof createReadyMessages>;

export function createReadyMessages({
  stopping,
  orders,
  messenger,
  notify,
  log,
}: {
  stopping: AbortSignal;
  orders: OrderData;
  messenger: Messenger;
  notify: Notify;
  log: Log;
}) {
  const send = (storeId: string, orderId: string) => {
    try {
      const order = orders.byId(storeId, orderId);
      if (order?.status !== "ready" || !hasConsent(order)) return;
      const sent = messenger
        .log(orderId)
        .some((message) => message.template === "order_ready");
      if (!sent) notify.changed(order, "order_ready");
    } catch (error) {
      log({
        msg: "the READY message was not sent",
        order_id: orderId,
        error: String(error),
      });
    }
  };
  const waiting = createAfterUndo<string>({
    stopping,
    run: (orderId, storeId) => send(storeId, orderId),
  });

  return {
    schedule: (storeId: string, orderId: string) =>
      waiting.schedule(orderId, storeId),
    cancel: (orderId: string) => void waiting.cancel(orderId),
    pending: waiting.pending,
  };
}
