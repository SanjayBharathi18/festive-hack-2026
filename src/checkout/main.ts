import { daySchema, type Day } from "../../shared/day.ts";
import { paymentStartAnswerSchema } from "../../shared/payments.ts";
import type { Fulfilment } from "../../shared/model.ts";
import {
  daysResponseSchema,
  storePageSchema,
  type StorePage,
} from "../../shared/store.ts";
import { createApi, isApiError } from "../api/api.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { showAppBar } from "../buyer/app-bar.ts";
import {
  cartCount,
  dayCheckLines,
  menuPacks,
  reconcile,
  withDay,
  type Cart,
} from "../cart/cart.ts";
import { createCartStorage, storageOf } from "../cart/cart-storage.ts";
import { buyerHref, viaOf, withLanguage } from "../cart/links.ts";
import { find } from "../dom/dom.ts";
import { cartNotice } from "../cart/cart-notice.ts";
import { createSounds } from "../sound/engine.ts";
import { leaveDelayMs } from "../sound/schedule.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";
import { createWait } from "../wait/wait.ts";
import { createCheckoutFlow } from "./checkout-flow.ts";
import { createCheckoutStorage, type Draft } from "./checkout-storage.ts";
import { isCode, isPhone, orderBody } from "./order-body.ts";
import { orderProblem } from "./order-problem.ts";
import { paymentChoice, paysNow, type PaymentPick } from "./payment-choice.ts";
import { showSummary } from "./summary-view.ts";

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
const slug = decodeURIComponent(location.pathname.split("/")[2] ?? "");
const via = viaOf(location.search);
const carts = createCartStorage(storageOf(() => localStorage));
const forms = createCheckoutStorage({
  phone: storageOf(() => localStorage),
  tab: storageOf(() => sessionStorage),
});
const loadWait = createWait({
  control: find(document, "#page", HTMLElement),
  line: find(document, "#load-wait", HTMLElement),
});
const loadProblem = find(document, "#load-problem", HTMLElement);
const storeLink = (hash = "") =>
  buyerHref(`/s/${slug}`, location.search, { hash });

find(document, "#load-retry", HTMLButtonElement).addEventListener(
  "click",
  () => void load(),
);
void load();

async function load(): Promise<void> {
  loadProblem.hidden = true;
  try {
    start(await fetchStore());
  } catch (error) {
    find(document, "#load-error", HTMLElement).textContent = text.error(
      error,
      "checkout",
    );
    loadProblem.hidden = false;
  }
}

function fetchStore(): Promise<StorePage> {
  return loadWait.run(
    (signal) =>
      api.get(
        withLanguage(`/api/stores/${encodeURIComponent(slug)}`, text.language),
        storePageSchema,
        { signal },
      ),
    text.t("checkout.loading"),
  );
}

function start(first: StorePage): void {
  let page = first;
  let packs = menuPacks(page.sections);
  const kept = reconcile(carts.load(slug), packs);
  let cart: Cart = kept.cart;
  const asked = daySchema.safeParse(
    new URLSearchParams(location.search).get("day"),
  );
  let day: Day | null = asked.success
    ? asked.data
    : cart.picked_by === null
      ? page.days.next_free_day
      : cart.day;

  const form = find(document, "#form", HTMLFormElement);
  const submit = find(document, "#submit", HTMLButtonElement);
  const formError = find(document, "#form-error", HTMLElement);
  const notice = find(document, "#cart-notice", HTMLElement);
  const dayProblem = find(document, "#day-problem", HTMLElement);
  const useNextDay = find(document, "#use-next-day", HTMLButtonElement);
  const delivery = find(document, "#delivery", HTMLFieldSetElement);
  const giftOn = find(document, "#gift-on", HTMLInputElement);
  const giftFields = find(document, "#gift-fields", HTMLFieldSetElement);
  const codeStep = find(document, "#code-step", HTMLElement);
  const codeInput = find(document, "#code", HTMLInputElement);
  const phoneInput = find(document, "#phone", HTMLInputElement);
  const giftPhone = find(document, "#gift-phone", HTMLInputElement);
  const nameInput = find(document, "#buyer-name", HTMLInputElement);
  const verified = find(document, "#verified", HTMLElement);
  const field = (name: string) => {
    const element = form.elements.namedItem(name);
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return element;
    }
    throw new Error(`The form has no field ${name}.`);
  };
  const flow = createCheckoutFlow({
    api,
    kept: forms.check(slug),
    onKeep: (kept) => forms.saveCheck(slug, kept),
  });
  const wait = createWait({
    control: submit,
    line: find(document, "#submit-wait", HTMLElement),
  });

  document.title = text.t("checkout.page_title", { store: page.store.name });
  find(document, "#checkout", HTMLElement).hidden = false;
  find(document, "#back-link", HTMLAnchorElement).textContent = text.t(
    "checkout.back",
    {
      store: page.store.name,
    },
  );
  find(document, "#back-link", HTMLAnchorElement).href = storeLink();
  find(document, "#empty-back", HTMLAnchorElement).textContent = text.t(
    "checkout.back",
    {
      store: page.store.name,
    },
  );
  find(document, "#empty-back", HTMLAnchorElement).href = storeLink();
  find(document, "#change-day", HTMLAnchorElement).href = storeLink("#day");
  find(document, "#summary-store", HTMLElement).textContent = page.store.name;
  showAppBar(document, page.store, location.search, text);
  find(document, "#pickup-from", HTMLElement).textContent =
    page.store.area === null
      ? text.t("checkout.pickup_home")
      : text.t("checkout.pickup_from", { area: page.store.area });
  find(document, "#consent-words", HTMLElement).textContent = text.t(
    "checkout.consent_named",
    { product: text.t("common.product") },
  );
  showNotice(cartNotice(kept.changes, text));
  showPayment();
  showWays();
  render();
  restore();
  void checkDay();

  function render(): void {
    const empty = cartCount(cart) === 0;
    find(document, "#empty", HTMLElement).hidden = !empty;
    find(document, "#summary", HTMLElement).hidden = empty;
    form.hidden = empty;
    showSummary({
      lines: find(document, "#summary-lines", HTMLElement),
      total: find(document, "#summary-total", HTMLElement),
      day: find(document, "#summary-day", HTMLElement),
      template: find(document, "#line-template", HTMLTemplateElement),
      cart,
      packs,
      orderDay: day,
      text,
    });
  }

  function showPayment(): void {
    const choice = paymentChoice(page.store, via);
    find(document, "#payment", HTMLElement).hidden = choice === "none";
    find(document, "#payment-ways", HTMLFieldSetElement).disabled =
      choice !== "optional";
    find(document, "#payment-ways", HTMLFieldSetElement).hidden =
      choice !== "optional";
    const required = find(document, "#payment-required", HTMLElement);
    required.hidden = choice !== "required";
    required.textContent = text.t("checkout.payment.required", {
      store: page.store.name,
    });
  }

  function chosenPayment(): PaymentPick | null {
    const checked = form.querySelector<HTMLInputElement>(
      "[name=payment]:checked",
    );
    return checked?.value === "now" || checked?.value === "later"
      ? checked.value
      : null;
  }

  function payingNow(): boolean {
    return paysNow(paymentChoice(page.store, via), chosenPayment());
  }

  function showNotice(words: string): void {
    notice.textContent = words;
    notice.hidden = words === "";
  }

  function showWays(): void {
    const { offers_pickup: pickup, offers_delivery: deliver } = page.store;
    find(document, "#way-pickup", HTMLElement).hidden = !pickup;
    find(document, "#way-delivery", HTMLElement).hidden = !deliver;
    for (const input of form.querySelectorAll<HTMLInputElement>(
      "[name=fulfilment]",
    )) {
      input.disabled = input.value === "pickup" ? !pickup : !deliver;
      if (input.disabled) input.checked = false;
    }
    if (pickup !== deliver) checkWay(pickup ? "pickup" : "delivery");
    toggleDelivery();
  }

  function checkWay(way: Fulfilment): void {
    const input = form.querySelector<HTMLInputElement>(
      `[name=fulfilment][value=${way}]`,
    );
    if (input !== null && !input.disabled) input.checked = true;
  }

  function chosenWay(): Fulfilment | null {
    const checked = form.querySelector<HTMLInputElement>(
      "[name=fulfilment]:checked",
    );
    return checked?.value === "pickup" || checked?.value === "delivery"
      ? checked.value
      : null;
  }

  function toggleDelivery(): void {
    const on = chosenWay() === "delivery";
    delivery.hidden = !on;
    delivery.disabled = !on;
    giftFields.hidden = !giftOn.checked;
    giftFields.disabled = !giftOn.checked;
  }

  function draft(): Draft {
    return {
      fulfilment: chosenWay(),
      address: field("address").value,
      gift: giftOn.checked,
      gift_name: field("gift_name").value,
      gift_phone: giftPhone.value,
      gift_message: field("gift_message").value,
      note: field("note").value,
      buyer_name: nameInput.value,
      phone: phoneInput.value,
      payment: chosenPayment(),
    };
  }

  // What she typed in this tab comes back first; else the name and number
  // of her last order on this phone.
  function restore(): void {
    const saved = forms.draft(slug);
    if (saved.fulfilment !== null) checkWay(saved.fulfilment);
    field("address").value = saved.address;
    giftOn.checked = saved.gift;
    field("gift_name").value = saved.gift_name;
    giftPhone.value = saved.gift_phone;
    field("gift_message").value = saved.gift_message;
    field("note").value = saved.note;
    if (saved.payment !== null) checkPayment(saved.payment);
    const buyer = forms.buyer();
    nameInput.value = saved.buyer_name || (buyer?.name ?? "");
    phoneInput.value = saved.phone || (buyer?.phone ?? "");
    flow.phoneChanged(phoneInput.value);
    toggleDelivery();
    showStep();
  }

  function checkPayment(pick: PaymentPick): void {
    const input = form.querySelector<HTMLInputElement>(
      `[name=payment][value=${pick}]`,
    );
    if (input !== null && !input.disabled) input.checked = true;
  }

  async function checkDay(): Promise<void> {
    if (cartCount(cart) === 0) return;
    try {
      const days = await api.send(
        "POST",
        "/api/days",
        { store_id: page.store.id, cart: dayCheckLines(cart) },
        daysResponseSchema,
      );
      const check = days.days.find((option) => option.day === day);
      if (day === null || check?.fits !== true) {
        showDayProblem(
          check?.reason === "closed" ? "closed" : "full",
          days.next_free_day,
        );
      }
    } catch (error) {
      console.error("The days of the cart could not be checked.", error);
    }
  }

  function showDayProblem(
    reason: "full" | "closed" | "past",
    next: Day | null,
  ): void {
    const words =
      day === null
        ? ""
        : reason === "past"
          ? text.t("checkout.day_past")
          : text.t(
              reason === "closed" ? "checkout.day_closed" : "checkout.day_full",
              {
                day: text.day(day, "long"),
              },
            );
    const then =
      next === null
        ? text.t("checkout.day_none")
        : text.t("checkout.day_next", { day: text.day(next, "long") });
    find(document, "#day-problem-text", HTMLElement).textContent =
      `${words} ${then}`.trim();
    useNextDay.hidden = next === null;
    useNextDay.dataset.day = next ?? "";
    useNextDay.textContent =
      next === null
        ? ""
        : text.t("checkout.use_day", { day: text.day(next, "long") });
    dayProblem.hidden = false;
  }

  useNextDay.addEventListener("click", () => {
    const next = daySchema.safeParse(useNextDay.dataset.day);
    if (!next.success) return;
    day = next.data;
    cart = withDay(cart, day, "buyer");
    carts.save(slug, cart);
    const url = new URL(location.href);
    url.searchParams.set("day", day);
    history.replaceState(null, "", url);
    dayProblem.hidden = true;
    formError.hidden = true;
    render();
    submit.focus();
  });

  form.addEventListener("input", (event) => {
    if (event.target === phoneInput) {
      phoneInput.setCustomValidity("");
      flow.phoneChanged(phoneInput.value);
    }
    if (event.target === giftPhone) giftPhone.setCustomValidity("");
    if (event.target === codeInput) codeInput.setCustomValidity("");
    toggleDelivery();
    showStep();
    forms.saveDraft(slug, draft());
  });

  find(document, "#new-code", HTMLButtonElement).addEventListener(
    "click",
    () => void sendCode(),
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    formError.hidden = true;
    phoneInput.setCustomValidity(
      isPhone(phoneInput.value) ? "" : text.t("checkout.error.phone"),
    );
    giftPhone.setCustomValidity(
      giftPhone.value.trim() === "" || isPhone(giftPhone.value)
        ? ""
        : text.t("checkout.error.gift_phone"),
    );
    codeInput.setCustomValidity(
      codeInput.disabled || isCode(codeInput.value)
        ? ""
        : text.t("checkout.error.code"),
    );
    if (!form.reportValidity()) return;
    if (day === null || !dayProblem.hidden) {
      dayProblem.scrollIntoView({ block: "center" });
      return;
    }
    if (flow.phase === "details") void sendCode();
    else void place(day);
  });

  // The code step shows while a code waits; a checked number says so, and
  // the order goes with no new code.
  function showStep(): void {
    const { phase } = flow;
    const shown = phase === "code";
    codeStep.hidden = !shown;
    codeInput.disabled = !shown;
    if (!shown) codeInput.value = "";
    find(document, "#code-value", HTMLElement).textContent =
      flow.code?.code ?? "";
    verified.hidden = phase !== "verified";
    submit.textContent = text.t(
      phase === "details"
        ? "checkout.send_code"
        : payingNow()
          ? "checkout.place_pay"
          : "checkout.place",
    );
  }

  async function sendCode(): Promise<void> {
    formError.hidden = true;
    try {
      await wait.run(
        (signal) => flow.sendCode(phoneInput.value, signal),
        text.t("checkout.wait_code"),
      );
      codeInput.value = "";
      showStep();
      codeInput.focus();
    } catch (error) {
      sounds.error();
      showError(text.error(error, "checkout"));
    }
  }

  async function place(orderDay: Day): Promise<void> {
    const name = nameInput.value;
    const phone = phoneInput.value;
    try {
      const answer = await wait.run(
        (signal) =>
          flow.place(
            orderBody({
              storeId: page.store.id,
              via,
              day: orderDay,
              cart,
              draft: draft(),
              name,
              language: text.language,
            }),
            { phone, code: codeInput.value },
            signal,
          ),
        text.t("checkout.wait_place"),
      );
      // The tap accepted the code and placed the order: "placed" alone.
      sounds.placed();
      const placedAt = performance.now();
      carts.clear(slug);
      forms.clearDraft(slug);
      forms.saveBuyer({ name: name.trim(), phone: phone.trim() });
      const payUrl = payingNow() ? await startPayment(answer.token) : null;
      setTimeout(
        () =>
          location.assign(
            buyerHref(payUrl ?? `/o/${answer.token}`, location.search),
          ),
        Math.max(0, leaveDelayMs - (performance.now() - placedAt)),
      );
    } catch (error) {
      showStep();
      await explain(error);
    }
  }

  // The order is placed already, so a payment that does not start sends the
  // buyer to her order page, where Pay online waits.
  async function startPayment(token: string): Promise<string | null> {
    try {
      const started = await wait.run(
        (signal) =>
          api.send(
            "POST",
            `/api/payments/${encodeURIComponent(token)}/start`,
            {},
            paymentStartAnswerSchema,
            { signal },
          ),
        text.t("checkout.wait_pay"),
      );
      return started.pay_url;
    } catch (error) {
      console.error("The payment did not start.", error);
      return null;
    }
  }

  async function explain(error: unknown): Promise<void> {
    const problem = orderProblem(error);
    const words = text.error(error, "checkout");
    if (words !== "") {
      if (problem === "day") sounds.limit();
      else sounds.error();
    }
    if (problem === "day") {
      const code = isApiError(error) ? error.code : "";
      try {
        const days = await api.send(
          "POST",
          "/api/days",
          { store_id: page.store.id, cart: dayCheckLines(cart) },
          daysResponseSchema,
        );
        showDayProblem(
          code === "day_closed"
            ? "closed"
            : code === "day_past"
              ? "past"
              : "full",
          days.next_free_day,
        );
        dayProblem.scrollIntoView({ block: "center" });
        return;
      } catch {
        showError(words);
        return;
      }
    }
    if (problem === "cart" || problem === "ways") {
      try {
        page = await fetchStore();
        packs = menuPacks(page.sections);
        const fresh = reconcile(cart, packs);
        cart = fresh.cart;
        showNotice(cartNotice(fresh.changes, text));
        showWays();
        render();
      } catch {
        // The words below still say what to do next.
      }
      showError(
        problem === "cart"
          ? `${words} ${text.t("checkout.check_total")}`
          : words,
      );
      return;
    }
    if (problem === "code") {
      codeInput.setCustomValidity(words);
      codeInput.reportValidity();
    }
    showError(words);
  }

  function showError(words: string): void {
    formError.textContent = words;
    formError.hidden = words === "";
  }
}
