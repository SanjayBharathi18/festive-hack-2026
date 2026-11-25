import type { SetupItem } from "../../shared/setup.ts";
import { itemName, nameFor } from "../cart/item-name.ts";
import { packLabel } from "../cart/pack-label.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { formatMoney } from "../text/format.ts";
import type { Text } from "../text/text.ts";

export type ItemsView = {
  // While she checks a reading, its Add this item is the primary action.
  render(items: readonly SetupItem[], checking?: boolean): void;
  showUndo(words: string | undefined): void;
};

// Her items as rows: the mark, the names, the section and the packs, with
// Change and Remove. With no item yet, Add an item is the primary action.
export function createItemsView({
  root,
  template,
  text,
  onAdd,
  onChange,
  onRemove,
  onUndo,
  onNext,
}: {
  root: HTMLElement;
  template: HTMLTemplateElement;
  text: Text;
  onAdd: () => void;
  onChange: (item: SetupItem) => void;
  onRemove: (item: SetupItem) => void;
  onUndo: () => void;
  onNext: () => void;
}): ItemsView {
  const list = find(root, "#item-rows", HTMLUListElement);
  const empty = find(root, "#items-empty", HTMLElement);
  const add = find(root, "#add-item", HTMLButtonElement);
  const next = find(root, "#items-next", HTMLButtonElement);
  const undoLine = find(root, "#items-undo", HTMLElement);
  const undoWords = find(root, "#items-undo-words", HTMLElement);
  const undoButton = find(root, "#items-undo-button", HTMLButtonElement);
  add.addEventListener("click", onAdd);
  next.addEventListener("click", onNext);
  undoButton.addEventListener("click", onUndo);

  const row = (item: SetupItem) => {
    const node = cloneTemplate(template);
    const names = itemName(item.name, item.name_latin);
    const name = nameFor(names, text.language);
    const mark = find(node, ".food-mark", HTMLElement);
    if (item.veg_mark !== "veg") mark.dataset.food = "non-veg";
    mark.setAttribute(
      "aria-label",
      text.t(
        item.veg_mark === "veg"
          ? "store.item.veg"
          : item.veg_mark === "egg"
            ? "store.item.egg"
            : "store.item.non_veg",
      ),
    );
    const native = find(node, ".item-native", HTMLElement);
    native.textContent = names.name;
    if (names.lang !== undefined && names.lang !== text.language) {
      native.lang = names.lang;
    }
    const latin = find(node, ".item-latin", HTMLElement);
    if (names.latin === null) latin.remove();
    else latin.textContent = names.latin;
    find(node, ".item-row-category", HTMLElement).textContent = text.t(
      `store.category.${item.category}`,
    );
    find(node, ".item-row-packs", HTMLElement).textContent = item.packs
      .map((pack) => `${packLabel(pack, text)} ${formatMoney(pack.price)}`)
      .join(" · ");
    const box = find(node, ".item-row-box", HTMLElement);
    box.hidden = item.box_contents === null;
    box.textContent =
      item.box_contents === null
        ? ""
        : text.t("store.item.box", { list: item.box_contents });
    const contains = find(node, ".item-row-allergens", HTMLElement);
    const allergens = item.allergens ?? [];
    contains.hidden = allergens.length === 0;
    contains.textContent =
      allergens.length === 0
        ? ""
        : text.t("store.item.contains", {
            list: allergens
              .map((allergen) => text.t(`store.allergen.${allergen}`))
              .join(", "),
          });
    const change = find(node, ".item-change", HTMLButtonElement);
    change.setAttribute(
      "aria-label",
      text.t("sell.items.change_label", { item: name }),
    );
    change.addEventListener("click", () => onChange(item));
    const remove = find(node, ".item-remove", HTMLButtonElement);
    remove.setAttribute(
      "aria-label",
      text.t("sell.items.remove_label", { item: name }),
    );
    remove.addEventListener("click", () => onRemove(item));
    return node;
  };

  return {
    render(items, checking = false) {
      list.replaceChildren(...items.map(row));
      list.hidden = items.length === 0;
      empty.hidden = items.length > 0;
      next.hidden = items.length === 0;
      add.className =
        items.length === 0 && !checking ? "btn-primary" : "btn-plain";
      next.className = checking ? "btn-plain" : "btn-primary";
    },
    showUndo(words) {
      if (words === undefined && undoLine.contains(document.activeElement)) {
        add.focus();
      }
      undoLine.hidden = words === undefined;
      undoWords.textContent = words ?? "";
      if (words !== undefined) undoButton.focus();
    },
  };
}
