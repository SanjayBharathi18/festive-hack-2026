import type { Category } from "../../shared/model.ts";
import type { MenuItem, MenuSection, Pack } from "../../shared/store.ts";
import { quantityOf, type Cart } from "../cart/cart.ts";
import { shownName, spokenName } from "../../shared/item-names.ts";
import { showName } from "../cart/name-view.ts";
import { packLabel } from "../cart/pack-label.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { formatMoney } from "../text/format.ts";
import type { Text, TextKey } from "../text/text.ts";
import { createRepeat } from "./stepper-repeat.ts";
import type { VoiceMark } from "./voice-result.ts";

export type MenuTemplates = {
  category: HTMLTemplateElement;
  section: HTMLTemplateElement;
  item: HTMLTemplateElement;
  pack: HTMLTemplateElement;
};

export type CanStep = (packId: string, delta: 1 | -1) => boolean;

export type MenuView = {
  update(
    cart: Cart,
    marks: ReadonlyMap<string, VoiceMark>,
    canStep: CanStep,
  ): void;
  choose(packIds: Iterable<string>): void;
  packChip(packId: string): HTMLElement | undefined;
};

type Chip = { label: HTMLElement; input: HTMLInputElement; count: HTMLElement };

type ItemCard = {
  name: string;
  locked: boolean;
  packs: ReadonlyMap<string, Pack>;
  chosen: Pack;
  chips: Map<string, Chip>;
  price: HTMLElement;
  stepper: HTMLElement;
  less: HTMLButtonElement;
  more: HTMLButtonElement;
  count: HTMLOutputElement;
};

const categoryIcons: Record<Category, string> = {
  sweets: "/icons.svg#sweets",
  snacks: "/icons.svg#snacks",
  savouries: "/icons.svg#savouries",
  meals: "/icons.svg#meals",
};

// The menu as a grid of item cards. Each card shows its packs as chips; the
// stepper adds or takes out the chosen pack. The chips above the menu show
// one section, or all of them.
export function createMenuView({
  root,
  filter,
  templates,
  text,
  sections,
  cart,
  takingOrders,
  onStep,
  onPack,
}: {
  root: HTMLElement;
  filter: HTMLElement;
  templates: MenuTemplates;
  text: Text;
  sections: readonly MenuSection[];
  cart: Cart;
  takingOrders: boolean;
  onStep: (pack: Pack, delta: 1 | -1, from: HTMLElement) => boolean;
  // A pack chosen in the row of its item, by its place (0 is the smallest).
  onPack: (index: number) => void;
}): MenuView {
  const cards: ItemCard[] = [];
  const cardOfPack = new Map<string, ItemCard>();
  const list = new Intl.ListFormat(`${text.language}-IN`, {
    style: "long",
    type: "conjunction",
  });
  let shown: {
    cart: Cart;
    marks: ReadonlyMap<string, VoiceMark>;
    canStep: CanStep;
  } = { cart, marks: new Map(), canStep: () => false };

  const wireStep = (
    button: HTMLButtonElement,
    card: ItemCard,
    delta: 1 | -1,
  ) => {
    const repeat = createRepeat(() => onStep(card.chosen, delta, button));
    button.addEventListener("pointerdown", (event) => {
      if (event.button === 0 && !button.disabled) repeat.press();
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      button.addEventListener(type, () => repeat.release());
    }
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (!repeat.takeRepeated()) onStep(card.chosen, delta, button);
    });
  };

  const renderCard = (card: ItemCard) => {
    const { cart: current, marks, canStep } = shown;
    const pack = card.chosen;
    const quantity = quantityOf(current, pack.id);
    const what = `${card.name}, ${packLabel(pack, text)}`;
    card.price.textContent = formatMoney(pack.price);
    card.stepper.dataset.count = String(quantity);
    card.stepper.setAttribute("aria-label", what);
    card.count.value = String(quantity);
    card.count.classList.toggle("draft", marks.has(pack.id));
    card.less.setAttribute(
      "aria-label",
      text.t("store.item.less", { item: what }),
    );
    card.more.setAttribute(
      "aria-label",
      text.t(quantity === 0 ? "store.item.add_label" : "store.item.more", {
        item: what,
      }),
    );
    card.less.disabled = card.locked || quantity === 0;
    card.more.disabled = card.locked || !canStep(pack.id, 1);
    for (const [id, chip] of card.chips) {
      const inCart = quantityOf(current, id);
      chip.input.checked = id === pack.id;
      chip.count.textContent =
        inCart === 0 || id === pack.id ? "" : `×${inCart}`;
      chip.count.classList.toggle("draft", marks.has(id));
    }
    if (quantity === 0 && document.activeElement === card.less) {
      card.more.focus();
    }
  };

  const renderPack = (item: MenuItem, pack: Pack) => {
    const label = cloneTemplate(templates.pack);
    const input = find(label, "input", HTMLInputElement);
    input.name = `pack-${item.id}`;
    input.value = pack.id;
    input.disabled = item.sold_out;
    find(label, ".pack-size", HTMLElement).textContent = packLabel(pack, text);
    find(label, ".pack-price", HTMLElement).textContent = formatMoney(
      pack.price,
    );
    return { label, input, count: find(label, ".pack-count", HTMLElement) };
  };

  const renderItem = (item: MenuItem) => {
    const node = cloneTemplate(templates.item);
    node.dataset.soldOut = String(item.sold_out);
    const shown = shownName(item, text.language);
    const mark = find(node, ".food-mark", HTMLElement);
    if (item.veg_mark !== "veg") mark.dataset.food = "non-veg";
    mark.setAttribute(
      "aria-label",
      text.t(item.veg_mark === "veg" ? "store.item.veg" : "store.item.non_veg"),
    );
    showName(
      {
        first: find(node, ".item-native", HTMLElement),
        second: find(node, ".item-latin", HTMLElement),
      },
      shown,
      text.language,
    );
    find(node, ".item-special", HTMLElement).hidden = !item.special;
    find(node, ".item-sold-out", HTMLElement).hidden = !item.sold_out;
    const meta = find(node, ".item-meta", HTMLElement);
    const facts = [
      ...(item.veg_mark === "egg" ? [text.t("store.item.egg")] : []),
      ...(item.allergens.length === 0
        ? []
        : [
            text.t("store.item.contains", {
              list: list.format(item.allergens.map(allergenWord)),
            }),
          ]),
    ];
    meta.textContent = facts.join(" · ");
    meta.hidden = facts.length === 0;
    const box = find(node, ".item-box", HTMLElement);
    if (item.box_contents !== null) {
      box.textContent = text.t("store.item.box", { list: item.box_contents });
      box.hidden = false;
    }

    const name = spokenName(shown);
    const chips = new Map(
      item.packs.map((pack) => [pack.id, renderPack(item, pack)]),
    );
    const fieldset = find(node, ".packs", HTMLFieldSetElement);
    find(fieldset, "legend", HTMLElement).textContent = text.t(
      "store.item.packs",
      {
        item: name,
      },
    );
    fieldset.append(...[...chips.values()].map((chip) => chip.label));

    const [first] = item.packs;
    if (first === undefined) return node;
    const card: ItemCard = {
      name,
      locked: item.sold_out || !takingOrders,
      packs: new Map(item.packs.map((pack) => [pack.id, pack])),
      chosen: item.packs.find((pack) => quantityOf(cart, pack.id) > 0) ?? first,
      chips,
      price: find(node, ".item-price", HTMLElement),
      stepper: find(node, ".item-step", HTMLElement),
      less: find(node, ".step-less", HTMLButtonElement),
      more: find(node, ".step-more", HTMLButtonElement),
      count: find(node, ".step-count", HTMLOutputElement),
    };
    fieldset.addEventListener("change", (event) => {
      const pack =
        event.target instanceof HTMLInputElement
          ? card.packs.get(event.target.value)
          : undefined;
      if (pack === undefined) return;
      card.chosen = pack;
      renderCard(card);
      onPack(item.packs.indexOf(pack));
    });
    wireStep(card.less, card, -1);
    wireStep(card.more, card, 1);
    cards.push(card);
    for (const pack of item.packs) cardOfPack.set(pack.id, card);
    return node;
  };

  const allergenWord = (code: string) => {
    const key = `store.allergen.${code}`;
    const word = text.t(key as TextKey);
    return word === key ? code : word;
  };

  const sectionNodes = sections.map((section) => {
    const node = cloneTemplate(templates.section);
    find(node, ".menu-head use", SVGUseElement).setAttribute(
      "href",
      categoryIcons[section.category],
    );
    find(node, ".menu-head-word", HTMLElement).textContent = text.t(
      `store.category.${section.category}`,
    );
    find(node, ".menu-items", HTMLElement).replaceChildren(
      ...section.items.map(renderItem),
    );
    return { category: section.category, node };
  });
  root.replaceChildren(...sectionNodes.map(({ node }) => node));

  filter.hidden = sections.length < 2;
  filter.append(
    ...sections.map((section) => {
      const chip = cloneTemplate(templates.category);
      chip.dataset.category = section.category;
      find(chip, "use", SVGUseElement).setAttribute(
        "href",
        categoryIcons[section.category],
      );
      find(chip, ".category-word", HTMLElement).textContent = text.t(
        `store.category.${section.category}`,
      );
      return chip;
    }),
  );
  filter.addEventListener("click", (event) => {
    const chip =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-category]")
        : null;
    if (chip === null) return;
    const category = chip.dataset.category ?? "";
    for (const other of filter.querySelectorAll<HTMLElement>(
      "[data-category]",
    )) {
      other.setAttribute("aria-pressed", String(other === chip));
    }
    for (const section of sectionNodes) {
      section.node.hidden = category !== "" && section.category !== category;
    }
  });

  return {
    update(cart, marks, canStep) {
      shown = { cart, marks, canStep };
      for (const card of cards) renderCard(card);
    },
    choose(packIds) {
      const changed = new Set<ItemCard>();
      for (const id of packIds) {
        const card = cardOfPack.get(id);
        const pack = card?.packs.get(id);
        if (card === undefined || pack === undefined || changed.has(card))
          continue;
        card.chosen = pack;
        changed.add(card);
      }
      for (const card of changed) renderCard(card);
    },
    packChip(packId) {
      return cardOfPack.get(packId)?.chips.get(packId)?.label;
    },
  };
}
