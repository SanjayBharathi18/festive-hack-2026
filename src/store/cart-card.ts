import {
  cartCount,
  cartTotal,
  type Cart,
  type MenuPack,
} from "../cart/cart.ts";
import { shownName } from "../../shared/item-names.ts";
import { showName } from "../cart/name-view.ts";
import { packLabel } from "../cart/pack-label.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { formatMoney } from "../text/format.ts";
import type { Text } from "../text/text.ts";

export type CartCard = {
  update(cart: Cart, orderHref: string | null): void;
  readonly total: HTMLElement;
};

// The cart beside the menu: each line, the total, the days and the one
// primary action. Until a day fits the cart, Order waits and the day line
// says why.
export function createCartCard({
  root,
  packs,
  takingOrders,
  text,
}: {
  root: HTMLElement;
  packs: ReadonlyMap<string, MenuPack>;
  takingOrders: boolean;
  text: Text;
}): CartCard {
  const el = (selector: string) => find(root, selector, HTMLElement);
  const total = el("#cart-total");
  const order = find(root, "#order-link", HTMLAnchorElement);
  const lineTemplate = find(document, "#line-template", HTMLTemplateElement);
  const plural = new Intl.PluralRules(`${text.language}-IN`);

  const lineRow = (packId: string, quantity: number, price: number) => {
    const found = packs.get(packId);
    if (found === undefined) return [];
    const row = cloneTemplate(lineTemplate);
    showName(
      {
        first: find(row, ".line-item", HTMLElement),
        second: find(row, ".line-latin", HTMLElement),
      },
      shownName(found.item, text.language),
      text.language,
    );
    find(row, ".line-amount", HTMLElement).textContent =
      `${quantity} × ${packLabel(found.pack, text)}`;
    find(row, ".line-price", HTMLElement).textContent = formatMoney(
      quantity * price,
    );
    return [row];
  };

  return {
    total,
    update(cart, orderHref) {
      const count = cartCount(cart);
      const empty = count === 0;
      el("#cart-count-line").hidden = empty;
      el("#cart-count").textContent = String(count);
      el("#cart-items-word").textContent =
        plural.select(count) === "one"
          ? text.t("store.cart.item_one")
          : text.t("store.cart.item_other");
      el("#cart-empty").hidden = !empty;
      el("#cart-table").hidden = empty;
      el("#cart-sum").hidden = empty;
      el("#cart-lines").replaceChildren(
        ...cart.lines.flatMap((line) =>
          lineRow(line.pack_id, line.quantity, line.price),
        ),
      );
      total.textContent = formatMoney(cartTotal(cart));
      el("#day-list").hidden = empty;
      order.hidden = empty || !takingOrders;
      if (orderHref === null) {
        order.removeAttribute("href");
        order.setAttribute("aria-disabled", "true");
      } else {
        order.href = orderHref;
        order.removeAttribute("aria-disabled");
      }
    },
  };
}
