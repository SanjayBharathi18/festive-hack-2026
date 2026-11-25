import { istDay } from "../../shared/day.ts";
import { orderPageSchema, type OrderPage } from "../../shared/orders.ts";
import {
  paymentResultAnswerSchema,
  type MockResult,
} from "../../shared/payments.ts";
import { createApi } from "../api/api.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { showAppBar } from "../buyer/app-bar.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { buyerHref } from "../cart/links.ts";
import { find } from "../dom/dom.ts";
import { messageTime } from "../order/order-status.ts";
import { createSounds } from "../sound/engine.ts";
import { leaveDelayMs } from "../sound/schedule.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { formatMoney } from "../text/format.ts";
import { loadText } from "../text/load-text.ts";
import { createWait } from "../wait/wait.ts";
import { failedLine, payState } from "./pay-state.ts";

const text = await loadText();
const sounds = createSounds({ store: storageOf(() => localStorage) });
bindSoundToggle(find(document, "#sound-toggle", HTMLButtonElement), sounds, {
  on: text.t("sound.on"),
  off: text.t("sound.off"),
});
bindLanguagePicker(
  find(document, "#language-picker", HTMLSelectElement),
  text.language,
);
const api = createApi();
const token = decodeURIComponent(location.pathname.split("/")[2] ?? "");
const orderPath = `/api/orders/${encodeURIComponent(token)}`;
const orderHref = buyerHref(`/o/${encodeURIComponent(token)}`, location.search);
const el = (id: string) => find(document, id, HTMLElement);
const payButton = find(document, "#pay-pay", HTMLButtonElement);
const failButton = find(document, "#pay-fail", HTMLButtonElement);
const loadWait = createWait({ control: el("#page"), line: el("#load-wait") });
const payWait = createWait({ control: payButton, line: el("#pay-wait") });
const failWait = createWait({ control: failButton, line: el("#pay-wait") });
const time = (at: number) => messageTime(at, istDay(Date.now()), text.language);
let waitsForPayment = false;

find(document, "#order-link", HTMLAnchorElement).href = orderHref;
el("#load-retry").addEventListener("click", () => void load());
payButton.addEventListener("click", () => void answer("pay"));
failButton.addEventListener("click", () => void answer("fail"));
void load();

async function load(): Promise<void> {
  el("#load-problem").hidden = true;
  try {
    show(
      await loadWait.run(
        (signal) => api.get(orderPath, orderPageSchema, { signal }),
        text.t("pay.loading"),
      ),
    );
  } catch (error) {
    el("#load-error").textContent = text.error(error, "pay");
    el("#load-problem").hidden = false;
  }
}

function show(order: OrderPage, failed = false): void {
  document.title = text.t("pay.page_title", {
    number: order.number,
    store: order.store.name,
  });
  showAppBar(document, order.store, location.search, text);
  waitsForPayment = order.status === "awaiting_payment";
  el("#pay").hidden = false;
  el("#pay-for").textContent = text.t("pay.for", {
    number: order.number,
    store: order.store.name,
  });
  el("#pay-amount").textContent = formatMoney(order.total);
  const state = payState(order, Date.now());
  el("#pay-actions").hidden = state.kind !== "payable";
  const status = el("#pay-status");
  switch (state.kind) {
    case "payable": {
      const due =
        state.payBy === null
          ? ""
          : text.t("pay.pay_by", { time: time(state.payBy) });
      status.textContent = failed
        ? text.t(`pay.${failedLine(order)}`, {
            time: state.payBy === null ? "" : time(state.payBy),
          })
        : due;
      break;
    }
    case "paid":
      status.textContent = text.t("pay.paid");
      break;
    case "expired":
      status.textContent = text.t("pay.expired");
      break;
    case "cancelled":
      status.textContent = text.t("pay.cancelled", { store: order.store.name });
      break;
    case "offline":
      status.textContent = text.t("pay.error.forbidden");
      break;
  }
}

async function answer(result: MockResult): Promise<void> {
  el("#pay-error").hidden = true;
  const wait = result === "pay" ? payWait : failWait;
  try {
    const answered = await wait.run(
      (signal) =>
        api.send(
          "POST",
          `/api/payments/mock/${encodeURIComponent(token)}/${result}`,
          {},
          paymentResultAnswerSchema,
          { signal },
        ),
      text.t(result === "pay" ? "pay.wait_pay" : "pay.wait_fail"),
    );
    if (answered.result === "paid") {
      // A prototype payment never sounds like money: it settles, or it
      // places the order that waited for it.
      if (waitsForPayment) sounds.placed();
      else sounds.settle();
      setTimeout(() => location.assign(orderHref), leaveDelayMs);
      return;
    }
    sounds.error();
    show(answered.order, true);
  } catch (error) {
    sounds.error();
    el("#pay-error").textContent = text.error(error, "pay");
    el("#pay-error").hidden = false;
  }
}
