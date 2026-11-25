import { storePageSchema, type StorePage } from "../../shared/store.ts";
import { createApi } from "../api/api.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import {
  dayCheckLines,
  menuPacks,
  quantityOf,
  reconcile,
} from "../cart/cart.ts";
import { createCartStorage, storageOf } from "../cart/cart-storage.ts";
import { buyerHref, viaOf, withLanguage } from "../cart/links.ts";
import { packLabel } from "../cart/pack-label.ts";
import { find } from "../dom/dom.ts";
import { createSounds } from "../sound/engine.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";
import { sourceMinutes } from "../voice/limits.ts";
import { prepareVoice } from "../voice/prepare.ts";
import { createRecorder } from "../voice/recorder.ts";
import { createVoiceFlow } from "../voice/voice-flow.ts";
import { createWait } from "../wait/wait.ts";
import { createCartCard } from "./cart-card.ts";
import { cartNotice } from "../cart/cart-notice.ts";
import { createDayCheck } from "./day-check.ts";
import { stoppedFitting, type ResolvedDay } from "./day-choice.ts";
import { createDayView } from "./day-view.ts";
import { flyToCart } from "./fly-to-cart.ts";
import { createMenuView } from "./menu-view.ts";
import { shareLink } from "./share.ts";
import { showStoreHead } from "./store-head.ts";
import { mountStoreExtras } from "./store-extras.ts";
import { createStoreState } from "./store-state.ts";
import { readVoiceCart, type ReadStep } from "./voice-cart.ts";
import { isNear } from "./voice-result.ts";
import { createVoiceView } from "./voice-view.ts";

const text = await loadText();
for (const template of document.querySelectorAll("template")) {
  text.apply(template.content);
}
// The title has no data-text: the store sections apply the page text again
// when they mount, and that must not undo the title with the store name.
document.title = text.t("store.title");
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
const storage = createCartStorage(storageOf(() => localStorage));
const template = (id: string) => find(document, id, HTMLTemplateElement);
const loadWait = createWait({
  control: find(document, "#page", HTMLElement),
  line: find(document, "#load-wait", HTMLElement),
});
const loadProblem = find(document, "#load-problem", HTMLElement);

find(document, "#load-retry", HTMLButtonElement).addEventListener(
  "click",
  () => void load(),
);
void load();

async function load(): Promise<void> {
  loadProblem.hidden = true;
  try {
    const page = await loadWait.run(
      (signal) =>
        api.get(
          withLanguage(
            `/api/stores/${encodeURIComponent(slug)}`,
            text.language,
          ),
          storePageSchema,
          { signal },
        ),
      text.t("store.loading"),
    );
    start(page);
  } catch (error) {
    find(document, "#load-error", HTMLElement).textContent = text.error(
      error,
      "store",
    );
    loadProblem.hidden = false;
  }
}

function start(page: StorePage): void {
  showStoreHead(document, page, text, location.search);
  find(document, "#store", HTMLElement).hidden = false;
  mountStoreExtras(
    find(document, "#store-extras", HTMLElement),
    page,
    sounds,
    text,
  );
  // A store with no food orders, only catering or bulk, leads with those:
  // no menu, no food cart and no voice card.
  const foodOrders = page.store.normal_orders_on;
  find(document, "#page", HTMLElement).classList.toggle(
    "no-food-orders",
    !foodOrders,
  );
  const takingOrders = !page.store.paused && page.store.normal_orders_on;
  find(document, "#not-taking", HTMLElement).hidden = takingOrders;
  find(document, "#day", HTMLElement).hidden = !takingOrders;

  const packs = menuPacks(page.sections);
  const kept = reconcile(storage.load(slug), packs);
  const notice = find(document, "#cart-notice", HTMLElement);
  notice.textContent = cartNotice(kept.changes, text);
  notice.hidden = notice.textContent === "";

  const menu = createMenuView({
    root: find(document, "#menu", HTMLElement),
    filter: find(document, "#categories", HTMLElement),
    templates: {
      category: template("#category-template"),
      section: template("#section-template"),
      item: template("#item-template"),
      pack: template("#pack-template"),
    },
    text,
    sections: page.sections,
    cart: kept.cart,
    takingOrders,
    onStep(pack, delta, from) {
      const before = quantityOf(state.cart, pack.id);
      const step = state.step(pack, delta);
      const after = quantityOf(state.cart, pack.id);
      if (after !== before) sounds.step(after);
      if (step.first) {
        flyToCart({
          from: menu.packChip(pack.id) ?? from,
          to: cart.total,
          label: packLabel(pack, text),
        });
      }
      return step.more;
    },
    onPack: (index) => sounds.tick(index),
  });
  const cart = createCartCard({
    root: find(document, "#cart", HTMLElement),
    packs,
    takingOrders,
    text,
  });
  const days = createDayView({
    list: find(document, "#day-list", HTMLFieldSetElement),
    status: find(document, "#day-status", HTMLElement),
    near: find(document, "#days-near", HTMLElement),
    later: find(document, "#days-later", HTMLElement),
    more: find(document, "#days-more", HTMLDetailsElement),
    template: template("#day-template"),
    text,
    onPick: (day) => {
      sounds.tick();
      state.pickDay(day);
    },
    onRefused: () => sounds.limit(),
  });
  const voice = page.flags.ops_voice && foodOrders ? startVoice() : undefined;
  let answered: ResolvedDay | undefined;
  const state = createStoreState({
    slug,
    storage,
    cart: kept.cart,
    nextFreeDay: page.days.next_free_day,
    onChange(change) {
      if (change.cart) {
        menu.update(state.cart, state.marks, state.canStep);
        dayCheck.check(dayCheckLines(state.cart));
      }
      if (change.days) {
        if (stoppedFitting(answered, state.resolved)) sounds.limit();
        answered = state.resolved;
      }
      render();
      if (change.days) scrollToDayOnce();
    },
  });
  const dayCheck = createDayCheck({
    api,
    storeId: page.store.id,
    onDays: (answer) => state.setDays(answer),
    onError: (error) => days.showProblem(text.error(error, "store")),
  });

  function render(): void {
    const { day } = state.resolved;
    cart.update(
      state.cart,
      day === null || !takingOrders
        ? null
        : buyerHref(`/s/${page.store.slug}/checkout`, location.search, {
            extra: { day },
          }),
    );
    days.render(state.days, state.resolved, state.cart);
    voice?.update(state.resolved, state.canUndoReading);
  }

  let scrolled = location.hash !== "#day";
  function scrollToDayOnce(): void {
    if (scrolled) return;
    scrolled = true;
    find(document, "#day", HTMLElement).scrollIntoView({ block: "nearest" });
  }

  function startVoice() {
    find(document, "#voice", HTMLElement).hidden = false;
    find(document, "#voice-recorded", HTMLElement).hidden = !page.recorded;
    const button = find(document, "#voice-button", HTMLButtonElement);
    const view = createVoiceView(
      {
        button,
        level: find(document, "#voice-level", HTMLElement),
        timer: find(document, "#voice-timer", HTMLElement),
        error: find(document, "#voice-error", HTMLElement),
        note: find(document, "#voice-note", HTMLElement),
        result: find(document, "#voice-result", HTMLElement),
        recorded: find(document, "#voice-recorded", HTMLElement),
        heard: find(document, "#voice-heard", HTMLElement),
        items: find(document, "#voice-items", HTMLElement),
        unmatched: find(document, "#voice-unmatched", HTMLElement),
        day: find(document, "#voice-day", HTMLElement),
        done: find(document, "#voice-done", HTMLElement),
        doneWords: find(document, "#voice-done-words", HTMLElement),
        manual: find(document, "#voice-manual", HTMLElement),
        undo: find(document, "#voice-undo", HTMLButtonElement),
        itemTemplate: template("#heard-item-template"),
      },
      text,
      new Map([...packs.values()].map(({ item }) => [item.id, item])),
    );
    const order = createVoiceFlow({
      recorder: createRecorder((recorder) => {
        sounds.microphone(recorder.phase);
        view.phase(recorder);
      }),
      prepare: prepareVoice,
      read: (parts, options) =>
        readVoiceCart({ api, slug: page.store.slug, via }, parts, options),
      wait: createWait({
        control: button,
        line: find(document, "#voice-wait", HTMLElement),
      }),
      sounds,
      words: {
        opening: text.t("store.voice.wait_open"),
        step: (step: ReadStep) =>
          step.kind === "reading"
            ? text.t("store.voice.wait_read")
            : text.t("store.voice.wait_send", { part: step.part, of: step.of }),
      },
      onStart: () => view.clear(),
      onAtLimit: () =>
        view.note(
          text.t("common.voice.stopped_at_limit", { minutes: sourceMinutes }),
        ),
      onAnswer(answer) {
        const applied = answer.show_manual
          ? null
          : state.applyReading(answer.cart);
        if (applied !== null) menu.choose(applied.marks.keys());
        view.result(answer, applied);
        render();
        const filled = applied?.added ?? [];
        if (filled.length === 0) sounds.fallback();
        else {
          sounds.cascade(
            filled.length,
            filled.flatMap((item, index) => (isNear(item) ? [index] : [])),
          );
        }
      },
      onError: (error) =>
        view.error(
          `${text.error(error, "store")} ${text.t("store.voice.use_list")}`,
        ),
    });
    button.addEventListener("click", () => order.toggle());
    const file = find(document, "#voice-file", HTMLInputElement);
    file.addEventListener("change", () => {
      const chosen = file.files?.[0];
      file.value = "";
      if (chosen !== undefined) order.choose(chosen);
    });
    find(document, "#voice-undo", HTMLButtonElement).addEventListener(
      "click",
      () => {
        state.undoReading();
        view.undone();
      },
    );
    return view;
  }

  const shareStatus = find(document, "#share-status", HTMLElement);
  find(document, "#share", HTMLButtonElement).addEventListener("click", () => {
    shareStatus.textContent = "";
    shareLink(navigator, {
      title: page.store.name,
      url: new URL(`/s/${page.store.slug}`, location.origin).href,
    }).then(
      (result) => {
        if (result === "copied")
          shareStatus.textContent = text.t("store.share.copied");
      },
      () => {
        shareStatus.textContent = text.t("store.share.failed");
      },
    );
  });

  menu.update(state.cart, state.marks, state.canStep);
  render();
  dayCheck.check(dayCheckLines(state.cart), { delayMs: 0 });
}
