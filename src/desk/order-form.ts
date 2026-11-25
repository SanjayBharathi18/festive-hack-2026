import { addDays, type Day } from "../../shared/day.ts";
import type { Fulfilment, LimitUnit } from "../../shared/model.ts";
import type { DaysResponse, MenuItem } from "../../shared/store.ts";
import type { Sounds } from "../sound/engine.ts";
import { formatMoney } from "../text/format.ts";
import type { Text, TextKey } from "../text/text.ts";
import { amountOf, askedAmount, packAmount } from "./amounts.ts";
import { dayName } from "./board-view.ts";
import { noticeWords, type DayNotice } from "./day-notice.ts";
import {
  fields,
  itemGroups,
  missing,
  totalOf,
  withPack,
  withQuantity,
  type Draft,
  type Field,
  type Need,
  type Values,
} from "./draft.ts";
import { fillGauge } from "./gauge-view.ts";
import { cartLoad } from "./load.ts";
import {
  nameText,
  shownName,
  spokenName,
  type ShownName,
} from "../../shared/item-names.ts";
import { showName } from "../cart/name-view.ts";
import { languageOfText } from "./names.ts";

export type FormMode = "check" | "fill";
export type Capacity = {
  notice: DayNotice | undefined;
  load: number | undefined;
};
export type FormStore = {
  unit: LimitUnit;
  limit: number | null;
  offersPickup: boolean;
  offersDelivery: boolean;
};

export type OrderForm = {
  readonly element: HTMLElement;
  readonly values: Values;
  show(draft: Draft, mode: FormMode, values?: Values): void;
  check(): boolean;
  setCapacity(capacity: Capacity | undefined): void;
  setDays(days: DaysResponse | undefined): void;
  setToday(today: Day): void;
};

const dayWindow = 21;

const needWords: Record<Need, TextKey> = {
  items: "desk.check.need.items",
  day: "desk.check.need.day",
  fulfilment: "desk.check.need.fulfilment",
  address: "desk.check.need.address",
};

// The check screen of a draft, as a "check answers" list: one row for each
// field, a value that the model filled dashed until she opens or changes it,
// and Change on each row. In fill mode every editor is open, for the manual
// path and for changing a saved order. Enter in a field confirms that field
// only and never saves the order: only the save button saves.
export function createOrderForm({
  template,
  packTemplate,
  prefix,
  text,
  menu,
  store,
  latinNames,
  sounds,
  onChange,
}: {
  template: HTMLTemplateElement;
  packTemplate: HTMLTemplateElement;
  prefix: string;
  text: Text;
  menu: readonly MenuItem[];
  store: FormStore;
  latinNames: ReadonlyMap<string, string | null>;
  sounds: Pick<Sounds, "tick" | "limit">;
  onChange: (values: Values, field: Field) => void;
}): OrderForm {
  const element = cloneOf(template);
  const rows = new Map(
    fields.map((field) => [field, part(element, `[data-field="${field}"]`)]),
  );
  const row = (field: Field) => {
    const found = rows.get(field);
    if (found === undefined) throw new Error(`The form has no ${field} row.`);
    return found;
  };
  // An item of the order as the desk names it, with its Latin form from the
  // menu.
  const deskName = (itemId: string, name: string): ShownName =>
    shownName(
      { name, name_latin: latinNames.get(itemId) ?? null },
      text.language,
    );
  let draft: Draft | undefined;
  let mode: FormMode = "check";
  let values: Values = {
    lines: [],
    day: null,
    fulfilment: null,
    buyer_name: "",
    address: "",
    note: "",
  };
  let today: Day | undefined;
  let days: DaysResponse | undefined;
  let capacity: Capacity | undefined;
  let showNeeds = false;
  let warned = "";
  const open = new Set<Field>();
  const confirmed = new Set<Field>();

  const daySelect = part<HTMLSelectElement>(row("day"), ".day-select");
  const addPack = part<HTMLSelectElement>(row("items"), ".add-pack");
  const radios = [
    ...row("fulfilment").querySelectorAll<HTMLInputElement>(
      "input[type=radio]",
    ),
  ];
  const inputs = {
    buyer_name: part<HTMLInputElement>(row("buyer_name"), ".text-input"),
    address: part<HTMLInputElement>(row("address"), ".text-input"),
    note: part<HTMLTextAreaElement>(row("note"), ".text-input"),
  };

  for (const field of fields) {
    const label = row(field).querySelector("dt");
    if (label === null) continue;
    label.id = `${prefix}-${field}`;
    row(field)
      .querySelector(".answer-change")
      ?.setAttribute("aria-describedby", label.id);
  }
  daySelect.setAttribute("aria-labelledby", `${prefix}-day`);
  addPack.id = `${prefix}-add-pack`;
  part(row("items"), ".add-pack-label").setAttribute("for", addPack.id);
  for (const radio of radios) radio.name = `${prefix}-fulfilment`;
  for (const [field, input] of Object.entries(inputs)) {
    input.setAttribute("aria-labelledby", `${prefix}-${field}`);
  }
  fillPackChoices(addPack, menu, text, latinNames);

  const changed = (field: Field, next: Values) => {
    values = next;
    confirmed.add(field);
    renderValues();
    onChange(values, field);
  };

  const renderValues = () => {
    for (const field of fields) renderRow(field);
    renderItems();
    renderCapacity();
    part(element, ".answer-total-value").textContent = formatMoney(
      totalOf(values),
    );
  };

  const renderRow = (field: Field) => {
    const entry = row(field);
    const editing = mode === "fill" || open.has(field);
    const edit = entry.querySelector<HTMLElement>(".answer-edit");
    if (edit) edit.hidden = !editing;
    const change = entry.querySelector<HTMLButtonElement>(".answer-change");
    if (change) {
      change.textContent = text.t(
        open.has(field) ? "desk.check.done" : "common.action.change",
      );
      change.setAttribute("aria-expanded", String(open.has(field)));
    }
    if (field === "address") entry.hidden = values.fulfilment === "pickup";
    const need = entry.querySelector<HTMLElement>(".answer-need");
    const lacking = missing(values).find((each) => each === field);
    if (need) {
      need.hidden = !(showNeeds && lacking !== undefined);
      need.textContent =
        lacking === undefined ? "" : text.t(needWords[lacking]);
    }
    if (field === "items") return;
    const shown = entry.querySelector<HTMLElement>(".answer-text");
    if (shown === null) return;
    const value = valueText(field);
    shown.textContent = value ?? text.t("desk.check.not_said");
    shown.classList.toggle("answer-empty", value === undefined);
    shown.classList.toggle("draft", value !== undefined && isDashed(field));
    const language = value === undefined ? undefined : languageOfText(value);
    if (language === undefined) shown.removeAttribute("lang");
    else shown.lang = language;
  };

  const isDashed = (field: Field) =>
    mode === "check" &&
    (draft?.filled.has(field) ?? false) &&
    !confirmed.has(field);

  const valueText = (field: Exclude<Field, "items">): string | undefined => {
    switch (field) {
      case "day":
        return values.day === null
          ? undefined
          : dayName(values.day, today, text);
      case "fulfilment":
        return values.fulfilment === null
          ? undefined
          : text.t(
              values.fulfilment === "pickup"
                ? "desk.slip.pickup"
                : "desk.slip.delivery",
            );
      default: {
        const words = values[field].trim();
        return words === "" ? undefined : words;
      }
    }
  };

  const renderItems = () => {
    const entry = row("items");
    const dashed = isDashed("items");
    const groups = itemGroups(values.lines);
    const list = part(entry, ".answer-lines");
    list.replaceChildren(
      ...(groups.length === 0
        ? [emptyLine(text)]
        : groups.map((group) => {
            const first = group[0];
            const line = document.createElement("li");
            const words = document.createElement("span");
            if (dashed) words.className = "draft";
            const name = document.createElement("span");
            const latin = document.createElement("span");
            latin.className = "line-latin";
            if (first !== undefined) {
              showName(
                { first: name, second: latin },
                deskName(first.item_id, first.name),
                text.language,
              );
            }
            const amount = document.createElement("span");
            amount.className = "num";
            amount.textContent = group
              .map((each) => packAmount(each.quantity, each.label))
              .join(" + ");
            words.append(name, " ", latin, " ", amount);
            line.append(words);
            const mark = draft?.marks.find(
              (each) => each.item_id === first?.item_id,
            );
            if (mark?.nearAmount)
              line.append(
                markLine(
                  text.t("desk.check.near_amount", {
                    asked: askedAmount(mark.asked, text),
                  }),
                ),
              );
            if (mark?.nearName)
              line.append(
                markLine(text.t("desk.check.near_name", { said: mark.said })),
              );
            return line;
          })),
    );
    const marks = part(entry, ".answer-marks");
    marks.replaceChildren(
      ...(draft?.soldOut ?? []).map((item) => {
        const line = document.createElement("li");
        const stamp = document.createElement("span");
        stamp.className = "stamp";
        stamp.textContent = text.t("desk.check.sold_out");
        const name = document.createElement("span");
        setWords(name, nameText(deskName(item.item_id, item.name)));
        line.append(stamp, name, " · ", text.t("desk.check.sold_out_note"));
        return line;
      }),
      ...(draft?.unmatched ?? []).map((item) => {
        const line = document.createElement("li");
        line.className = "error";
        line.textContent = text.t("desk.check.unmatched", { said: item.said });
        const language = languageOfText(item.said);
        if (language !== undefined) line.lang = language;
        return line;
      }),
    );
    renderPacks();
  };

  const renderPacks = () => {
    const list = part(row("items"), ".pack-rows");
    const known = new Map(
      [...list.children].map((child) => [
        (child as HTMLElement).dataset.pack,
        child as HTMLElement,
      ]),
    );
    const wanted = values.lines.map((line) => {
      let item = known.get(line.pack_id);
      if (item === undefined) {
        item = cloneOf(packTemplate);
        item.dataset.pack = line.pack_id;
      }
      const shown = deskName(line.item_id, line.name);
      const label = `${spokenName(shown)} ${line.label}`;
      showName(
        { first: part(item, ".line-item"), second: part(item, ".line-latin") },
        shown,
        text.language,
      );
      part(item, ".pack-label").textContent = line.label;
      part(item, ".pack-count").textContent = String(line.quantity);
      part(item, ".pack-price").textContent = formatMoney(
        line.price * line.quantity,
      );
      part(item, ".stepper").setAttribute("aria-label", label);
      part(item, ".pack-less").setAttribute(
        "aria-label",
        text.t("desk.check.one_less", { item: label }),
      );
      part(item, ".pack-more").setAttribute(
        "aria-label",
        text.t("desk.check.one_more", { item: label }),
      );
      part<HTMLButtonElement>(item, ".pack-more").disabled =
        line.quantity >= 999;
      return item;
    });
    const current = [...list.children];
    if (
      current.length !== wanted.length ||
      current.some((child, index) => child !== wanted[index])
    ) {
      list.replaceChildren(...wanted);
    }
  };

  const renderDays = () => {
    const chosen = values.day;
    const list =
      today === undefined
        ? []
        : Array.from({ length: dayWindow }, (_, index) =>
            addDays(today as Day, index),
          );
    if (chosen !== null && !list.includes(chosen)) list.unshift(chosen);
    const options = list.map((day) => {
      const option = document.createElement("option");
      option.value = day;
      option.textContent = dayOption(day);
      return option;
    });
    const placeholder = daySelect.options[0];
    daySelect.replaceChildren(
      ...(placeholder ? [placeholder] : []),
      ...options,
    );
    daySelect.value = chosen ?? "";
  };

  const dayOption = (day: Day): string => {
    const name = dayName(day, today, text);
    const check = days?.days.find((entry) => entry.day === day);
    if (check === undefined) return name;
    if (check.reason === "full")
      return `${name} · ${text.t("desk.notice.option_full")}`;
    if (check.reason !== null && check.reason !== "not_enough_space") {
      return `${name} · ${text.t("desk.notice.option_closed")}`;
    }
    if (check.space_left === null) return name;
    return `${name} · ${text.t("desk.notice.option_left", { left: amountOf(store.unit, check.space_left, text) })}`;
  };

  const renderCapacity = () => {
    const box = part(row("day"), ".answer-capacity");
    const notice = capacity?.notice;
    const load = capacity?.load;
    const draftLoad =
      values.lines.length === 0 ? 0 : cartLoad(store.unit, values.lines);
    const gauge = part(box, ".gauge");
    const showGauge =
      load !== undefined && store.limit !== null && values.day !== null;
    gauge.hidden = !showGauge;
    if (showGauge) {
      fillGauge(
        gauge,
        { unit: store.unit, limit: store.limit, load, draft: draftLoad },
        text,
      );
    }
    const warn = part(box, ".notice");
    const warning =
      notice !== undefined && !notice.fits && notice.day === values.day;
    warn.hidden = !warning;
    // The fall plays once, when a day that does not fit comes into view.
    const key = warning ? `${notice.day} ${notice.reason}` : "";
    if (key !== "" && key !== warned) sounds.limit();
    warned = key;
    if (warning) {
      const words = noticeWords(notice, {
        need: draftLoad,
        unit: store.unit,
        text,
        dayName: (day) => dayName(day, today, text),
      });
      part(warn, ".notice-text").textContent = words.problem;
      part(warn, ".notice-next").textContent = words.next;
      const move = part<HTMLButtonElement>(warn, ".notice-move");
      move.hidden = notice.next === null;
      move.dataset.day = notice.next ?? "";
    }
    box.hidden = !(showGauge || warning);
  };

  element.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("button");
    if (button === null) return;
    const field = button.closest<HTMLElement>("[data-field]")?.dataset.field as
      Field | undefined;
    if (button.matches(".answer-change") && field !== undefined) {
      sounds.tick();
      if (open.has(field)) open.delete(field);
      else {
        open.add(field);
        confirmed.add(field);
      }
      renderValues();
      if (open.has(field)) focusEditor(row(field));
      return;
    }
    const pack = button.closest<HTMLElement>(".pack-row")?.dataset.pack;
    if (pack !== undefined) {
      const line = values.lines.find((each) => each.pack_id === pack);
      if (line === undefined) return;
      const step = button.matches(".pack-more")
        ? 1
        : button.matches(".pack-less")
          ? -1
          : 0;
      if (step === 0) return;
      changed("items", withQuantity(values, pack, line.quantity + step));
      if (line.quantity + step <= 0) addPack.focus();
      return;
    }
    if (button.matches(".notice-move") && button.dataset.day) {
      changed("day", { ...values, day: button.dataset.day });
      renderDays();
    }
  });

  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const entry = target.closest<HTMLElement>(".answer-edit")?.parentElement;
    const field = entry?.dataset.field as Field | undefined;
    if (field === undefined) return;
    event.preventDefault();
    if (mode === "fill" || !open.has(field)) return;
    sounds.tick();
    open.delete(field);
    confirmed.add(field);
    renderValues();
    row(field).querySelector<HTMLElement>(".answer-change")?.focus();
  });
  addPack.addEventListener("change", () => {
    if (addPack.value === "") return;
    const next = withPack(values, menu, addPack.value);
    addPack.value = "";
    changed("items", next);
  });
  daySelect.addEventListener("change", () => {
    changed("day", {
      ...values,
      day: daySelect.value === "" ? null : daySelect.value,
    });
  });
  for (const radio of radios) {
    radio.addEventListener("change", () => {
      if (radio.checked)
        changed("fulfilment", {
          ...values,
          fulfilment: radio.value as Fulfilment,
        });
    });
  }
  for (const [field, input] of Object.entries(inputs) as [
    keyof typeof inputs,
    HTMLInputElement | HTMLTextAreaElement,
  ][]) {
    input.addEventListener("input", () =>
      changed(field, { ...values, [field]: input.value }),
    );
  }

  return {
    element,
    get values() {
      return values;
    },
    show(next, nextMode, start) {
      draft = next;
      mode = nextMode;
      values = structuredClone(start ?? next.initial);
      showNeeds = nextMode === "check";
      open.clear();
      confirmed.clear();
      capacity = undefined;
      element.dataset.mode = nextMode;
      for (const [field, input] of Object.entries(inputs) as [
        keyof typeof inputs,
        HTMLInputElement | HTMLTextAreaElement,
      ][]) {
        input.value = values[field];
      }
      for (const radio of radios) {
        radio.checked = radio.value === values.fulfilment;
        const offered =
          radio.value === "pickup" ? store.offersPickup : store.offersDelivery;
        radio
          .closest("label")
          ?.toggleAttribute("hidden", !offered && !radio.checked);
      }
      renderDays();
      renderValues();
    },
    check() {
      showNeeds = true;
      const needs = missing(values);
      for (const need of needs) open.add(need);
      renderValues();
      const first = needs[0];
      if (first !== undefined) focusEditor(row(first));
      return needs.length === 0;
    },
    setCapacity(next) {
      capacity = next;
      renderCapacity();
    },
    setDays(next) {
      days = next;
      renderDays();
    },
    setToday(next) {
      today = next;
      renderDays();
      renderValues();
    },
  };
}

function fillPackChoices(
  select: HTMLSelectElement,
  menu: readonly MenuItem[],
  text: Text,
  latinNames: ReadonlyMap<string, string | null>,
): void {
  const groups = menu
    .filter((item) => item.packs.length > 0)
    .map((item) => {
      const group = document.createElement("optgroup");
      group.label = nameText(
        shownName(
          { name: item.name, name_latin: latinNames.get(item.id) ?? null },
          text.language,
        ),
      );
      for (const pack of item.packs) {
        const option = document.createElement("option");
        option.value = pack.id;
        option.textContent = `${pack.label} · ${formatMoney(pack.price)}`;
        group.append(option);
      }
      return group;
    });
  select.append(...groups);
}

function focusEditor(entry: HTMLElement): void {
  entry
    .querySelector<HTMLElement>(
      ".answer-edit :is(input:not([type=radio]), select, textarea, button), .answer-edit input:checked, .answer-edit input",
    )
    ?.focus();
}

function emptyLine(text: Text): HTMLLIElement {
  const line = document.createElement("li");
  line.className = "answer-empty";
  line.textContent = text.t("desk.check.not_said");
  return line;
}

function markLine(words: string): HTMLElement {
  const mark = document.createElement("span");
  mark.className = "answer-mark";
  mark.textContent = words;
  return mark;
}

function setWords(element: HTMLElement, words: string): void {
  element.textContent = words;
  const language = languageOfText(words);
  if (language === undefined) element.removeAttribute("lang");
  else element.lang = language;
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
  if (found === null) throw new Error(`The order form has no ${selector}.`);
  return found;
}
