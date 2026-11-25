import { addDays, type Day } from "../../shared/day.ts";
import { closeAheadDays } from "../../shared/desk.ts";
import { dailyListSchema, type DailyList } from "../../shared/orders.ts";
import type { Api } from "../api/api.ts";
import { formatMoney } from "../text/format.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import { madeAmount, packsText } from "./amounts.ts";
import { fillGauge } from "./gauge-view.ts";
import { closeStateOf, khataDays } from "./khata-days.ts";
import { shownName } from "../../shared/item-names.ts";
import { showName } from "../cart/name-view.ts";
import type { Stock } from "./stock.ts";

export type DailyView = {
  load(): Promise<void>;
};

type Money = { orders: number; value: number; paid: number; owed: number };

const counts = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// The khata tab: what to make on one day against her limit and the money of
// that day, a chip for each day with orders or closed, any other day she
// picks, and the money of the last 30 days. The soonest day shows first. One
// touch closes the chosen day. It loads when the desk opens and again after
// the board changes; the old numbers stay until the new ones arrive.
export function createDailyView({
  root,
  api,
  text,
  latinNames,
  templates,
  stock,
}: {
  root: HTMLElement;
  api: Pick<Api, "get">;
  text: Text;
  latinNames: ReadonlyMap<string, string | null>;
  templates: { row: HTMLTemplateElement; chip: HTMLTemplateElement };
  stock: Pick<
    Stock,
    "closedDays" | "isClosed" | "close" | "failure" | "subscribe"
  >;
}): DailyView {
  const title = part(root, "#daily-title");
  const chips = part(root, "#daily-chips");
  const shown = part(root, "#daily-shown");
  const empty = part(root, "#daily-empty");
  const month = part(root, "#daily-month");
  const problem = part(root, "#daily-problem");
  const pick = part<HTMLInputElement>(root, "#daily-pick");
  const close = part<HTMLInputElement>(root, "#daily-close");
  const closeState = part(root, "#daily-close-state");
  const closeError = part(root, "#daily-close-error");
  const wait = createWait({
    control: root,
    line: root.querySelector("#daily-wait"),
  });
  let list: DailyList | undefined;
  let chosen: Day | undefined;
  let picked: Day | undefined;
  let chipDays = "";

  const render = () => {
    if (list === undefined) return;
    const { today } = list;
    const days = khataDays(list, stock.closedDays(), picked);
    if (!days.some((each) => each.day === chosen)) chosen = days[0]?.day;
    const day = days.find((each) => each.day === chosen);
    title.textContent =
      day === undefined || day.day === today
        ? text.t("desk.daily.today_title")
        : text.t("desk.daily.day_title", { day: text.day(day.day, "long") });

    const key = days.map((each) => `${each.day}${each.closed}`).join();
    if (key !== chipDays) {
      chipDays = key;
      chips.replaceChildren(
        ...[...chips.children].filter((child) => child.matches("legend")),
        ...days.map((each) => {
          const chip = clone(templates.chip);
          const radio = part<HTMLInputElement>(chip, "input");
          radio.value = each.day;
          const name = chipName(each.day, today, text);
          part(chip, "span").textContent = each.closed
            ? text.t("desk.daily.chip_closed", { day: name })
            : name;
          return chip;
        }),
      );
    }
    for (const radio of chips.querySelectorAll<HTMLInputElement>("input")) {
      radio.checked = radio.value === chosen;
    }
    chips.hidden = days.length === 0;
    pick.min = today;
    pick.max = addDays(today, closeAheadDays);

    empty.hidden = day !== undefined;
    shown.hidden = day === undefined;
    if (day !== undefined) {
      fillGauge(
        shown,
        {
          unit: list.limit_unit,
          limit: list.daily_limit,
          load: day.load,
          past: day.day < today,
        },
        text,
      );
      close.checked = day.closed;
      closeState.textContent = text.t(closeStateOf(day));
      const failed = stock.failure();
      const words =
        failed?.change.kind === "closed" && failed.change.day === day.day
          ? text.error(failed.error, "desk")
          : "";
      closeError.textContent = words;
      closeError.hidden = words === "";
      part(shown, "#daily-none").hidden = day.orders > 0;
      part(shown, "#daily-make").hidden = day.items.length === 0;
      part(shown, "#daily-rows").replaceChildren(
        ...day.items.map((item) => {
          const row = clone(templates.row);
          showName(
            {
              first: part(row, ".line-item"),
              second: part(row, ".line-latin"),
            },
            shownName(
              {
                name: item.name,
                name_latin: latinNames.get(item.item_id) ?? null,
              },
              text.language,
            ),
            text.language,
          );
          part(row, ".make-amount").textContent = madeAmount(item, text);
          part(row, ".make-packs").textContent = packsText(item.packs);
          return row;
        }),
      );
      fillMoney(part(shown, "#daily-money"), day);
    }

    month.hidden = false;
    part(month, "#daily-range").textContent =
      `${text.day(list.last_30_days.from, "short")} – ${text.day(list.last_30_days.to, "short")}`;
    fillMoney(month, list.last_30_days);
  };

  chips.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    chosen = event.target.value;
    render();
  });
  pick.addEventListener("change", () => {
    if (pick.value === "" || !pick.checkValidity()) return;
    picked = pick.value;
    chosen = pick.value;
    pick.value = "";
    render();
    chips
      .querySelector<HTMLInputElement>(`input[value="${chosen}"]`)
      ?.focus({ preventScroll: true });
  });
  // The day she touched stays in the list when she opens it again, so that
  // the khata does not jump to another day under her hand.
  close.addEventListener("change", () => {
    if (chosen === undefined) return;
    picked = chosen;
    stock.close(chosen, close.checked);
  });
  stock.subscribe(render);

  return {
    async load() {
      try {
        const answer = await wait.run(
          (signal) => api.get("/api/desk/daily", dailyListSchema, { signal }),
          text.t("desk.daily.opening"),
          { restart: true },
        );
        problem.hidden = true;
        list = answer;
        render();
      } catch (error) {
        const words = text.error(error, "desk");
        if (words === "") return;
        part(problem, ".error").textContent = words;
        problem.hidden = false;
      }
    },
  };
}

function chipName(day: Day, today: Day, text: Text): string {
  if (day === today) return text.t("desk.day.today");
  if (day === addDays(today, 1)) return text.t("desk.day.tomorrow");
  return text.day(day, "short");
}

function fillMoney(root: ParentNode, money: Money): void {
  const values: Record<keyof Money, number> = money;
  for (const cell of root.querySelectorAll<HTMLElement>("[data-money]")) {
    const key = cell.dataset.money as keyof Money | undefined;
    if (key === undefined || !(key in values)) continue;
    const value = values[key];
    cell.textContent =
      key === "orders" ? counts.format(value) : formatMoney(value);
    cell.toggleAttribute("data-zero", value === 0);
  }
}

function clone(template: HTMLTemplateElement): HTMLElement {
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
  if (found === null) throw new Error(`The khata has no ${selector}.`);
  return found;
}
