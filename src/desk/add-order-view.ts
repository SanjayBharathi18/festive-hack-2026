import { toAppLanguage } from "../../shared/languages.ts";
import type { DeskStore } from "../../shared/desk.ts";
import {
  deskOrderAnswerSchema,
  deskRemovedSchema,
  undoWindowMs,
  type DeskSlip,
} from "../../shared/orders.ts";
import {
  deskReadAnswerSchema,
  partAnswerSchema,
  type DeskReadAnswer,
} from "../../shared/reading.ts";
import { daysResponseSchema } from "../../shared/store.ts";
import { isAbortError, type Api } from "../api/api.ts";
import type { Sounds } from "../sound/engine.ts";
import { leaveWithSound } from "../sound/leave.ts";
import { formatTimer } from "../text/format.ts";
import type { Text } from "../text/text.ts";
import { prepareVoice } from "../voice/prepare.ts";
import { createRecorder, type RecorderView } from "../voice/recorder.ts";
import { sourceSeconds } from "../voice/limits.ts";
import { workingAfterMs } from "../voice/voice-flow.ts";
import { createWait } from "../wait/wait.ts";
import {
  createAddOrder,
  isRefusedFile,
  type Control,
  type Step,
} from "./add-order.ts";
import { noticeFromCapacity, noticeFromDays } from "./day-notice.ts";
import { filledFields, type Values } from "./draft.ts";
import { markHeard } from "./heard.ts";
import { languageOfText } from "./names.ts";
import { createOrderForm } from "./order-form.ts";
import type { Sample } from "./samples.ts";

export type AddOrderView = {
  showSamples(samples: readonly Sample[]): void;
  // Moves the keyboard to the first control of the step that shows.
  focus(): void;
};

// The wait for a reading covers speech to text for each part, then the
// reading itself, which can chain two Sarvam calls with their retries.
const readingTimeoutMs = 90_000;
const recheckMs = 250;

// Add order, in its card next to the board: record, choose or paste, or on a
// demo desk read a sample voice note; check the draft; save; then Send on
// WhatsApp. The saved slip moves to its day on the board at once, and Undo
// takes it back for 10 s, to the check screen with her values.
export function createAddOrderView({
  root,
  api,
  text,
  desk,
  today,
  latinNames,
  templates,
  sounds,
  onSaved,
  onUndone,
}: {
  root: HTMLElement;
  api: Pick<Api, "send">;
  text: Text;
  desk: DeskStore;
  today: () => string | undefined;
  latinNames: ReadonlyMap<string, string | null>;
  templates: {
    form: HTMLTemplateElement;
    pack: HTMLTemplateElement;
    sample: HTMLTemplateElement;
  };
  sounds: Sounds;
  onSaved: (slip: DeskSlip, from: DOMRect) => void;
  onUndone: (orderId: string) => void;
}): AddOrderView {
  const { store } = desk;
  const steps = {
    input: part(root, "#add-input"),
    check: part(root, "#add-check"),
    saved: part(root, "#add-saved"),
  };
  const record = part<HTMLButtonElement>(root, "#record");
  const level = part(root, ".voice-level");
  const timer = part(root, ".voice-timer");
  const filePick = part(root, "#file-pick");
  const file = part<HTMLInputElement>(root, "#file");
  const pasteForm = part<HTMLFormElement>(root, "#paste-form");
  const pasteText = part<HTMLTextAreaElement>(root, "#paste-text");
  const readButton = part<HTMLButtonElement>(root, "#read-text");
  const problem = part(root, "#add-problem");
  const checkForm = part<HTMLFormElement>(root, "#check-form");
  const saveButton = part<HTMLButtonElement>(root, "#save-order");
  const share = part<HTMLAnchorElement>(root, "#saved-share");
  const undoLine = part(root, "#saved-undo");
  const undoButton = part<HTMLButtonElement>(root, "#undo-save");
  const undoSeconds = part(root, "#undo-seconds");
  const savedError = part(root, "#saved-error");
  const limit = formatTimer(sourceSeconds * 1000);
  const lines = {
    input: root.querySelector("#add-wait"),
    save: root.querySelector("#save-wait"),
    undo: root.querySelector("#undo-wait"),
  };
  const controls: Record<Control, Element> = {
    record,
    upload: filePick,
    paste: readButton,
    save: saveButton,
    undo: undoButton,
  };
  const sampleList = part(root, "#sample-list");

  let recording: AbortController | undefined;
  let textControl: Element = readButton;
  let stoppedAtLimit = false;
  let saving = false;
  let shownDraft: unknown;
  let recheckTimer: ReturnType<typeof setTimeout> | undefined;
  let recheckController: AbortController | undefined;
  let shownStep: Step["name"] | undefined;
  let working: ReturnType<typeof setTimeout> | undefined;
  let undoTimer: ReturnType<typeof setInterval> | undefined;

  const form = createOrderForm({
    template: templates.form,
    packTemplate: templates.pack,
    prefix: "add",
    text,
    menu: desk.menu,
    store: {
      unit: store.limit_unit,
      limit: store.daily_limit,
      offersPickup: store.offers_pickup,
      offersDelivery: store.offers_delivery,
    },
    latinNames,
    sounds,
    onChange: (_values, field) => {
      if (field === "items" || field === "day") recheck();
    },
  });
  part(root, "#check-fields").append(form.element);

  const flow = createAddOrder({
    deps: {
      prepare: (audio, signal) => prepareVoice(audio, { signal }),
      uploadPart: (wav, signal) =>
        api.send("POST", "/api/desk/read/parts", wav, partAnswerSchema, {
          signal,
          timeoutMs: readingTimeoutMs,
        }),
      read: (body, signal) =>
        api.send("POST", "/api/desk/read", body, deskReadAnswerSchema, {
          signal,
          timeoutMs: readingTimeoutMs,
        }),
      save: (body, signal) =>
        api.send("POST", "/api/desk/orders", body, deskOrderAnswerSchema, {
          signal,
        }),
      remove: (orderId, signal) =>
        api.send(
          "DELETE",
          `/api/desk/orders/${encodeURIComponent(orderId)}`,
          undefined,
          deskRemovedSchema,
          { signal },
        ),
      waitFor: (control) =>
        createWait({
          control: control === "paste" ? textControl : controls[control],
          line:
            control === "save" || control === "undo"
              ? lines[control]
              : lines.input,
        }),
      words: {
        voice: text.t("desk.add.reading_voice"),
        text: text.t("desk.add.reading_text"),
        saving: text.t("desk.add.saving"),
        undoing: text.t("desk.saved.undoing"),
      },
    },
    onStep: (step) => render(step),
  });

  const recorder = createRecorder((view) => {
    sounds.microphone(view.phase);
    showVoice(view);
  });

  const showVoice = (view: RecorderView) => {
    record.dataset.phase = view.phase;
    level.style.setProperty("--level", String(view.level));
    timer.textContent = `${formatTimer(view.ms)} / ${limit}`;
  };

  const showProblem = (error: unknown, retry: boolean) => {
    const words = error === undefined ? "" : text.error(error, "desk");
    problem.hidden = words === "";
    part(problem, ".error").textContent = words;
    part(problem, "button").hidden = !retry;
  };

  // Each step has its sound: working when a reading takes a while; the
  // cascade of the fields, with the ones to check unsure, or the fall to the
  // hand path when the reading failed and her words stay; the error of a
  // refused file, a failed save or a refused Undo.
  const play = (step: Step) => {
    const was = shownStep;
    shownStep = step.name;
    if (step.name !== "reading") clearTimeout(working);
    else if (was !== "reading") {
      working = setTimeout(() => sounds.working(), workingAfterMs);
    }
    if (
      step.name !== "reading" &&
      step.error !== undefined &&
      !isAbortError(step.error)
    ) {
      const fellBack =
        step.name === "check" &&
        was === "reading" &&
        !isRefusedFile(step.error);
      if (fellBack) sounds.fallback();
      else sounds.error();
      return;
    }
    if (step.name !== "check" || was !== "reading") return;
    const filled = filledFields(step.draft);
    if (step.manual || filled.count === 0) sounds.fallback();
    else sounds.cascade(filled.notes, filled.unsure);
  };

  const render = (step: Step) => {
    const fresh = step.name === "saved" && shownStep !== "saved";
    play(step);
    const from = fresh ? steps.check.getBoundingClientRect() : undefined;
    steps.input.hidden = step.name !== "input" && step.name !== "reading";
    steps.check.hidden = step.name !== "check";
    steps.saved.hidden = step.name !== "saved";
    if (step.name === "input")
      showProblem(step.error, step.retry !== undefined);
    if (step.name === "reading") showProblem(undefined, false);
    if (step.name === "check") showCheck(step);
    if (step.name === "saved") showSaved(step, fresh, from);
    else stopUndo();
  };

  const showCheck = (step: Extract<Step, { name: "check" }>) => {
    const { reading } = step;
    const heardBlock = part(root, "#heard-block");
    heardBlock.hidden = step.heard.trim() === "";
    const heard = part(root, "#heard");
    heard.replaceChildren(
      ...markHeard(step.heard, phrasesOf(reading)).map((piece) => {
        if (!piece.heard) return document.createTextNode(piece.text);
        const mark = document.createElement("mark");
        mark.textContent = piece.text;
        return mark;
      }),
    );
    const language =
      (reading?.language ? toAppLanguage(reading.language) : undefined) ??
      languageOfText(step.heard);
    if (language === undefined) heard.removeAttribute("lang");
    else heard.lang = language;
    part(root, "#recorded-badge").hidden =
      desk.recorded || !(reading?.recorded ?? false);
    const trace = part(root, "#trace");
    trace.hidden = !(reading?.trace.show ?? false);
    if (reading !== undefined) {
      part(root, "#trace-line").textContent = [
        reading.language ?? "–",
        reading.path,
        reading.variant ?? "–",
        `${(reading.trace.duration_ms / 1000).toFixed(1)} s`,
      ].join(" · ");
    }
    part(root, "#check-title").textContent = text.t(
      step.manual ? "desk.check.manual_title" : "desk.check.title",
    );
    const lead = !step.manual
      ? text.t("desk.check.lead")
      : reading?.path === "manual"
        ? text.t("desk.check.manual_off")
        : reading === undefined &&
            step.error === undefined &&
            step.heard.trim() === ""
          ? text.t("desk.check.manual_hand")
          : text.t("desk.check.manual_lead");
    part(root, "#check-lead").textContent = stoppedAtLimit
      ? `${text.t("common.voice.stopped_at_limit", { minutes: sourceSeconds / 60 })} ${lead}`
      : lead;
    const error = part(root, "#check-error");
    const words =
      step.error === undefined ? "" : text.error(step.error, "desk");
    error.textContent = words;
    error.hidden = words === "";
    if (shownDraft !== step.draft) {
      shownDraft = step.draft;
      const day = today();
      if (day !== undefined) form.setToday(day);
      form.show(step.draft, step.manual ? "fill" : "check");
      const capacity = reading?.draft.capacity;
      form.setCapacity(
        capacity === null || capacity === undefined
          ? undefined
          : {
              notice: noticeFromCapacity(capacity),
              load: loadFrom(capacity.space_left),
            },
      );
      recheck();
    }
  };

  const showSaved = (
    step: Extract<Step, { name: "saved" }>,
    fresh: boolean,
    from: DOMRect | undefined,
  ) => {
    const slip = step.answer.order;
    part(root, "#saved-number").textContent = `#${slip.number}`;
    share.href = slip.share_url ?? slip.order_url;
    const words =
      step.error === undefined ? "" : text.t("desk.saved.undo_failed");
    savedError.textContent = words;
    savedError.hidden = words === "";
    if (step.error !== undefined) stopUndo();
    if (!fresh) return;
    share.focus({ preventScroll: true });
    startUndo();
    if (from !== undefined) onSaved(slip, from);
  };

  // Undo of a save shows for the undo window, with the seconds left.
  const startUndo = () => {
    stopUndo();
    const until = Date.now() + undoWindowMs;
    const tick = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      undoSeconds.textContent = `${left} s`;
      if (left === 0) stopUndo();
    };
    undoLine.hidden = false;
    tick();
    undoTimer = setInterval(tick, 1000);
  };
  const stopUndo = () => {
    clearInterval(undoTimer);
    undoTimer = undefined;
    undoLine.hidden = true;
  };

  const loadFrom = (spaceLeft: number | null): number | undefined =>
    spaceLeft === null || store.daily_limit === null
      ? undefined
      : store.daily_limit - spaceLeft;

  // The day she chose is checked again on each change of the items or the
  // day, against the days that fit this cart. A failed check keeps the last
  // one: it helps her decide, and never blocks the save.
  const recheck = () => {
    clearTimeout(recheckTimer);
    recheckTimer = setTimeout(async () => {
      recheckController?.abort();
      const controller = new AbortController();
      recheckController = controller;
      const values: Values = form.values;
      if (values.lines.length === 0) {
        form.setCapacity(undefined);
        return;
      }
      try {
        const days = await api.send(
          "POST",
          "/api/days",
          {
            store_id: store.id,
            cart: values.lines.map(({ pack_id, quantity }) => ({
              pack_id,
              quantity,
            })),
          },
          daysResponseSchema,
          { signal: controller.signal },
        );
        form.setDays(days);
        const notice =
          values.day === null ? undefined : noticeFromDays(days, values.day);
        form.setCapacity(
          notice === undefined
            ? undefined
            : { notice, load: loadFrom(notice.spaceLeft) },
        );
      } catch (error) {
        if (!isAbortError(error)) console.error("The day check failed.", error);
      }
    }, recheckMs);
  };

  const startRecording = async () => {
    showProblem(undefined, false);
    stoppedAtLimit = false;
    recording = new AbortController();
    try {
      const done = await recorder.record({
        signal: recording.signal,
        beforeOpen: () => sounds.record("start"),
      });
      stoppedAtLimit = done.atLimit;
      await flow.readVoice(done.audio, "record");
    } catch (error) {
      if (isAbortError(error)) return;
      sounds.error();
      showProblem(error, false);
    } finally {
      recording = undefined;
    }
  };

  const again = () => {
    stoppedAtLimit = false;
    pasteText.value = "";
    flow.reset();
    record.focus();
  };

  record.addEventListener("click", () => {
    if (recorder.phase === "idle") void startRecording();
    else recorder.stop();
  });
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (chosen === undefined || flow.step.name === "reading") return;
    stoppedAtLimit = false;
    void flow.readVoice(chosen, "upload");
  });
  pasteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const words = pasteText.value.trim();
    if (words === "") {
      pasteText.focus();
      return;
    }
    if (flow.step.name === "reading") return;
    stoppedAtLimit = false;
    textControl = readButton;
    void flow.readText(words);
  });
  sampleList.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(".sample");
    const words = button?.dataset.words;
    if (button === null || words === undefined) return;
    if (flow.step.name === "reading") return;
    stoppedAtLimit = false;
    textControl = button;
    void flow.readText(words);
  });
  part(problem, "button").addEventListener("click", () => void flow.retry());
  part(root, "#by-hand").addEventListener("click", () => flow.fillByHand());
  part(root, "#start-again").addEventListener("click", () => {
    stoppedAtLimit = false;
    flow.reset();
  });
  checkForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !form.check()) return;
    saving = true;
    try {
      await flow.save(form.values);
    } finally {
      saving = false;
    }
  });
  undoButton.addEventListener("click", async () => {
    if (undoTimer === undefined) return;
    const gone = await flow.undoSave();
    if (gone === undefined) return;
    sounds.undo();
    onUndone(gone);
    saveButton.focus();
  });
  part(root, "#saved-back").addEventListener("click", again);
  share.addEventListener("click", (event) =>
    leaveWithSound(event, share, () => sounds.commit()),
  );

  render(flow.step);
  showVoice({ phase: "idle", level: 0, ms: 0 });
  part(root, "#add-recorded").hidden = !desk.recorded;
  if (!desk.flags.ops_voice) {
    part(root, "#voice").hidden = true;
    readButton.classList.replace("btn-plain", "btn-primary");
  }

  return {
    focus() {
      const step = flow.step.name;
      const first =
        step === "saved"
          ? share
          : step === "check"
            ? steps.check.querySelector<HTMLElement>(
                ".answer-change, .answer-edit :is(input, select, textarea)",
              )
            : desk.flags.ops_voice
              ? record
              : pasteText;
      first?.focus();
    },
    showSamples(samples) {
      sampleList.replaceChildren(
        ...samples.map((sample) => {
          const item = cloneOf(templates.sample);
          const button = part<HTMLButtonElement>(item, ".sample");
          button.dataset.words = sample.text;
          part(item, ".sample-language").textContent = sample.label;
          const words = part(item, ".sample-words");
          words.textContent = `“${sample.text}”`;
          if (sample.lang !== undefined) words.lang = sample.lang;
          return item;
        }),
      );
      part(root, "#samples").hidden = samples.length === 0;
    },
  };
}

function phrasesOf(reading: DeskReadAnswer | undefined): string[] {
  if (reading === undefined) return [];
  const { draft } = reading;
  return [
    ...draft.items.map((item) => item.said),
    ...draft.unmatched.map((item) => item.said),
    draft.buyer_name ?? "",
    draft.address ?? "",
    draft.note ?? "",
  ];
}

function cloneOf(template: HTMLTemplateElement): HTMLElement {
  const made = template.content.firstElementChild?.cloneNode(true);
  if (!(made instanceof HTMLElement)) {
    throw new Error(`The template ${template.id} needs one element.`);
  }
  return made;
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`Add order has no ${selector}.`);
  return found;
}
