import { appLanguageSchema } from "../../shared/languages.ts";
import {
  sellReadStateSchema,
  type ItemReadAnswer,
  type SellReadState,
} from "../../shared/reading.ts";
import type { SetupItem } from "../../shared/setup.ts";
import { createApi, isAbortError } from "../api/api.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { itemName, nameFor } from "../cart/item-name.ts";
import { find } from "../dom/dom.ts";
import { createSounds } from "../sound/engine.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";
import { sourceMinutes } from "../voice/limits.ts";
import { prepareVoice } from "../voice/prepare.ts";
import { createRecorder } from "../voice/recorder.ts";
import { createVoiceFlow, workingAfterMs } from "../voice/voice-flow.ts";
import { createWait } from "../wait/wait.ts";
import {
  goTo,
  newDraft,
  nextStep,
  openStep,
  previousStep,
  restoreItem,
  steps,
  withItem,
  withoutItem,
  type Draft,
  type Step,
} from "./draft.ts";
import { createDraftState, type SaveStatus } from "./draft-state.ts";
import { createItemDialog } from "./item-dialog.ts";
import {
  checkFields,
  formOfReading,
  isFilled,
  itemOfReading,
  missingFields,
  type CheckField,
} from "./item-fill.ts";
import { readItemText, readItemVoice, type ReadStep } from "./item-read.ts";
import { createItemsView } from "./items-view.ts";
import { createLinkCheck } from "./link-check.ts";
import { createPreviewView } from "./preview-view.ts";
import { createPublishView } from "./publish-view.ts";
import { createSayView } from "./say-view.ts";
import { createShareView } from "./share-view.ts";
import { createSlugSuggest } from "./slug-suggest.ts";
import { createStoreView } from "./store-view.ts";
import { createUndo } from "./undo.ts";
import { createWaysView } from "./ways-view.ts";
import { createWizardView } from "./wizard-view.ts";

const state = createDraftState({
  storage: localStore(),
  onChange: (draft, status) => render(draft, status),
});
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
const el = (selector: string) => find(document, selector, HTMLElement);
const form = (selector: string) => find(document, selector, HTMLFormElement);
const template = (selector: string) =>
  find(document, selector, HTMLTemplateElement);
const change = (patch: Partial<Draft>) =>
  state.update((draft) => ({ ...draft, ...patch }));
const open = (step: Step) => state.update((draft) => goTo(draft, step));

const wizard = createWizardView({
  nav: el(".steps"),
  cards: new Map(steps.map((step) => [step, el(`#step-${step}`)])),
  text,
  onOpen: open,
});
const undo = createUndo({ onChange: (offer) => items.showUndo(offer?.words) });
const dialog = createItemDialog({
  dialog: find(document, "#item-dialog", HTMLDialogElement),
  packTemplate: template("#pack-row-template"),
  text,
  onSave: (item) => {
    state.update((draft) => withItem(draft, item));
    if (item.id === say.checking?.id) readingAdded(item);
  },
});
const items = createItemsView({
  root: el("#step-items"),
  template: template("#item-row-template"),
  text,
  onAdd: () =>
    dialog.open(undefined, { category: state.draft.items.at(-1)?.category }),
  onChange: (item) => dialog.open(item),
  onRemove: (item) => {
    const index = state.draft.items.findIndex((other) => other.id === item.id);
    state.update((draft) => withoutItem(draft, item.id));
    undo.give({
      words: text.t("sell.items.removed", {
        item: nameFor(itemName(item.name, item.name_latin), text.language),
      }),
      restore: () => state.update((draft) => restoreItem(draft, item, index)),
    });
  },
  onUndo: () => undo.undo(),
  onNext: () => open(nextStep("items")),
});
const say = createSayView({
  root: el("#say-item"),
  rowTemplate: template("#say-answer-template"),
  text,
  onChange: (field) => changeReading(field),
  onAdd: () => addReading(),
  onClear: () => {
    const checking = say.checking;
    if (checking === undefined) return;
    say.dismiss();
    undo.give({
      words: text.t("sell.say.cleared"),
      restore: () => say.result(checking),
    });
  },
  onByHand: () => changeReading(undefined),
  onChecking: (checking) => items.render(state.draft.items, checking),
});
const sayText = find(document, "#say-text", HTMLTextAreaElement);
let sayVoice = false;
api.get("/api/sell/read", sellReadStateSchema).then(startSay, () => {});
const linkCheck = createLinkCheck({
  api,
  storeId: () => state.draft.store_id,
  onState: (link) => store.showLink(link),
});
const slugSuggest = createSlugSuggest({
  api,
  storeId: () => state.draft.store_id,
  onSlug: (slug) => store.suggested(slug),
});
const store = createStoreView({
  form: form("#store-form"),
  text,
  origin: location.origin,
  linkCheck,
  slugSuggest,
  draft: () => state.draft,
  onChange: change,
  onNext: () => open("ways"),
});
const ways = createWaysView({
  form: form("#ways-form"),
  text,
  geolocation: "geolocation" in navigator ? navigator.geolocation : undefined,
  onChange: change,
  onNext: () => open("preview"),
});
const preview = createPreviewView({
  root: el("#step-preview"),
  templates: {
    category: template("#category-template"),
    section: template("#section-template"),
    item: template("#item-template"),
    pack: template("#pack-template"),
  },
  text,
});
const publish = createPublishView({
  root: el("#step-publish"),
  api,
  text,
  draft: () => state.draft,
  onPhone: (phone) => change({ phone }),
  adopt: (storeId) => change({ store_id: storeId }),
  onPublished: (published) => {
    sounds.commit("publish");
    state.update((draft) => goTo({ ...draft, published }, "share"));
  },
  onSlugTaken: () => open("store"),
});
const share = createShareView({
  root: el("#step-share"),
  text,
  clipboard: navigator.clipboard,
});

form("#language-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const chosen = appLanguageSchema.safeParse(
    new FormData(form("#language-form")).get("language"),
  );
  if (!chosen.success) return;
  state.update((draft) => goTo({ ...draft, language: chosen.data }, "items"));
  if (chosen.data !== text.language)
    location.assign(`/sell?lang=${chosen.data}`);
});
for (const back of document.querySelectorAll<HTMLButtonElement>(
  "[data-back]",
)) {
  back.addEventListener("click", () => open(previousStep(state.draft.step)));
}
el("#preview-next").addEventListener("click", () => open("publish"));
el("#share-new").addEventListener("click", () =>
  state.update(() => newDraft(crypto.randomUUID())),
);

let shownStep: Step | undefined;
const firstStep = openStep(state.draft);
if (firstStep === state.draft.step) render(state.draft, state.status);
else state.update((draft) => ({ ...draft, step: firstStep }));

function render(draft: Draft, status: SaveStatus): void {
  wizard.render(draft);
  el("#bar-store").textContent = draft.name.trim() || text.t("sell.bar");
  el("#save-status").textContent =
    draft.published !== null
      ? text.t("sell.published")
      : status === "new"
        ? ""
        : text.t(status === "saved" ? "sell.saved" : "sell.not_saved");
  el("#sell-lead").textContent = text.t(
    draft.published === null ? "sell.lead" : "sell.lead_published",
  );
  if (draft.step === "items") {
    items.render(draft.items, say.checking !== undefined);
  }
  if (draft.step === shownStep) return;
  shownStep = draft.step;
  if (draft.step !== "items") undo.dismiss();
  showStep(draft);
}

function showStep(draft: Draft): void {
  switch (draft.step) {
    case "language": {
      const language = draft.language ?? text.language;
      for (const input of document.querySelectorAll<HTMLInputElement>(
        'input[name="language"]',
      )) {
        input.checked = input.value === language;
      }
      return;
    }
    case "items":
      return;
    case "store":
      return store.show(draft);
    case "ways":
      return ways.show(draft);
    case "preview":
      return preview.show(draft);
    case "publish":
      return publish.show(draft);
    case "share":
      if (draft.published !== null) share.show(draft.published);
      return;
  }
}

// Item reading (docs/system.md, "Reading pipeline"): her voice or her typed
// words fill a check list. With ops_suggestions off the card stays hidden,
// and the item form is the way to add an item.
function startSay({ reading, voice, recorded }: SellReadState): void {
  if (!reading) return;
  sayVoice = voice;
  say.show({ voice, recorded });
  const record = find(document, "#say-record", HTMLButtonElement);
  const line = el("#say-wait");
  const voiceWait = createWait({ control: record, line });
  const textWait = createWait({
    control: find(document, "#say-read", HTMLButtonElement),
    line,
  });
  const onAnswer = (answer: ItemReadAnswer) => {
    say.result({ id: crypto.randomUUID(), answer });
    const item = answer.item;
    if (answer.show_manual || item === null) sounds.fallback();
    else {
      sounds.cascade(
        checkFields(item).filter((field) => isFilled(item, field)).length,
      );
    }
  };
  const onError = (error: unknown) => say.error(text.error(error, "sell.say"));
  if (voice) {
    const flow = createVoiceFlow<ItemReadAnswer, ReadStep>({
      recorder: createRecorder((view) => {
        sounds.microphone(view.phase);
        say.phase(view);
      }),
      prepare: prepareVoice,
      read: (parts, options) => readItemVoice(api, parts, options),
      wait: voiceWait,
      sounds,
      words: {
        opening: text.t("sell.say.wait_open"),
        step: (step) =>
          step.kind === "reading"
            ? text.t("sell.say.wait_read")
            : text.t("sell.say.wait_send", { part: step.part, of: step.of }),
      },
      onStart: () => {
        textWait.cancel();
        say.clear();
      },
      onAtLimit: () =>
        say.note(
          text.t("common.voice.stopped_at_limit", { minutes: sourceMinutes }),
        ),
      onAnswer,
      onError,
    });
    record.addEventListener("click", () => flow.toggle());
    const file = find(document, "#say-file", HTMLInputElement);
    file.addEventListener("change", () => {
      const chosen = file.files?.[0];
      file.value = "";
      if (chosen !== undefined) flow.choose(chosen);
    });
  }
  form("#say-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const words = sayText.value.trim();
    if (words === "") {
      sayText.reportValidity();
      return;
    }
    voiceWait.cancel();
    say.clear();
    const working = setTimeout(() => sounds.working(), workingAfterMs);
    textWait
      .run(
        (signal) => readItemText(api, words, { signal }),
        text.t("sell.say.wait_read"),
        { restart: true },
      )
      .then(onAnswer, (error: unknown) => {
        if (isAbortError(error)) return;
        sounds.fallback();
        onError(error);
      })
      .finally(() => clearTimeout(working));
  });
}

// Change on a row, or the form after a failure: the item form, filled with
// what the reading heard, at that field.
function changeReading(field: CheckField | undefined): void {
  const last = say.checking ?? say.last;
  const reading = last?.answer.item ?? null;
  if (last === undefined || reading === null) {
    dialog.open(undefined, { category: state.draft.items.at(-1)?.category });
    return;
  }
  dialog.open(undefined, {
    reading: { id: last.id, fill: formOfReading(reading), focus: field },
  });
}

// Add this item: the reading as it is, or the form at the first value that
// it still needs.
function addReading(): void {
  const checking = say.checking;
  const reading = checking?.answer.item ?? null;
  if (checking === undefined || reading === null) return;
  const item = itemOfReading(reading, {
    id: checking.id,
    newId: () => crypto.randomUUID(),
  });
  if (item === undefined) {
    changeReading(missingFields(reading)[0] ?? "name");
    return;
  }
  state.update((draft) => withItem(draft, item));
  readingAdded(item);
}

function readingAdded(item: SetupItem): void {
  sounds.commit();
  say.added(
    text.t("sell.say.added", {
      item: nameFor(itemName(item.name, item.name_latin), text.language),
    }),
  );
  sayText.value = "";
  find(document, sayVoice ? "#say-record" : "#say-text", HTMLElement).focus();
}

function localStore(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}
