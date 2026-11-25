import type { Day } from "../../shared/day.ts";
import { fillLineName } from "../buyer/line-name.ts";
import { cartTotal, type Cart, type MenuPack } from "../cart/cart.ts";
import { packLabel } from "../cart/pack-label.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { formatMoney } from "../text/format.ts";
import type { Text } from "../text/text.ts";

// The order slip before it is placed: each line with its mark, its names,
// its packs and price, then the total, and the day with a way to change it.
export function showSummary({
  lines,
  total,
  day,
  template,
  cart,
  packs,
  orderDay,
  text,
}: {
  lines: HTMLElement;
  total: HTMLElement;
  day: HTMLElement;
  template: HTMLTemplateElement;
  cart: Cart;
  packs: ReadonlyMap<string, MenuPack>;
  orderDay: Day | null;
  text: Text;
}): void {
  lines.replaceChildren(
    ...cart.lines.flatMap((line) => {
      const found = packs.get(line.pack_id);
      if (found === undefined) return [];
      const row = cloneTemplate(template);
      fillLineName(row, found.item, text);
      find(row, ".line-amount", HTMLElement).textContent =
        `${line.quantity} × ${packLabel(found.pack, text)}`;
      find(row, ".line-price", HTMLElement).textContent = formatMoney(
        line.quantity * line.price,
      );
      return [row];
    }),
  );
  total.textContent = formatMoney(cartTotal(cart));
  day.textContent = orderDay === null ? "" : text.day(orderDay, "long");
}
