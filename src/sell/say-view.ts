import { toAppLanguage } from "../../shared/languages.ts";
import type { ItemReadAnswer, ItemReading } from "../../shared/reading.ts";
import { showVoiceMeter } from "../buyer/voice-meter.ts";
import { packLabel } from "../cart/pack-label.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { formatMoney } from "../text/format.ts";
import type { Text, TextKey } from "../text/text.ts";
import type { RecorderView } from "../voice/recorder.ts";
import {
  checkFields,
  isFilled,
  missingFields,
  type CheckField,
} from "./item-fill.ts";

export type Checking = { id: string; answer: ItemReadAnswer };

export type SayView = {
  show(options: { voice: boolean; recorded: boolean }): void;
  phase(view: RecorderView): void;
  clear(): void;
  error(message: string): void;
  note(message: string): void;
  result(checking: Checking): void;
  added(words: string): void;
  dismiss(): void;
  // The reading that she checks now, and the last reading of any kind.
  readonly checking: Checking | undefined;
  readonly last: Checking | undefined;
};

const fieldKeys: Record<CheckField, TextKey> = {
  name: "sell.say.field.name",
  latin: "sell.say.field.latin",
  category: "sell.say.field.category",
  mark: "sell.say.field.mark",
  price: "sell.say.field.price",
  packs: "sell.say.field.packs",
  allergens: "sell.say.field.allergens",
};

// The item that a reading heard, as a check list: the heard words on a
// tint, one row for each value, each filled value dashed until she adds the
// item, and Change on each row. Any failure leaves the item form.
export function createSayView({
  root,
  rowTemplate,
  text,
  onChange,
  onAdd,
  onClear,
  onByHand,
  onChecking,
}: {
  root: HTMLElement;
  rowTemplate: HTMLTemplateElement;
  text: Text;
  onChange: (field: CheckField) => void;
  onAdd: () => void;
  onClear: () => void;
  onByHand: () => void;
  onChecking: (checking: boolean) => void;
}): SayView {
  const el = (selector: string) => find(root, selector, HTMLElement);
  const button = find(root, "#say-record", HTMLButtonElement);
  const errorLine = el("#say-error");
  const note = el("#say-note");
  const result = el("#say-result");
  const check = el("#say-check");
  const heard = el("#say-heard");
  const answers = el("#say-answers");
  const add = find(root, "#say-add", HTMLButtonElement);
  const byHand = find(root, "#say-by-hand", HTMLButtonElement);
  const meter = { level: el("#say-level"), timer: el("#say-timer") };
  let checking: Checking | undefined;
  let last: Checking | undefined;

  add.addEventListener("click", onAdd);
  find(root, "#say-clear", HTMLButtonElement).addEventListener(
    "click",
    onClear,
  );
  byHand.addEventListener("click", onByHand);

  const setChecking = (next: Checking | undefined) => {
    const was = checking !== undefined;
    checking = next;
    check.hidden = next === undefined;
    if (was !== (next !== undefined)) onChecking(next !== undefined);
  };

  const value = (reading: ItemReading, field: CheckField): Node[] => {
    switch (field) {
      case "name":
        return [document.createTextNode(reading.name ?? "")];
      case "latin":
        return [document.createTextNode(reading.name_latin ?? "")];
      case "category":
        return [
          document.createTextNode(
            reading.category === null
              ? ""
              : text.t(`store.category.${reading.category}`),
          ),
        ];
      case "mark": {
        if (reading.veg_mark === null) return [];
        const mark = document.createElement("span");
        mark.className = "food-mark";
        mark.setAttribute("aria-hidden", "true");
        if (reading.veg_mark !== "veg") mark.dataset.food = "non-veg";
        const word =
          reading.veg_mark === "veg"
            ? "store.item.veg"
            : reading.veg_mark === "egg"
              ? "store.item.egg"
              : "store.item.non_veg";
        return [mark, document.createTextNode(` ${text.t(word)}`)];
      }
      case "price": {
        if (reading.price === null) return [];
        const amount = document.createElement("span");
        amount.className = "num";
        amount.textContent = formatMoney(reading.price.amount);
        const mark = "\u0000";
        const [before = "", after = ""] = text
          .t(
            reading.price.per === "kg"
              ? "sell.say.per_kg"
              : "sell.say.per_piece",
            { price: mark },
          )
          .split(mark);
        return [
          document.createTextNode(before),
          amount,
          document.createTextNode(after),
        ];
      }
      case "packs":
        return [
          document.createTextNode(
            reading.packs
              .map(
                (pack) => `${packLabel(pack, text)} ${formatMoney(pack.price)}`,
              )
              .join(" · "),
          ),
        ];
      case "allergens":
        return [
          document.createTextNode(
            reading.allergens
              .map((allergen) => text.t(`store.allergen.${allergen}`))
              .join(", "),
          ),
        ];
    }
  };

  const row = (reading: ItemReading, field: CheckField) => {
    const node = cloneTemplate(rowTemplate);
    node.dataset.field = field;
    const label = text.t(fieldKeys[field]);
    find(node, "dt", HTMLElement).textContent = label;
    const shown = find(node, ".answer-value", HTMLElement);
    if (isFilled(reading, field)) {
      const words = document.createElement("span");
      words.className = field === "packs" ? "draft num" : "draft";
      words.append(...value(reading, field));
      shown.replaceChildren(words);
    } else {
      shown.classList.add("answer-missing");
      shown.textContent = text.t(
        field === "allergens" ? "sell.say.none_said" : "sell.say.not_heard",
      );
    }
    find(node, ".answer-change", HTMLButtonElement).setAttribute(
      "aria-label",
      text.t("sell.say.change_label", { field: label }),
    );
    find(node, ".answer-change", HTMLButtonElement).addEventListener(
      "click",
      () => onChange(field),
    );
    return node;
  };

  return {
    get checking() {
      return checking;
    },
    get last() {
      return last;
    },
    show({ voice, recorded }) {
      root.hidden = false;
      el("#say-voice").hidden = !voice;
      el("#say-recorded").hidden = !recorded;
      el("#say-lead").textContent = text.t(
        voice ? "sell.say.lead" : "sell.say.lead_typed",
      );
    },
    phase(view) {
      button.dataset.phase = view.phase;
      showVoiceMeter(meter, view);
    },
    clear() {
      errorLine.hidden = true;
      note.hidden = true;
      byHand.hidden = true;
    },
    error(message) {
      errorLine.textContent = message;
      errorLine.hidden = message === "";
      byHand.hidden = false;
    },
    note(message) {
      note.textContent = message;
      note.hidden = message === "";
    },
    result(next) {
      const { answer } = next;
      last = next;
      note.hidden = true;
      const words = document.createElement("mark");
      words.textContent = answer.transcript;
      heard.replaceChildren(words);
      const language =
        answer.language === null ? undefined : toAppLanguage(answer.language);
      if (language === undefined) heard.removeAttribute("lang");
      else heard.lang = language;
      const reading = answer.item;
      if (answer.show_manual || reading === null) {
        setChecking(undefined);
        result.hidden = answer.transcript.trim() === "";
        note.textContent = text.t(
          answer.path === "manual" ? "sell.say.manual_off" : "sell.say.manual",
        );
        note.hidden = false;
        byHand.hidden = false;
        return;
      }
      result.hidden = false;
      answers.replaceChildren(
        ...checkFields(reading).map((field) => row(reading, field)),
      );
      add.textContent = text.t(
        missingFields(reading).length === 0
          ? "sell.say.add"
          : "sell.say.fill_rest",
      );
      byHand.hidden = true;
      setChecking(next);
      result.scrollIntoView({ block: "nearest" });
    },
    added(words) {
      setChecking(undefined);
      result.hidden = true;
      note.textContent = words;
      note.hidden = false;
      byHand.hidden = true;
    },
    dismiss() {
      setChecking(undefined);
      result.hidden = true;
    },
  };
}
