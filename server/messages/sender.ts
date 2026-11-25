import { randomUUID } from "node:crypto";
import type { OrderSource } from "../../shared/model.ts";
import type { OrderMessage } from "../../shared/orders.ts";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";
import { buyerLines, orderUrl, waLink, type MessageOrder } from "./links.ts";
import { renderMessage, type TemplateName } from "./templates.ts";

export type Messenger = {
  // names: the dish names in the buyer's script, by item id, when known.
  send: (
    order: MessageOrder,
    template: TemplateName,
    names?: ReadonlyMap<string, string>,
  ) => OrderMessage | undefined;
  log: (orderId: string) => OrderMessage[];
};

export function createMessenger({
  db,
  clock,
  publicUrl,
}: {
  db: Db;
  clock: Clock;
  publicUrl: string;
}): Messenger {
  const insert = db.prepare(
    `INSERT INTO messages (id, order_id, to_phone, template, language, body, channel, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?)`,
  );
  const select = db.prepare(
    "SELECT template, language, body, channel, created_at FROM messages WHERE order_id = ? ORDER BY created_at, rowid",
  );
  return {
    send: (order, template, names) => {
      if (!hasConsent(order)) return undefined;
      const language = order.buyerLanguage ?? "en";
      const body = renderMessage(template, language, {
        store: order.store.name,
        number: order.number,
        lines: buyerLines(order.lines, language, names),
        total: order.total,
        day: order.day,
        fulfilment: order.fulfilment,
        pickupAddress:
          order.fulfilment === "pickup" ? order.store.address : null,
        orderUrl: orderUrl(publicUrl, order.token),
        storeChatUrl: waLink(order.store.sellerPhone),
        reason: order.cancelReason,
      });
      const createdAt = clock.now();
      insert.run(
        randomUUID(),
        order.id,
        order.buyerPhone,
        template,
        language,
        body,
        createdAt,
      );
      return {
        template,
        language,
        body,
        channel: "simulated",
        created_at: createdAt,
      };
    },
    log: (orderId) => select.all(orderId) as OrderMessage[],
  };
}

export function hasConsent(order: {
  source: OrderSource;
  buyerPhone: string | null;
}): order is { source: OrderSource; buyerPhone: string } {
  return (
    (order.source === "link" || order.source === "marketplace") &&
    order.buyerPhone !== null
  );
}
