import type { Day } from "../../shared/day.ts";
import type { DayReason, DaysResponse } from "../../shared/store.ts";
import type { Cart } from "../cart/cart.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import {
  dayNote,
  dayOptions,
  isCapacityReason,
  type DayNote,
  type DayOption,
  type ResolvedDay,
} from "./day-choice.ts";

export type DayView = {
  render(
    days: DaysResponse | undefined,
    resolved: ResolvedDay,
    cart: Cart,
  ): void;
  showProblem(message: string): void;
};

type DayRow = {
  option: DayOption;
  label: HTMLElement;
  input: HTMLInputElement;
  name: HTMLElement;
  note: HTMLElement;
};

// The first week shows at once as chips; the rest of the three weeks folds
// away.
const nearCount = 7;

export function createDayView({
  list,
  status,
  near,
  later,
  more,
  template,
  text,
  onPick,
  onRefused,
}: {
  list: HTMLFieldSetElement;
  status: HTMLElement;
  near: HTMLElement;
  later: HTMLElement;
  more: HTMLDetailsElement;
  template: HTMLTemplateElement;
  text: Text;
  onPick: (day: Day) => void;
  // A tap on a day that does not fit: full, closed or not open.
  onRefused: () => void;
}): DayView {
  let rows: DayRow[] = [];

  list.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.checked) {
      onPick(event.target.value);
    }
  });
  list.addEventListener("click", (event) => {
    const label =
      event.target instanceof Element ? event.target.closest("label") : null;
    if (label?.querySelector("input:disabled") != null) onRefused();
  });

  const build = (options: DayOption[]) => {
    rows = options.map((option) => {
      const label = cloneTemplate(template);
      const input = find(label, "input", HTMLInputElement);
      input.value = option.day;
      const name = find(label, ".day-name", HTMLElement);
      name.textContent = nameFor(option);
      return {
        option,
        label,
        input,
        name,
        note: find(label, ".day-note", HTMLElement),
      };
    });
    near.replaceChildren(...rows.slice(0, nearCount).map((row) => row.label));
    later.replaceChildren(...rows.slice(nearCount).map((row) => row.label));
    more.hidden = rows.length <= nearCount;
  };

  // A chip names today and tomorrow in words, other days by date. A day
  // that does not fit says why.
  const nameFor = (option: DayOption) =>
    option.note === null
      ? text.day(option.day, "short")
      : noteWords(option.note, text);

  const noteFor = (option: DayOption) =>
    option.reason === null ? "" : reasonWords(option.reason, text);

  return {
    render(days, resolved, cart) {
      if (days === undefined) return;
      const options = dayOptions(days);
      const same =
        options.length === rows.length &&
        options.every(
          (option, index) => option.day === rows[index]?.option.day,
        );
      if (!same) build(options);
      for (const [index, row] of rows.entries()) {
        const option = options[index] ?? row.option;
        row.option = option;
        row.input.disabled = !option.fits;
        row.input.checked = option.day === resolved.day;
        row.note.textContent = noteFor(option);
        row.note.classList.toggle("full", isCapacityReason(option.reason));
        row.name.classList.toggle(
          "draft",
          row.input.checked && cart.picked_by === "voice",
        );
        if (row.input.checked && index >= nearCount) more.open = true;
      }
      const problem = statusOf(days, resolved, cart, text);
      status.textContent = problem.words;
      status.toggleAttribute("data-problem", problem.problem);
    },
    showProblem(message) {
      status.textContent = message;
      status.toggleAttribute("data-problem", true);
    },
  };
}

function reasonWords(reason: DayReason, text: Text): string {
  switch (reason) {
    case "full":
      return text.t("store.day.full");
    case "not_enough_space":
      return text.t("store.day.not_enough_space");
    case "closed":
      return text.t("store.day.closed");
    case "not_working":
    case "after_last_day":
    case "not_taking_orders":
      return text.t("store.day.closed");
  }
}

function statusOf(
  days: DaysResponse,
  resolved: ResolvedDay,
  cart: Cart,
  text: Text,
): { words: string; problem: boolean } {
  if (resolved.missed !== null) {
    const day = text.day(resolved.missed.day, "long");
    return {
      words: isCapacityReason(resolved.missed.reason)
        ? text.t("store.day.missed_full", { day })
        : text.t("store.day.missed_closed", { day }),
      problem: true,
    };
  }
  if (days.next_free_day === null) {
    return {
      words:
        cart.lines.length === 0
          ? text.t("store.day.none")
          : text.t("store.day.none_for_cart"),
      problem: true,
    };
  }
  const note = dayNote(days.next_free_day, days.today);
  return {
    words: text.t("store.day.next", {
      day:
        note === null
          ? text.day(days.next_free_day, "long")
          : noteWords(note, text),
    }),
    problem: false,
  };
}

function noteWords(note: DayNote, text: Text): string {
  return text.t(note === "today" ? "store.day.today" : "store.day.tomorrow");
}
