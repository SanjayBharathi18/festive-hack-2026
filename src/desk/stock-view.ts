import type { MenuItem } from "../../shared/store.ts";
import type { Text } from "../text/text.ts";
import { nameText, shownName } from "../../shared/item-names.ts";
import { showName } from "../cart/name-view.ts";
import type { Stock, StockFailure } from "./stock.ts";

// The Menu stock tab and the pause notice on the board: a switch for the
// whole store and one for each item. Each switch shows what her stock says,
// so a change that the server refused goes back by itself.
export function createStockView({
  root,
  notice,
  stock,
  menu,
  text,
  template,
}: {
  root: HTMLElement;
  notice: HTMLElement;
  stock: Stock;
  menu: readonly MenuItem[];
  text: Text;
  template: HTMLTemplateElement;
}): void {
  const pause = part<HTMLInputElement>(root, "#pause");
  const pauseState = part(root, "#pause-state");
  const error = part(root, "#stock-error");
  const list = part(root, "#stock-items");
  const names = new Map(
    menu.map((item) => [item.id, nameText(shownName(item, text.language))]),
  );
  const switches = new Map<string, HTMLInputElement>();

  list.replaceChildren(
    ...menu.map((item) => {
      const row = template.content.firstElementChild?.cloneNode(true);
      if (!(row instanceof HTMLElement)) {
        throw new Error("The stock item template needs one element.");
      }
      fillItem(row, item, text);
      const input = part<HTMLInputElement>(row, "input");
      input.value = item.id;
      switches.set(item.id, input);
      return row;
    }),
  );
  if (menu.length === 0) {
    const empty = document.createElement("li");
    empty.className = "stock-empty";
    empty.textContent = text.t("desk.stock.empty");
    list.append(empty);
  }

  const render = () => {
    const paused = stock.paused();
    pause.checked = paused;
    pauseState.textContent = text.t(
      paused ? "desk.stock.paused_hint" : "desk.stock.taking_state",
    );
    notice.hidden = !paused;
    for (const [id, input] of switches) input.checked = stock.isSoldOut(id);
    const failed = stock.failure();
    const words = failed === undefined ? "" : failureWords(failed);
    error.textContent = words;
    error.hidden = words === "";
  };

  const failureWords = ({ change, error: cause }: StockFailure): string => {
    const reason = text.error(cause, "desk");
    if (change.kind === "closed" || reason === "") return "";
    const what =
      change.kind === "paused"
        ? text.t("desk.stock.pause")
        : (names.get(change.itemId) ?? "");
    return `${text.t("desk.stock.not_saved", { what })} ${reason}`;
  };

  pause.addEventListener("change", () => stock.pause(pause.checked));
  part(notice, "#resume").addEventListener("click", () => {
    stock.pause(false);
    pause.focus({ preventScroll: true });
  });
  list.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    stock.sellOut(event.target.value, event.target.checked);
  });
  stock.subscribe(render);
  render();
}

function fillItem(row: HTMLElement, item: MenuItem, text: Text): void {
  const mark = part(row, ".food-mark");
  if (item.veg_mark === "veg") delete mark.dataset.food;
  else mark.dataset.food = "non-veg";
  part(row, ".line-egg").hidden = item.veg_mark !== "egg";
  showName(
    { first: part(row, ".line-item"), second: part(row, ".line-latin") },
    shownName(item, text.language),
    text.language,
  );
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`The menu stock has no ${selector}.`);
  return found;
}
