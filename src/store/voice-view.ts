import { toAppLanguage } from "../../shared/languages.ts";
import type { CartReadAnswer, DraftItem } from "../../shared/reading.ts";
import type { MenuItem } from "../../shared/store.ts";
import { showVoiceMeter } from "../buyer/voice-meter.ts";
import { shownName } from "../../shared/item-names.ts";
import { showName } from "../cart/name-view.ts";
import { packLabel } from "../cart/pack-label.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import type { RecorderView } from "../voice/recorder.ts";
import type { ResolvedDay } from "./day-choice.ts";
import {
  askedWords,
  heardSegments,
  isNear,
  type AppliedReading,
} from "./voice-result.ts";

export type VoiceView = {
  phase(view: RecorderView): void;
  clear(): void;
  error(message: string): void;
  note(message: string): void;
  undone(): void;
  result(answer: CartReadAnswer, applied: AppliedReading | null): void;
  update(resolved: ResolvedDay, canUndo: boolean): void;
};

export type VoiceElements = {
  button: HTMLButtonElement;
  level: HTMLElement;
  timer: HTMLElement;
  error: HTMLElement;
  note: HTMLElement;
  result: HTMLElement;
  recorded: HTMLElement;
  heard: HTMLElement;
  items: HTMLElement;
  unmatched: HTMLElement;
  day: HTMLElement;
  done: HTMLElement;
  doneWords: HTMLElement;
  manual: HTMLElement;
  undo: HTMLButtonElement;
  itemTemplate: HTMLTemplateElement;
};

// What the model understood, shown for the buyer to check: the heard words
// on a tint, each item with its packs, and a dashed line on every guess.
export function createVoiceView(
  elements: VoiceElements,
  text: Text,
  menu: ReadonlyMap<string, MenuItem>,
): VoiceView {
  const { button, level, timer } = elements;
  let saidDay: string | null = null;
  let added = 0;
  let reveal = false;

  return {
    phase(view) {
      button.dataset.phase = view.phase;
      showVoiceMeter({ level, timer }, view);
    },
    clear() {
      elements.error.hidden = true;
      elements.note.hidden = true;
      elements.result.hidden = true;
      saidDay = null;
      added = 0;
    },
    error(message) {
      elements.error.textContent = message;
      elements.error.hidden = message === "";
    },
    note(message) {
      elements.note.textContent = message;
      elements.note.hidden = message === "";
    },
    undone() {
      added = 0;
      saidDay = null;
      elements.items.hidden = true;
      elements.unmatched.hidden = true;
      elements.day.hidden = true;
      elements.manual.hidden = true;
      elements.undo.hidden = true;
      elements.doneWords.textContent = text.t("store.voice.undone");
      elements.done.hidden = false;
    },
    result(answer, applied) {
      elements.result.hidden = false;
      elements.recorded.hidden = !answer.recorded;
      const segments = heardSegments(
        answer.transcript,
        applied === null
          ? []
          : [...applied.added, ...applied.soldOut].map((item) => item.said),
      );
      elements.heard.replaceChildren(
        ...segments.map((segment) => {
          if (!segment.heard) return document.createTextNode(segment.text);
          const mark = document.createElement("mark");
          mark.textContent = segment.text;
          return mark;
        }),
      );
      elements.heard.hidden = answer.transcript.trim() === "";
      const language =
        answer.language === null ? undefined : toAppLanguage(answer.language);
      if (language === undefined) elements.heard.removeAttribute("lang");
      else elements.heard.lang = language;

      const items =
        applied === null ? [] : [...applied.added, ...applied.soldOut];
      elements.items.replaceChildren(...items.map((item) => itemRow(item)));
      elements.items.hidden = items.length === 0;
      const unmatched = applied?.unmatched ?? [];
      elements.unmatched.hidden = unmatched.length === 0;
      elements.unmatched.textContent = text.t("store.voice.unmatched", {
        list: unmatched.map((item) => `“${item.said}”`).join(", "),
      });
      added = applied?.added.length ?? 0;
      elements.doneWords.textContent = text.t("store.voice.added");
      elements.done.hidden = added === 0;
      elements.manual.hidden = added > 0;
      elements.manual.textContent = answer.show_manual
        ? text.t("store.voice.manual")
        : text.t("store.voice.nothing");
      saidDay = applied?.day ?? null;
      reveal = true;
    },
    update(resolved, canUndo) {
      elements.undo.hidden = !canUndo || added === 0;
      // A new result comes into view once the cart beside it has grown.
      if (reveal) {
        reveal = false;
        elements.result.scrollIntoView({ block: "nearest" });
      }
      elements.day.hidden = saidDay === null;
      if (saidDay === null) return;
      const day = text.day(saidDay, "long");
      elements.day.replaceChildren();
      if (resolved.missed?.day === saidDay) {
        elements.day.textContent = text.t("store.voice.day_missed", { day });
      } else {
        const said = document.createElement("span");
        said.className = "draft";
        said.textContent = day;
        elements.day.append(text.t("store.voice.day"), " ", said);
      }
    },
  };

  function itemRow(item: DraftItem): HTMLElement {
    const row = cloneTemplate(elements.itemTemplate);
    showName(
      {
        first: find(row, ".line-item", HTMLElement),
        second: find(row, ".line-latin", HTMLElement),
      },
      shownName(
        menu.get(item.item_id) ?? { name: item.name, name_latin: null },
        text.language,
      ),
      text.language,
    );
    const packs = find(row, ".heard-item-packs", HTMLElement);
    packs.textContent = item.packs
      .map((pack) => `${pack.quantity} × ${packLabel(pack, text)}`)
      .join(" + ");
    packs.classList.toggle("draft", isNear(item) && !item.sold_out);
    const notes: string[] = [];
    if (item.sold_out) notes.push(text.t("store.voice.sold_out"));
    else {
      const asked = askedWords(item.asked, text);
      if (item.near_amount && asked !== null) {
        notes.push(text.t("store.voice.near_amount", { asked }));
      }
      if (item.near_name) {
        notes.push(text.t("store.voice.near_name", { said: item.said }));
      }
    }
    find(row, ".heard-item-note", HTMLElement).textContent = notes.join(" ");
    return row;
  }
}
