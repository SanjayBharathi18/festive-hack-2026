import { shownName, type DishNames } from "../../shared/item-names.ts";
import type { VegMark } from "../../shared/model.ts";
import { showName } from "../cart/name-view.ts";
import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";

export type LineDish = DishNames & { veg_mark: VegMark };

// The name cell of an order line on a buyer page: the food mark, the name of
// the dish (in English, or in the buyer's script first and then in English),
// and Egg when it has egg.
export function fillLineName(
  row: ParentNode,
  dish: LineDish,
  text: Text,
): void {
  const mark = find(row, ".food-mark", HTMLElement);
  if (dish.veg_mark === "veg") delete mark.dataset.food;
  else mark.dataset.food = "non-veg";
  mark.setAttribute(
    "aria-label",
    text.t(dish.veg_mark === "veg" ? "store.item.veg" : "store.item.non_veg"),
  );
  showName(
    {
      first: find(row, ".line-item", HTMLElement),
      second: find(row, ".line-latin", HTMLElement),
    },
    shownName(dish, text.language),
    text.language,
  );
  const egg = find(row, ".line-egg", HTMLElement);
  egg.hidden = dish.veg_mark !== "egg";
  egg.textContent = text.t("store.item.egg");
}
