import type { BulkItem, ListedStore } from "../../shared/bulk.ts";
import { nameText, shownName, spokenName } from "../../shared/item-names.ts";
import type { StoreRating } from "../../shared/search.ts";
import type { Api } from "../api/api.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { showRating } from "../home/cook-card.ts";
import {
  createContactDialog,
  type ContactSounds,
} from "../quotes/contact-dialog.ts";
import { fromHtml } from "../quotes/fragment.ts";
import { amountWords, unitPrice } from "../quotes/summary.ts";
import type { Sounds } from "../sound/engine.ts";
import { formatMoney } from "../text/format.ts";
import type { Text } from "../text/text.ts";
import {
  createBulkCart,
  type BulkCartState,
  type BulkLine,
  type StoreCart,
  underMinimum,
} from "./bulk-cart.ts";
import "./bulk-view.css";
import html from "./bulk-view.html?raw";

// rating: her stars, when the page has them.
export type BulkStoreEntry = {
  store: ListedStore;
  rating?: StoreRating | null;
  line: string | null;
  items: readonly BulkItem[];
};

// limit: a quantity under the minimum of its item.
export type BulkSounds = ContactSounds & Pick<Sounds, "limit">;

type CartNode = {
  root: HTMLElement;
  show(cart: StoreCart): void;
};

// The bulk items of stores with a quantity for each, and a bulk cart for
// each store with its own Contact seller. The homepage shows many stores;
// her store page shows one. primary: each Contact seller is the primary
// button, as the same action for each store is the one primary action of
// the page.
export function createBulkView({
  api,
  text,
  primary,
  sounds,
}: {
  api: Api;
  text: Text;
  primary: boolean;
  sounds: BulkSounds;
}) {
  const parts = fromHtml(html, text);
  const template = (name: string) =>
    find(parts, `.${name}-template`, HTMLTemplateElement);
  const inputs = new Map<string, HTMLInputElement>();
  const dialog = createContactDialog({ api, text, sounds });
  const cartBody = cloneTemplate(template("bulk-cart"));
  const storesRoot = find(cartBody, ".bulk-cart-stores", HTMLElement);
  const nodes = new Map<string, CartNode>();
  const cart = createBulkCart(render);
  const nameOf = (item: BulkItem) => nameText(shownName(item, text.language));

  // The head of a cook card: "Area · her bulk line", her name and her stars.
  function storeCard(entry: BulkStoreEntry, link: boolean): HTMLElement {
    const card = cloneTemplate(template("bulk-store"));
    const name = find(card, ".bulk-store-name", HTMLAnchorElement);
    name.textContent = entry.store.name;
    if (link) name.href = `/s/${encodeURIComponent(entry.store.slug)}`;
    else name.removeAttribute("href");
    find(card, ".bulk-store-demo", HTMLElement).hidden = !entry.store.is_demo;
    const kind = find(card, ".bulk-store-kind", HTMLElement);
    kind.textContent = [entry.store.area, entry.line]
      .filter(Boolean)
      .join(" · ");
    kind.title = kind.textContent;
    showRating(
      find(card, ".bulk-store-rating", HTMLElement),
      entry.rating ?? null,
      text,
    );
    const rows = find(card, "tbody", HTMLElement);
    for (const item of entry.items) rows.append(itemRow(entry.store, item));
    return card;
  }

  function itemRow(store: ListedStore, item: BulkItem): HTMLElement {
    const row = cloneTemplate(template("bulk-item"));
    row.dataset.item = item.id;
    const mark = find(row, ".food-mark", HTMLElement);
    if (item.veg_mark !== "veg") mark.dataset.food = "non-veg";
    mark.setAttribute("aria-label", text.t(`catering.mark.${item.veg_mark}`));
    const shown = shownName(item, text.language);
    const words = find(row, ".bulk-item-words", HTMLElement);
    words.textContent = shown.primary;
    if (shown.lang !== text.language) words.lang = shown.lang;
    const second = find(row, ".bulk-item-second", HTMLElement);
    second.hidden = shown.secondary === null;
    second.textContent = shown.secondary ?? "";
    find(row, ".bulk-item-min", HTMLElement).textContent = text.t("bulk.min", {
      amount: amountWords(item.min_qty, item.unit, text),
    });
    const price = find(row, ".bulk-item-price", HTMLElement);
    price.textContent = unitPrice(item.price, item.unit, text);
    price.classList.toggle("num", item.price !== null);
    find(row, ".bulk-item-unit", HTMLElement).textContent = text.t(
      `bulk.unit.${item.unit}`,
    );
    const input = find(row, "input", HTMLInputElement);
    input.min = String(item.min_qty);
    input.placeholder = String(item.min_qty);
    input.setAttribute(
      "aria-label",
      text.t("bulk.item.quantity", { name: spokenName(shown) }),
    );
    input.addEventListener("input", () =>
      cart.set(store, item, input.value === "" ? 0 : input.valueAsNumber),
    );
    input.addEventListener("change", () => {
      if (input.value !== "" && underMinimum(input.valueAsNumber, item)) {
        sounds.limit();
      }
    });
    inputs.set(`${store.id}/${item.id}`, input);
    return row;
  }

  function cartNode(store: StoreCart["store"]): CartNode {
    const root = cloneTemplate(template("bulk-cart-store"));
    const title = find(root, ".bulk-cart-store-name", HTMLElement);
    title.id = `bulk-cart-${store.id}`;
    title.textContent = text.t("bulk.cart.store", { store: store.name });
    root.setAttribute("aria-labelledby", title.id);
    const lines = find(root, ".bulk-cart-lines", HTMLElement);
    const total = find(root, ".bulk-cart-total", HTMLElement);
    const problem = find(root, ".bulk-cart-problem", HTMLElement);
    const contact = find(root, ".bulk-contact", HTMLButtonElement);
    contact.setAttribute("aria-describedby", title.id);
    contact.addEventListener("click", () => contactStore(store.id));
    return {
      root,
      show(next) {
        lines.replaceChildren(
          ...next.lines.map((line) => {
            const item = document.createElement("li");
            item.textContent = lineWords(line);
            return item;
          }),
        );
        total.textContent =
          next.estimate === null
            ? text.t("bulk.cart.on_request")
            : formatMoney(next.estimate);
        const short = next.short[0];
        problem.textContent =
          short === undefined
            ? ""
            : text.t("bulk.cart.short", {
                name: nameOf(short.item),
                amount: amountWords(short.item.min_qty, short.item.unit, text),
              });
        contact.className = `${primary ? "btn-primary" : "btn-plain"} bulk-contact`;
        contact.disabled = short !== undefined;
      },
    };
  }

  function render(state: BulkCartState): void {
    for (const [id, node] of nodes) {
      if (state.carts.some(({ store }) => store.id === id)) continue;
      node.root.remove();
      nodes.delete(id);
    }
    for (const each of state.carts) {
      let node = nodes.get(each.store.id);
      if (node === undefined) {
        node = cartNode(each.store);
        nodes.set(each.store.id, node);
        storesRoot.append(node.root);
      }
      node.show(each);
    }
    find(cartBody, ".bulk-cart-empty", HTMLElement).hidden =
      state.carts.length > 0;
    find(cartBody, ".bulk-cart-many", HTMLElement).hidden =
      state.carts.length < 2;
  }

  function lineWords({ item, quantity }: BulkLine): string {
    const amount = amountWords(quantity, item.unit, text);
    return item.price === null
      ? `${nameOf(item)}: ${amount}`
      : `${nameOf(item)}: ${amount} · ${formatMoney(item.price * quantity)}`;
  }

  function contactStore(storeId: string): void {
    const chosen = cart.state.carts.find(({ store }) => store.id === storeId);
    if (chosen === undefined || chosen.short.length > 0) return;
    const { store, lines } = chosen;
    dialog.open(
      {
        store: store.name,
        lines: lines.map(lineWords),
        names: new Map(lines.map(({ item }) => [item.id, nameOf(item)])),
        request: {
          kind: "bulk",
          store_id: store.id,
          lines: lines.map(({ item, quantity }) => ({
            item_id: item.id,
            quantity,
          })),
          need_by: null,
          place: null,
        },
      },
      () => {
        cart.clear(store.id);
        for (const [key, input] of inputs) {
          if (key.startsWith(`${store.id}/`)) input.value = "";
        }
      },
      cartBody,
    );
  }

  render(cart.state);

  return { storeCard, cartBody };
}
