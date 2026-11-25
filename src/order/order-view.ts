import { istDay } from "../../shared/day.ts";
import type { OrderPage } from "../../shared/orders.ts";
import { showAppBar } from "../buyer/app-bar.ts";
import { fillLineName } from "../buyer/line-name.ts";
import { buyerHref } from "../cart/links.ts";
import { packLabel } from "../cart/pack-label.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { formatMoney } from "../text/format.ts";
import type { Text, TextKey } from "../text/text.ts";
import {
  messageTime,
  payOffer,
  statusLine,
  statusStamp,
  tiltOf,
} from "./order-status.ts";

export type OrderView = { show(order: OrderPage): void };

// The order slip as the buyer sees it: the number, the day and the stamp,
// the status in words, the lines and the total, then where to get it; beside
// it, the simulated message log.
export function createOrderView(root: ParentNode, text: Text): OrderView {
  const el = (id: string) => find(root, id, HTMLElement);
  const lineTemplate = find(root, "#line-template", HTMLTemplateElement);
  const messageTemplate = find(root, "#message-template", HTMLTemplateElement);
  let shownStatus: string | undefined;

  // The one primary action is Pay online while it shows, else Message the store.
  const showPay = (order: OrderPage) => {
    const offer = payOffer(order);
    el("#pay-card").hidden = offer === "none";
    const payBy = order.payment.pay_by;
    el("#pay-line").textContent =
      offer === "required" && payBy !== null
        ? text.t("order.pay.by", {
            time: messageTime(payBy, istDay(Date.now()), text.language),
          })
        : text.t("order.pay.later");
  };

  return {
    show(order) {
      document.title = text.t("order.page_title", {
        number: order.number,
        store: order.store.name,
      });
      el("#order").hidden = false;
      showAppBar(root, order.store, location.search, text);
      const storeLink = find(root, "#store-back", HTMLAnchorElement);
      storeLink.textContent = text.t("order.store_link", {
        store: order.store.name,
      });
      storeLink.href = buyerHref(`/s/${order.store.slug}`, location.search);
      el("#order-number").textContent = String(order.number);
      el("#order-who").textContent = [
        text.day(order.day, "long"),
        order.buyer_name,
        text.t(
          order.fulfilment === "pickup" ? "order.pickup" : "order.delivery",
        ),
      ]
        .filter((part) => part !== null && part !== "")
        .join(" · ");
      el("#order-lines").replaceChildren(
        ...order.lines.map((line) => {
          const row = cloneTemplate(lineTemplate);
          fillLineName(row, line, text);
          find(row, ".line-amount", HTMLElement).textContent =
            `${line.quantity} × ${packLabel(line, text)}`;
          find(row, ".line-price", HTMLElement).textContent = formatMoney(
            line.quantity * line.price,
          );
          return row;
        }),
      );
      el("#order-total").textContent = formatMoney(order.total);

      el("#slip").style.setProperty("--tilt", tiltOf(order.number));
      const stamp = statusStamp(order.status);
      const status = el("#status-stamp");
      status.textContent = text.t(`order.stamp.${order.status}`);
      if (stamp.kind === "done") status.dataset.kind = "done";
      else delete status.dataset.kind;
      status.toggleAttribute("data-hand", stamp.hand);
      // Only a stamp that changed while the buyer looks lands; a load does not.
      status.toggleAttribute(
        "data-landing",
        shownStatus !== undefined && shownStatus !== order.status,
      );
      shownStatus = order.status;
      el("#paid-stamp").hidden = !order.paid;
      el("#refunded-stamp").hidden = !order.payment.refunded;
      showPay(order);

      const line = statusLine(order.status, order.fulfilment);
      const reason =
        order.status === "cancelled" && order.cancel_reason !== null
          ? ` ${text.t(`order.reason.${order.cancel_reason}`)}`
          : "";
      el("#status-line").textContent =
        text.t(`order.status.${line}` as TextKey, { store: order.store.name }) +
        reason;

      const pickup = order.store.pickup;
      el("#fact-pickup").hidden = pickup === null;
      el("#pickup-address").textContent =
        pickup?.address ?? text.t("order.pickup_ask");
      const map = find(root, "#map-link", HTMLAnchorElement);
      map.hidden = pickup?.map_url == null;
      if (pickup?.map_url) map.href = pickup.map_url;
      el("#fact-delivery").hidden = order.address === null;
      el("#delivery-address").textContent = order.address ?? "";
      el("#fact-gift").hidden = order.gift === null;
      el("#gift-text").textContent =
        order.gift === null
          ? ""
          : order.gift.message === null
            ? order.gift.name
            : text.t("order.gift_card", {
                name: order.gift.name,
                message: order.gift.message,
              });
      el("#fact-note").hidden = order.note === null;
      el("#note-text").textContent = order.note ?? "";
      const message = find(root, "#message-store", HTMLAnchorElement);
      message.href = order.store.message_url;
      message.className =
        payOffer(order) === "none" ? "btn-primary" : "btn-plain";

      const today = istDay(Date.now());
      const messages = [...order.messages].sort(
        (a, b) => b.created_at - a.created_at,
      );
      el("#messages").replaceChildren(
        ...messages.map((message) => {
          const row = cloneTemplate(messageTemplate);
          find(row, ".message-time", HTMLElement).textContent = messageTime(
            message.created_at,
            today,
            text.language,
          );
          const body = find(row, ".message-body", HTMLElement);
          body.textContent = message.body;
          body.lang = message.language;
          return row;
        }),
      );
      el("#messages-none").hidden = messages.length > 0;
    },
  };
}
