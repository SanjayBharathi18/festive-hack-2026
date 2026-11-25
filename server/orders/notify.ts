import type { DeskSlip } from "../../shared/orders.ts";
import type { EventHub } from "../events/hub.ts";
import type { Log } from "../log.ts";
import { hasConsent, type Messenger } from "../messages/sender.ts";
import type { TemplateName } from "../messages/templates.ts";
import type { Translator } from "../translate/translator.ts";
import type { OrderRecord } from "./order-data.ts";
import { deskSlip } from "./order-view.ts";

export type Notify = ReturnType<typeof createNotify>;

export function createNotify({
  messenger,
  events,
  log,
  publicUrl,
  translator,
}: {
  messenger: Messenger;
  events: EventHub;
  log: Log;
  publicUrl: string;
  translator?: Pick<Translator, "cached" | "knownNames"> | undefined;
}) {
  const slip = (order: OrderRecord): DeskSlip => ({
    ...deskSlip(order, messenger.log(order.id), publicUrl),
    note_translation:
      translator?.cached(order.note, order.store.sellerLanguage) ?? null,
  });
  const message = (order: OrderRecord, template: TemplateName | null) => {
    if (template === null || !hasConsent(order)) return;
    try {
      const names = translator?.knownNames(
        order.lines.map(dishOf),
        order.buyerLanguage ?? "en",
      );
      messenger.send(order, template, names);
    } catch (error) {
      log({
        msg: "the simulated message was not saved",
        order_id: order.id,
        template,
        error: String(error),
      });
    }
  };
  return {
    slip,
    created: (order: OrderRecord, template: TemplateName | null): DeskSlip => {
      message(order, template);
      const created = slip(order);
      events.publish(order.storeId, { type: "order_created", order: created });
      return created;
    },
    changed: (order: OrderRecord, template: TemplateName | null): DeskSlip => {
      message(order, template);
      const changed = slip(order);
      events.publish(order.storeId, { type: "order_changed", order: changed });
      return changed;
    },
  };
}

export function dishOf(line: OrderRecord["lines"][number]) {
  return { id: line.item_id, name: line.name, name_latin: line.name_latin };
}
