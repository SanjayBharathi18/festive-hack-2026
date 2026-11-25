import type { BoardInterest, BoardPostPage } from "../../shared/bulk.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { linkFields } from "../quotes/fragment.ts";
import { amountWords } from "../quotes/summary.ts";
import { formatMoney } from "../text/format.ts";
import type { Text } from "../text/text.ts";
import type { BoardFormValues } from "./board-form.ts";

// The post as the company sees it, with the stores that answered. The
// example post is the same for every visitor, so it shows no changes.
export function showPost(
  root: ParentNode,
  { post, interests }: BoardPostPage,
  text: Text,
  onContact: (interest: BoardInterest) => void,
): void {
  const el = <T extends Element>(id: string, type: abstract new () => T) =>
    find(root, id, type);
  const status = el("#post-status", HTMLElement);
  status.textContent = text.t(`board_post.status.${post.status}`);
  status.dataset.kind = post.status === "open" ? "done" : "mark";
  el("#post-demo", HTMLElement).hidden = !post.is_demo;
  el("#demo-badge", HTMLElement).hidden = !post.is_demo;
  el("#post-title", HTMLElement).textContent =
    post.company_name ?? post.description;
  const description = el("#post-description", HTMLElement);
  description.textContent = post.description;
  description.hidden = post.company_name === null;
  el("#post-items", HTMLElement).replaceChildren(
    ...post.items.map(({ name, quantity, unit }) => {
      const item = document.createElement("li");
      const words = document.createElement("span");
      words.textContent = name;
      const amount = document.createElement("span");
      amount.className = "num";
      amount.textContent = amountWords(quantity, unit, text);
      item.append(words, amount);
      return item;
    }),
  );
  el("#post-need-by", HTMLElement).textContent = text.day(post.need_by, "long");
  el("#post-places", HTMLElement).textContent = post.places.join(" · ");
  el("#post-budget-row", HTMLElement).hidden = post.budget_per_unit === null;
  el("#post-budget", HTMLElement).textContent =
    post.budget_per_unit === null
      ? ""
      : text.t("board_post.budget_line", {
          money: formatMoney(post.budget_per_unit),
        });
  el("#post-city", HTMLElement).textContent = post.city;
  const closed = el("#post-closed", HTMLElement);
  closed.hidden = post.closed_by === null;
  closed.textContent =
    post.closed_by === null
      ? ""
      : text.t(`board_post.closed_by.${post.closed_by}`);
  const visitor = post.is_demo;
  el("#post-example", HTMLElement).hidden = !visitor;
  el("#post-keep-link", HTMLElement).hidden = visitor;
  el("#edit", HTMLButtonElement).hidden = visitor || post.status === "closed";
  el("#close", HTMLButtonElement).hidden = visitor || post.status === "closed";
  el("#reopen", HTMLButtonElement).hidden =
    visitor || post.closed_by !== "company";

  const none = el("#interests-none", HTMLElement);
  none.hidden = interests.length > 0;
  none.textContent = text.t("board_post.interests_none", { city: post.city });
  const template = el("#interest-template", HTMLTemplateElement);
  el("#interests", HTMLElement).replaceChildren(
    ...interests.map((interest) => {
      const item = cloneTemplate(template);
      const store = find(item, ".interest-store", HTMLAnchorElement);
      store.textContent = interest.store.name;
      store.href = `/s/${encodeURIComponent(interest.store.slug)}`;
      find(item, ".interest-demo", HTMLElement).hidden =
        !interest.store.is_demo;
      find(item, ".interest-area", HTMLElement).textContent = [
        interest.store.area,
        interest.store.city,
      ]
        .filter(Boolean)
        .join(", ");
      const translated = interest.note_translation;
      find(item, ".interest-note", HTMLElement).textContent =
        translated?.text ?? interest.note ?? text.t("board_post.no_note");
      find(item, ".interest-translated", HTMLElement).hidden =
        translated === null;
      find(item, ".interest-original", HTMLElement).hidden =
        translated === null;
      find(item, ".interest-original-text", HTMLElement).textContent =
        interest.note ?? "";
      const contact = find(item, ".interest-contact", HTMLButtonElement);
      contact.setAttribute(
        "aria-label",
        text.t("board_post.contact_named", { store: interest.store.name }),
      );
      contact.addEventListener("click", () => onContact(interest));
      return item;
    }),
  );
}

export type BoardFormView = {
  read(): BoardFormValues;
  fill(values: BoardFormValues): void;
};

// The fields of the form, with a row for each item and each place.
export function createBoardFormView(root: ParentNode): BoardFormView {
  const el = <T extends Element>(id: string, type: abstract new () => T) =>
    find(root, id, type);
  const itemRows = el("#item-rows", HTMLElement);
  const placeRows = el("#place-rows", HTMLElement);
  const itemTemplate = el("#item-row-template", HTMLTemplateElement);
  const placeTemplate = el("#place-row-template", HTMLTemplateElement);

  const addRow = (rows: HTMLElement, template: HTMLTemplateElement) => {
    const row = cloneTemplate(template);
    linkFields(row);
    find(row, ".row-remove", HTMLButtonElement).addEventListener(
      "click",
      () => {
        const next = row.nextElementSibling ?? row.previousElementSibling;
        row.remove();
        if (rows.children.length === 0) addRow(rows, template);
        next?.querySelector("input")?.focus();
      },
    );
    rows.append(row);
    return row;
  };
  const addItem = (name = "", quantity = "", unit = "pieces") => {
    const row = addRow(itemRows, itemTemplate);
    find(row, ".item-name", HTMLInputElement).value = name;
    find(row, ".item-quantity", HTMLInputElement).value = quantity;
    find(row, ".item-unit", HTMLSelectElement).value = unit;
    return row;
  };
  const addPlace = (place = "") => {
    const row = addRow(placeRows, placeTemplate);
    find(row, ".place-name", HTMLInputElement).value = place;
    return row;
  };
  el("#add-item", HTMLButtonElement).addEventListener("click", () =>
    find(addItem(), ".item-name", HTMLInputElement).focus(),
  );
  el("#add-place", HTMLButtonElement).addEventListener("click", () =>
    find(addPlace(), ".place-name", HTMLInputElement).focus(),
  );

  return {
    read: () => ({
      company: el("#company", HTMLInputElement).value,
      description: el("#description", HTMLInputElement).value,
      items: [...itemRows.querySelectorAll(".item-row")].map((row) => ({
        name: find(row, ".item-name", HTMLInputElement).value,
        quantity: find(row, ".item-quantity", HTMLInputElement).value,
        unit: find(row, ".item-unit", HTMLSelectElement).value,
      })),
      needBy: el("#need-by", HTMLInputElement).value,
      places: [...placeRows.querySelectorAll(".place-name")].map((input) =>
        input instanceof HTMLInputElement ? input.value : "",
      ),
      budget: el("#budget", HTMLInputElement).value,
      city: el("#city", HTMLInputElement).value,
    }),
    fill(values) {
      el("#company", HTMLInputElement).value = values.company;
      el("#description", HTMLInputElement).value = values.description;
      el("#need-by", HTMLInputElement).value = values.needBy;
      el("#budget", HTMLInputElement).value = values.budget;
      el("#city", HTMLInputElement).value = values.city;
      itemRows.replaceChildren();
      placeRows.replaceChildren();
      for (const { name, quantity, unit } of values.items)
        addItem(name, quantity, unit);
      for (const place of values.places) addPlace(place);
      if (values.items.length === 0) addItem();
      if (values.places.length === 0) addPlace();
    },
  };
}
