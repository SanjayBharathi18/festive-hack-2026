import type { QuoteFact, QuoteRow } from "./quote-card.ts";

export type RequestTemplates = {
  line: HTMLTemplateElement;
  fact: HTMLTemplateElement;
};

// The rows and facts of a request card: a quote request or a board post.
export function fillLines(
  body: HTMLElement,
  rows: readonly QuoteRow[],
  template: HTMLTemplateElement,
): HTMLElement[] {
  const made = rows.map((row) => {
    const line = clone(template);
    part(line, ".request-item").textContent = row.name;
    part(line, ".request-amount").textContent = row.amount;
    const price = part(line, ".request-price");
    price.textContent = row.price;
    price.classList.toggle("num", /\d/.test(row.price));
    return line;
  });
  body.replaceChildren(...made);
  return made;
}

// A row that the card keeps, such as the place in the buyer's words, stays
// at the end of the facts.
export function fillFacts(
  list: HTMLElement,
  facts: readonly QuoteFact[],
  template: HTMLTemplateElement,
  kept: readonly HTMLElement[] = [],
): void {
  list.hidden = facts.length === 0 && kept.every((row) => row.hidden);
  list.replaceChildren(
    ...facts.map((fact) => {
      const row = clone(template);
      part(row, "dt").textContent = fact.label;
      part(row, "dd").textContent = fact.value;
      return row;
    }),
    ...kept,
  );
}

export function clone(template: HTMLTemplateElement): HTMLElement {
  const made = template.content.firstElementChild?.cloneNode(true);
  if (!(made instanceof HTMLElement)) {
    throw new Error(`The template ${template.id} needs one element.`);
  }
  return made;
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`A request card has no ${selector}.`);
  return found;
}
