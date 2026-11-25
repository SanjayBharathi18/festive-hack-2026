import type { Category } from "../../shared/model.ts";
import { needsLatin, type SetupItem } from "../../shared/setup.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import type { CheckField, FormFill } from "./item-fill.ts";
import { itemOfFields, type ItemFields } from "./item-form.ts";
import {
  rowOfPack,
  suggestPacks,
  type PackRow,
  type PriceUnit,
} from "./packs.ts";

export type OpenOptions = {
  category?: Category | undefined;
  // What a reading heard: the form opens with it, with this item id, at
  // the field that she chose to change.
  reading?: { id: string; fill: FormFill; focus?: CheckField } | undefined;
};

export type ItemDialog = {
  open(item: SetupItem | undefined, options?: OpenOptions): void;
};

// The item form, in a dialog. From one price it fills the packs, until she
// changes a pack herself; then her packs stay as she made them.
export function createItemDialog({
  dialog,
  packTemplate,
  text,
  onSave,
  newId = () => crypto.randomUUID(),
}: {
  dialog: HTMLDialogElement;
  packTemplate: HTMLTemplateElement;
  text: Text;
  onSave: (item: SetupItem) => void;
  newId?: () => string;
}): ItemDialog {
  const form = find(dialog, "#item-form", HTMLFormElement);
  const title = find(dialog, "#item-dialog-title", HTMLElement);
  const name = find(form, "#item-name", HTMLInputElement);
  const latinField = find(form, "#item-latin-field", HTMLElement);
  const latin = find(form, "#item-latin", HTMLInputElement);
  const price = find(form, "#item-price", HTMLInputElement);
  const rows = find(form, "#pack-rows", HTMLUListElement);
  const packsError = find(form, "#packs-error", HTMLElement);
  const addPack = find(form, "#add-pack", HTMLButtonElement);
  const isBox = find(form, "#item-is-box", HTMLInputElement);
  const boxField = find(form, "#box-field", HTMLElement);
  const box = find(form, "#item-box", HTMLTextAreaElement);
  const draftLine = find(dialog, "#item-draft", HTMLElement);
  let itemId = "";
  let suggesting = true;
  let shown:
    | {
        key: string;
        item: SetupItem | undefined;
        category: string;
        reading: OpenOptions["reading"];
      }
    | undefined;
  let opened = "";
  let saving = false;
  let kept: KeptForm | undefined;

  const radios = (group: string) =>
    form.querySelectorAll<HTMLInputElement>(`input[name="${group}"]`);
  const checked = (group: string) =>
    [...radios(group)].find((input) => input.checked)?.value ?? "";
  const setRadio = (group: string, value: string) => {
    for (const input of radios(group)) input.checked = input.value === value;
  };
  const setAllergens = (values: readonly string[]) => {
    for (const input of radios("allergen")) {
      input.checked = values.includes(input.value);
    }
  };
  const per = (): PriceUnit => (checked("per") === "piece" ? "piece" : "kg");
  const field = <T extends Element>(
    node: Element,
    selector: string,
    type: abstract new () => T,
  ) => find(node, selector, type);

  const renumber = () => {
    const nodes = [...rows.querySelectorAll<HTMLElement>(".pack-row")];
    nodes.forEach((node, index) => {
      const number = index + 1;
      field(node, ".pack-amount", HTMLInputElement).setAttribute(
        "aria-label",
        text.t("sell.item.pack_amount", { number }),
      );
      field(node, ".pack-unit", HTMLSelectElement).setAttribute(
        "aria-label",
        text.t("sell.item.pack_unit", { number }),
      );
      field(node, ".pack-price", HTMLInputElement).setAttribute(
        "aria-label",
        text.t("sell.item.pack_price", { number }),
      );
      field(node, ".pack-remove", HTMLButtonElement).setAttribute(
        "aria-label",
        text.t("sell.item.pack_remove", { number }),
      );
    });
    price.setCustomValidity(
      nodes.length === 0 ? text.t("sell.item.packs_needed") : "",
    );
    if (nodes.length > 0) packsError.hidden = true;
  };

  const packRow = (row: PackRow | undefined, id: string) => {
    const node = cloneTemplate(packTemplate);
    node.dataset.id = id;
    const amount = field(node, ".pack-amount", HTMLInputElement);
    const unit = field(node, ".pack-unit", HTMLSelectElement);
    const rupees = field(node, ".pack-price", HTMLInputElement);
    if (row === undefined) {
      unit.value = per() === "piece" ? "pieces" : "g";
    } else {
      amount.value = String(row.amount);
      unit.value = row.unit;
      rupees.value = String(row.rupees);
    }
    node.addEventListener("input", () => {
      suggesting = false;
    });
    field(node, ".pack-remove", HTMLButtonElement).addEventListener(
      "click",
      () => {
        suggesting = false;
        const next = node.nextElementSibling ?? node.previousElementSibling;
        node.remove();
        renumber();
        (next?.querySelector<HTMLElement>(".pack-amount") ?? addPack).focus();
      },
    );
    return node;
  };

  const suggest = () => {
    if (!suggesting) return;
    rows.replaceChildren(
      ...suggestPacks(Number(price.value), per()).map((row) =>
        packRow(row, newId()),
      ),
    );
    renumber();
  };

  const fields = (): ItemFields => ({
    id: itemId,
    name: name.value,
    nameLatin: latin.value,
    category: checked("category"),
    vegMark: checked("veg_mark"),
    box: isBox.checked,
    boxContents: box.value,
    allergens: [...radios("allergen")]
      .filter((input) => input.checked)
      .map((input) => input.value),
    packs: [...rows.querySelectorAll<HTMLElement>(".pack-row")].map((node) => ({
      id: node.dataset.id ?? "",
      amount: field(node, ".pack-amount", HTMLInputElement).value,
      unit: field(node, ".pack-unit", HTMLSelectElement).value,
      rupees: field(node, ".pack-price", HTMLInputElement).value,
    })),
  });

  price.addEventListener("input", suggest);
  for (const input of radios("per")) input.addEventListener("change", suggest);
  name.addEventListener("input", () => {
    latinField.hidden = !needsLatin(name.value);
  });
  isBox.addEventListener("change", () => {
    boxField.hidden = !isBox.checked;
    box.required = isBox.checked;
    if (isBox.checked) box.focus();
  });
  addPack.addEventListener("click", () => {
    suggesting = false;
    const node = packRow(undefined, newId());
    rows.append(node);
    renumber();
    field(node, ".pack-amount", HTMLInputElement).focus();
  });
  for (const selector of ["#item-close", "#item-cancel"]) {
    find(dialog, selector, HTMLButtonElement).addEventListener("click", () =>
      dialog.close(),
    );
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const item = itemOfFields(fields());
    if (item === undefined) {
      packsError.textContent = text.t("sell.item.packs_needed");
      packsError.hidden = false;
      return;
    }
    onSave(item);
    saving = true;
    dialog.close();
  });

  // Escape, Close or Cancel keep what she typed, for the same item, until
  // she saves it or clears the form.
  const formNow = (): KeptForm => ({
    key: shown?.key ?? "new",
    fields: fields(),
    price: price.value,
    per: checked("per"),
    suggesting,
  });
  dialog.addEventListener("close", () => {
    const now = formNow();
    kept = saving || formText(now) === opened ? undefined : now;
    saving = false;
  });

  const fill = (item: SetupItem | undefined, category: string) => {
    form.reset();
    name.value = item?.name ?? "";
    latin.value = item?.name_latin ?? "";
    setRadio("category", item?.category ?? category);
    setRadio("veg_mark", item?.veg_mark ?? "");
    setAllergens(item?.allergens ?? []);
    isBox.checked = (item?.box_contents ?? null) !== null;
    box.value = item?.box_contents ?? "";
    rows.replaceChildren(
      ...(item?.packs ?? []).map((pack) => packRow(rowOfPack(pack), pack.id)),
    );
    suggesting = item === undefined;
  };
  const fillReading = (values: FormFill) => {
    fill(undefined, values.category);
    name.value = values.name;
    latin.value = values.nameLatin;
    setRadio("veg_mark", values.vegMark);
    setAllergens(values.allergens);
    price.value = values.rupees;
    setRadio("per", values.per);
    suggest();
  };
  const fillShown = () => {
    if (shown?.reading === undefined) fill(shown?.item, shown?.category ?? "");
    else fillReading(shown.reading.fill);
  };
  const restore = (draft: KeptForm) => {
    const { fields: values } = draft;
    name.value = values.name;
    latin.value = values.nameLatin;
    setRadio("category", values.category);
    setRadio("veg_mark", values.vegMark);
    setAllergens(values.allergens);
    isBox.checked = values.box;
    box.value = values.boxContents;
    price.value = draft.price;
    setRadio("per", draft.per);
    rows.replaceChildren(
      ...values.packs.map((pack) => {
        const node = packRow(undefined, pack.id);
        field(node, ".pack-amount", HTMLInputElement).value = pack.amount;
        field(node, ".pack-unit", HTMLSelectElement).value = pack.unit;
        field(node, ".pack-price", HTMLInputElement).value = pack.rupees;
        return node;
      }),
    );
    suggesting = draft.suggesting;
  };
  const settle = () => {
    latinField.hidden = !needsLatin(name.value);
    boxField.hidden = !isBox.checked;
    box.required = isBox.checked;
    packsError.hidden = true;
    renumber();
  };
  find(dialog, "#item-draft-clear", HTMLButtonElement).addEventListener(
    "click",
    () => {
      kept = undefined;
      fillShown();
      settle();
      opened = formText(formNow());
      draftLine.hidden = true;
      name.focus();
    },
  );

  const choice = (group: string): HTMLElement => {
    const inputs = [...radios(group)];
    return inputs.find((input) => input.checked) ?? inputs[0] ?? name;
  };
  const focusOf = (field: CheckField | undefined): HTMLElement => {
    switch (field) {
      case "latin":
        return latin;
      case "category":
        return choice("category");
      case "mark":
        return choice("veg_mark");
      case "price":
        return price;
      case "packs":
        return rows.querySelector<HTMLElement>(".pack-amount") ?? price;
      case "allergens":
        return choice("allergen");
      default:
        return name;
    }
  };

  return {
    open(item, { category = "", reading } = {}) {
      shown = {
        key: item?.id ?? (reading === undefined ? "new" : reading.id),
        item,
        category,
        reading,
      };
      itemId = item?.id ?? reading?.id ?? newId();
      title.textContent = text.t(
        item === undefined ? "sell.item.add_title" : "sell.item.change_title",
      );
      fillShown();
      settle();
      opened = formText(formNow());
      const draft = kept?.key === shown.key ? kept : undefined;
      if (draft !== undefined) {
        itemId = draft.fields.id;
        restore(draft);
        settle();
      }
      draftLine.hidden = draft === undefined;
      dialog.showModal();
      focusOf(reading?.focus).focus();
    },
  };
}

type KeptForm = {
  key: string;
  fields: ItemFields;
  price: string;
  per: string;
  suggesting: boolean;
};

function formText({ fields, price, per }: KeptForm): string {
  return JSON.stringify({ ...fields, id: "", price, per });
}
