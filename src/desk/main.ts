import type { DeskStore } from "../../shared/desk.ts";
import {
  deskDayCheckAnswerSchema,
  deskOrderAnswerSchema,
} from "../../shared/orders.ts";
import { createApi } from "../api/api.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { createSounds } from "../sound/engine.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import { demoHeader, eventsUrl, openDesk, takeDemoToken } from "./access.ts";
import { createAddOrderView } from "./add-order-view.ts";
import { createBoardPosts } from "./board-posts.ts";
import { createBoardPostsView } from "./board-posts-view.ts";
import { createBoard } from "./board.ts";
import { createBoardView } from "./board-view.ts";
import { createCancelDialog } from "./cancel-dialog.ts";
import { createDailyView } from "./daily-view.ts";
import { createEditDialog } from "./edit-dialog.ts";
import { connectLive } from "./live.ts";
import { moveFrom } from "./motion.ts";
import { createQuotesView } from "./quotes-view.ts";
import { keepFresh } from "./refresh.ts";
import { pickSamples, sampleIds } from "./samples.ts";
import { createSignInView } from "./sign-in-view.ts";
import { createSlipActions } from "./slip-actions.ts";
import { createStock } from "./stock.ts";
import { createStockView } from "./stock-view.ts";

// The khata follows the board a moment after a stamp, a payment or a new
// order, so that a run of stamps asks for it once.
const khataAfterMs = 800;
const requestsEveryMs = 2 * 60 * 1000;

const { token, cleaned } = takeDemoToken(
  new URL(location.href),
  sessionStorage,
);
if (cleaned !== undefined) history.replaceState(history.state, "", cleaned);
const api = createApi({ headers: () => ({ [demoHeader]: token }) });

const page = {
  main: element("#desk-main"),
  grid: element("#desk-grid"),
  problem: element("#open-problem"),
  board: element("#board"),
  add: element("#add"),
  daily: element("#daily"),
  stock: element("#stock"),
  paused: element("#paused-notice"),
  quotes: element("#quotes"),
  posts: element("#posts"),
  postsTab: element("#posts-tab"),
  signIn: element("#sign-in"),
};
const templates = {
  day: template("#day-template"),
  slip: template("#slip-template"),
  line: template("#line-template"),
  makeRow: template("#make-row-template"),
  dayChip: template("#day-chip-template"),
  sample: template("#sample-template"),
  form: template("#order-form-template"),
  pack: template("#pack-row-template"),
  stockItem: template("#stock-item-template"),
  quote: template("#quote-template"),
  post: template("#post-template"),
  requestLine: template("#request-line-template"),
  fact: template("#fact-template"),
};

const text = await loadText();
const sounds = createSounds({ store: storageOf(() => localStorage) });
bindSoundToggle(element<HTMLButtonElement>("#sound-toggle"), sounds, {
  on: text.t("sound.on"),
  off: text.t("sound.off"),
});
bindLanguagePicker(
  element<HTMLSelectElement>("#language-picker"),
  text.language,
);
const opening = createWait({
  control: page.main,
  line: document.querySelector("#open-wait"),
});
element("button", page.problem).addEventListener("click", () => void open());
void open();

async function open(): Promise<void> {
  page.problem.hidden = true;
  try {
    const opened = await opening.run(
      (signal) =>
        openDesk({ api, demoToken: token, tokens: sessionStorage, signal }),
      text.t("desk.board.opening"),
    );
    if (opened.kind === "sign_in") {
      applyTemplates(text);
      createSignInView({
        root: page.signIn,
        api,
        text,
        onSignedIn: () => {
          page.signIn.hidden = true;
          void open();
        },
      }).show(opened.demoRefused);
      return;
    }
    applyTemplates(text);
    startDesk(opened.desk, text);
  } catch (error) {
    element(".error", page.problem).textContent = text.error(error, "desk");
    page.problem.hidden = false;
  }
}

function startDesk(desk: DeskStore, text: Text): void {
  const { store } = desk;
  const latinNames = new Map(
    desk.menu.map((item) => [item.id, item.name_latin]),
  );
  const vegMarks = new Map(desk.menu.map((item) => [item.id, item.veg_mark]));
  document.title = `${store.name} · ${text.t("desk.title")}`;
  element("#store-name").textContent = store.name;
  element("#store-place").textContent = [store.area, store.city]
    .filter((part) => part !== null && part !== "")
    .join(", ");
  element("#demo-badge").hidden = !store.is_demo;
  const packagesLink = element("#packages-link");
  packagesLink.hidden = !store.catering_on;
  // A store with no food orders leads with its quote requests and its
  // catering packages, and has no Add order.
  if (!store.normal_orders_on) {
    const quotesTab = element<HTMLInputElement>(
      '[name="main-tab"][value="quotes"]',
    );
    element('[name="main-tab"][value="orders"]')
      .closest("label")
      ?.before(quotesTab.closest("label") ?? quotesTab);
    quotesTab.checked = true;
    packagesLink.classList.replace("btn-plain", "btn-primary");
    page.add.hidden = true;
    element("#to-add").hidden = true;
  }
  const storeLink = element<HTMLAnchorElement>("#store-link");
  storeLink.href = `/s/${encodeURIComponent(store.slug)}`;
  storeLink.hidden = false;
  const liveStatus = element("#live-status");

  const board = createBoard({
    unit: store.limit_unit,
    limit: store.daily_limit,
  });
  const actions = createSlipActions({
    slips: board,
    send: (id, patch, options) =>
      api.send(
        "PATCH",
        `/api/desk/orders/${encodeURIComponent(id)}`,
        patch,
        deskOrderAnswerSchema,
        { keepalive: options?.keepalive },
      ),
    sendRefund: (id, options) =>
      api.send(
        "POST",
        `/api/desk/orders/${encodeURIComponent(id)}/refund`,
        {},
        deskOrderAnswerSchema,
        { keepalive: options?.keepalive },
      ),
    onStale: () => void boardView.load(),
    sounds,
  });
  const edit = createEditDialog({
    dialog: dialog("#edit-dialog"),
    text,
    desk,
    today: () => board.today,
    latinNames,
    templates,
    actions,
    checkDay: (id, body, signal) =>
      api.send(
        "POST",
        `/api/desk/orders/${encodeURIComponent(id)}/day-check`,
        body,
        deskDayCheckAnswerSchema,
        { signal },
      ),
    sounds,
  });
  const cancel = createCancelDialog({
    dialog: dialog("#cancel-dialog"),
    text,
    actions,
  });
  const boardView = createBoardView({
    root: page.board,
    api,
    templates,
    board,
    actions,
    text,
    latinNames,
    vegMarks,
    onEdit: (slip) => edit.open(slip),
    onCancel: (slip) => cancel.open(slip),
    onShare: () => sounds.commit(),
  });
  const stock = createStock({ api, desk, sounds });
  createStockView({
    root: page.stock,
    notice: page.paused,
    stock,
    menu: desk.menu,
    text,
    template: templates.stockItem,
  });
  const daily = createDailyView({
    root: page.daily,
    api,
    text,
    latinNames,
    templates: { row: templates.makeRow, chip: templates.dayChip },
    stock,
  });

  const add = createAddOrderView({
    root: page.add,
    api,
    text,
    desk,
    today: () => board.today,
    latinNames,
    templates,
    sounds,
    onSaved: (slip, from) => {
      page.add.parentElement?.scrollTo({ top: 0 });
      board.put(slip);
      const placed = boardView.slipElement(slip.id);
      if (placed === undefined) {
        sounds.saved();
        return;
      }
      placed.scrollIntoView({ block: "center", behavior: "instant" });
      const movedAt = performance.now();
      moveFrom(placed, from);
      sounds.saved(movedAt);
    },
    onUndone: (id) => board.remove(id),
  });
  element("#to-add").addEventListener("click", (event) => {
    event.preventDefault();
    add.focus();
  });
  if (desk.voice_samples) {
    void import("../../fixtures/sarvam/voice-lines.json").then(
      ({ default: lines }) => {
        const names = new Intl.DisplayNames([text.language], {
          type: "language",
        });
        add.showSamples(
          pickSamples(lines, sampleIds, {
            name: (language) => names.of(language) ?? language,
            mix: (language) => text.t("desk.add.sample_mix", { language }),
          }),
        );
      },
      (error: unknown) =>
        console.error("The sample voice notes did not load.", error),
    );
  }

  let boardLoaded = false;
  let khataTimer: ReturnType<typeof setTimeout> | undefined;
  board.subscribe(() => {
    if (!boardLoaded) {
      boardLoaded = true;
      return;
    }
    clearTimeout(khataTimer);
    khataTimer = setTimeout(() => void daily.load(), khataAfterMs);
  });

  const live = connectLive({
    url: eventsUrl(token),
    open: (url) => new EventSource(url),
    network: {
      get onLine() {
        return navigator.onLine;
      },
      addEventListener: (type, listener) => addEventListener(type, listener),
    },
    onSlip: (slip) => actions.accept(slip),
    onRemoved: (id) => board.remove(id),
    onQuote: () => void quotes.load(),
    onStatus: (status) => {
      liveStatus.textContent = text.t(`desk.live.${status}`);
    },
    onGap: () => {
      void boardView.load();
      loadRequests();
    },
    signal: new AbortController().signal,
  });
  liveStatus.textContent = text.t(`desk.live.${live.status}`);
  addEventListener("pagehide", () => actions.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") actions.flush();
  });

  const quotes = createQuotesView({
    root: page.quotes,
    api,
    text,
    templates: {
      quote: templates.quote,
      line: templates.requestLine,
      fact: templates.fact,
    },
    onNew: () => sounds.arrival("quote"),
  });
  const loads = [() => void quotes.load()];
  if (store.bulk_on) {
    const posts = createBoardPostsView({
      root: page.posts,
      posts: createBoardPosts({ api, sounds }),
      text,
      templates: {
        post: templates.post,
        line: templates.requestLine,
        fact: templates.fact,
      },
    });
    page.postsTab.hidden = false;
    loads.push(() => void posts.load());
  }
  const loadRequests = () => {
    for (const load of loads) load();
  };
  keepFresh({
    load: loadRequests,
    everyMs: requestsEveryMs,
    window,
    document,
    visible: () => document.visibilityState === "visible",
    signal: new AbortController().signal,
  });

  page.grid.hidden = false;
  void boardView.load();
  void daily.load();
  loadRequests();
}

function applyTemplates(text: Text): void {
  for (const each of Object.values(templates)) text.apply(each.content);
}

function element<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`The desk page has no ${selector}.`);
  return found;
}

function template(selector: string): HTMLTemplateElement {
  const found = element(selector);
  if (!(found instanceof HTMLTemplateElement)) {
    throw new Error(`${selector} is not a template.`);
  }
  return found;
}

function dialog(selector: string): HTMLDialogElement {
  const found = element(selector);
  if (!(found instanceof HTMLDialogElement)) {
    throw new Error(`${selector} is not a dialog.`);
  }
  return found;
}
