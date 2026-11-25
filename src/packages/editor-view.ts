import { cloneTemplate, find } from "../dom/dom.ts";
import { linkFields } from "../quotes/fragment.ts";
import type {
  CategoryValues,
  DishValues,
  PackageValues,
  ProblemPlace,
} from "./package-form.ts";

export type EditorView = {
  read(): PackageValues;
  fill(values: PackageValues): void;
  focus(at: ProblemPlace): void;
};

// The fields of the package editor, with a box for each category and a row
// for each of its dishes.
export function createEditorView(root: ParentNode): EditorView {
  const el = <T extends Element>(id: string, type: abstract new () => T) =>
    find(root, id, type);
  const categories = el("#categories", HTMLElement);
  const categoryTemplate = el("#category-template", HTMLTemplateElement);
  const dishTemplate = el("#dish-template", HTMLTemplateElement);
  const freeChoice = el("#free-choice", HTMLInputElement);
  const onRequest = el("#on-request", HTMLInputElement);
  const price = el("#price", HTMLInputElement);

  const sync = () => {
    price.disabled = onRequest.checked;
    el("#max-total-field", HTMLElement).hidden = freeChoice.checked;
    for (const field of root.querySelectorAll<HTMLElement>(".style-extra")) {
      field.hidden = !root.querySelector<HTMLInputElement>(
        `[name=style][value=${field.dataset.style ?? ""}]`,
      )?.checked;
    }
    for (const field of categories.querySelectorAll<HTMLElement>(
      ".limit-field",
    )) {
      field.hidden = freeChoice.checked;
    }
  };

  const addDish = (list: HTMLElement, dish: DishValues) => {
    const row = cloneTemplate(dishTemplate);
    linkFields(row);
    find(row, ".dish-name", HTMLInputElement).value = dish.name;
    find(row, ".dish-mark", HTMLSelectElement).value = dish.mark;
    find(row, ".dish-jain", HTMLInputElement).checked = dish.jain;
    find(row, ".dish-remove", HTMLButtonElement).addEventListener(
      "click",
      () => {
        row.remove();
        if (list.children.length === 0)
          addDish(list, { name: "", mark: "veg", jain: false });
      },
    );
    list.append(row);
    return row;
  };

  const addCategory = (category: CategoryValues) => {
    const box = cloneTemplate(categoryTemplate);
    linkFields(box);
    find(box, ".category-name", HTMLInputElement).value = category.name;
    find(box, ".category-min", HTMLInputElement).value = category.min;
    find(box, ".category-max", HTMLInputElement).value = category.max;
    const list = find(box, ".category-dishes", HTMLElement);
    for (const dish of category.dishes) addDish(list, dish);
    if (category.dishes.length === 0)
      addDish(list, { name: "", mark: "veg", jain: false });
    find(box, ".dish-add", HTMLButtonElement).addEventListener("click", () =>
      find(
        addDish(list, { name: "", mark: "veg", jain: false }),
        ".dish-name",
        HTMLInputElement,
      ).focus(),
    );
    find(box, ".category-remove", HTMLButtonElement).addEventListener(
      "click",
      () => {
        box.remove();
        if (categories.children.length === 0) {
          addCategory({ name: "", min: "", max: "", dishes: [] });
        }
      },
    );
    categories.append(box);
    sync();
    return box;
  };

  el("#add-category", HTMLButtonElement).addEventListener("click", () =>
    find(
      addCategory({ name: "", min: "", max: "", dishes: [] }),
      ".category-name",
      HTMLInputElement,
    ).focus(),
  );
  freeChoice.addEventListener("change", sync);
  onRequest.addEventListener("change", sync);
  for (const style of root.querySelectorAll("[name=style]")) {
    style.addEventListener("change", sync);
  }

  return {
    read: () => ({
      kind:
        root.querySelector<HTMLInputElement>("[name=kind]:checked")?.value ??
        "plate",
      name: el("#name", HTMLInputElement).value,
      price: price.value,
      onRequest: onRequest.checked,
      minCount: el("#min-count", HTMLInputElement).value,
      freeChoice: freeChoice.checked,
      maxTotal: el("#max-total", HTMLInputElement).value,
      styles: [
        ...root.querySelectorAll<HTMLInputElement>("[name=style]:checked"),
      ].map(({ value }) => value),
      staffExtra: el("#staff-extra", HTMLInputElement).value,
      countersExtra: el("#counters-extra", HTMLInputElement).value,
      categories: [...categories.querySelectorAll(".editor-category")].map(
        (box) => ({
          name: find(box, ".category-name", HTMLInputElement).value,
          min: find(box, ".category-min", HTMLInputElement).value,
          max: find(box, ".category-max", HTMLInputElement).value,
          dishes: [...box.querySelectorAll(".dish-row")].map((row) => ({
            name: find(row, ".dish-name", HTMLInputElement).value,
            mark: find(row, ".dish-mark", HTMLSelectElement).value,
            jain: find(row, ".dish-jain", HTMLInputElement).checked,
          })),
        }),
      ),
    }),
    fill(values) {
      for (const radio of root.querySelectorAll<HTMLInputElement>(
        "[name=kind]",
      )) {
        radio.checked = radio.value === values.kind;
      }
      el("#name", HTMLInputElement).value = values.name;
      price.value = values.price;
      onRequest.checked = values.onRequest;
      el("#min-count", HTMLInputElement).value = values.minCount;
      freeChoice.checked = values.freeChoice;
      el("#max-total", HTMLInputElement).value = values.maxTotal;
      for (const style of root.querySelectorAll<HTMLInputElement>(
        "[name=style]",
      )) {
        style.checked = values.styles.includes(style.value);
      }
      el("#staff-extra", HTMLInputElement).value = values.staffExtra;
      el("#counters-extra", HTMLInputElement).value = values.countersExtra;
      categories.replaceChildren();
      for (const category of values.categories) addCategory(category);
      sync();
    },
    focus(at) {
      if (!("category" in at)) {
        const fields = {
          name: "#name",
          price: "#price",
          min_count: "#min-count",
          styles: "[name=style]",
          staff_extra: "#staff-extra",
          counters_extra: "#counters-extra",
          max_total: "#max-total",
        };
        root.querySelector<HTMLElement>(fields[at.field])?.focus();
        return;
      }
      const box = categories.querySelectorAll(".editor-category")[at.category];
      const row = box?.querySelectorAll(".dish-row")[at.dish ?? 0];
      const target = {
        name: box?.querySelector(".category-name"),
        min: box?.querySelector(".category-min"),
        max: box?.querySelector(".category-max"),
        dish: row?.querySelector(".dish-name"),
        mark: row?.querySelector(".dish-mark"),
      }[at.field];
      if (target instanceof HTMLElement) target.focus();
    },
  };
}
