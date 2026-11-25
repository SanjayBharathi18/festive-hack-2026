import { orderPageSchema } from "../../shared/orders.ts";
import { paymentStartAnswerSchema } from "../../shared/payments.ts";
import { createApi } from "../api/api.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { buyerHref, withLanguage } from "../cart/links.ts";
import { find } from "../dom/dom.ts";
import { createSounds } from "../sound/engine.ts";
import { leaveWithSound } from "../sound/leave.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";
import { createWait } from "../wait/wait.ts";
import { createRefresh } from "./order-refresh.ts";
import { createOrderView } from "./order-view.ts";

const text = await loadText();
for (const template of document.querySelectorAll("template")) {
  text.apply(template.content);
}
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
const message = find(document, "#message-store", HTMLAnchorElement);
message.addEventListener("click", (event) =>
  leaveWithSound(event, message, () => sounds.commit()),
);
const view = createOrderView(document, text);
const wait = createWait({
  control: find(document, "#page", HTMLElement),
  line: find(document, "#load-wait", HTMLElement),
});
const problem = find(document, "#load-problem", HTMLElement);
const orderPath = withLanguage(
  `/api/orders/${encodeURIComponent(token)}`,
  text.language,
);
let shown = false;

const refresh = createRefresh({
  visibility: document,
  async load(signal) {
    try {
      const order = await (shown
        ? api.get(orderPath, orderPageSchema, { signal })
        : wait.run(
            (inner) =>
              api.get(orderPath, orderPageSchema, {
                signal: AbortSignal.any([signal, inner]),
              }),
            text.t("order.loading"),
          ));
      problem.hidden = true;
      view.show(order);
      shown = true;
    } catch (error) {
      const words = text.error(error, "order");
      if (words === "") return;
      find(document, "#load-error", HTMLElement).textContent = words;
      problem.hidden = false;
    }
  },
});

find(document, "#load-retry", HTMLButtonElement).addEventListener(
  "click",
  () => void refresh.load(),
);
void refresh.load();

const payButton = find(document, "#pay-online", HTMLButtonElement);
const payError = find(document, "#pay-error", HTMLElement);
const payWait = createWait({
  control: payButton,
  line: find(document, "#pay-wait", HTMLElement),
});
payButton.addEventListener("click", () => void startPayment());

async function startPayment(): Promise<void> {
  payError.hidden = true;
  try {
    const started = await payWait.run(
      (signal) =>
        api.send(
          "POST",
          `/api/payments/${encodeURIComponent(token)}/start`,
          {},
          paymentStartAnswerSchema,
          { signal },
        ),
      text.t("order.pay.wait"),
    );
    if (started.pay_url === null) await refresh.load();
    else location.assign(buyerHref(started.pay_url, location.search));
  } catch (error) {
    sounds.error();
    payError.textContent = text.error(error, "order");
    payError.hidden = payError.textContent === "";
  }
}
