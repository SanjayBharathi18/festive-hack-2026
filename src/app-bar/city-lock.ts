import { cityChoices } from "../../shared/cities.ts";
import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import { cityLabel } from "./city-choice.ts";

const bound = new WeakSet<Element>();

// The pages of one store (its storefront, checkout, order, payment and
// catering plan) are in the store's own city, so the city control of the app
// bar shows that city, locked: it never opens and never leaves the page. A
// hover, a focus or a click shows the block icon and why, with the way to
// change the city. A store with no city shows no city control.
export function showCityLock(
  root: ParentNode,
  city: string | null | undefined,
  text: Pick<Text, "t" | "language">,
): void {
  const lock = find(root, "#city-lock", HTMLElement);
  const choice = city ? cityChoices([city])[0] : undefined;
  lock.hidden = choice === undefined;
  if (choice === undefined) return;
  find(lock, "#city-lock-name", HTMLElement).textContent = cityLabel(
    choice.labels,
    text.language,
  );
  find(lock, "#city-lock-words", HTMLElement).textContent = text.t(
    "city.locked",
    { city: choice.labels[text.language] },
  );
  const control = find(lock, "button", HTMLButtonElement);
  if (bound.has(control)) return;
  bound.add(control);
  const note = find(lock, "[popover]", HTMLElement);
  const show = () => {
    if (!note.matches(":popover-open")) note.showPopover();
  };
  const hide = () => {
    if (note.matches(":popover-open")) note.hidePopover();
  };
  control.addEventListener("pointerenter", show);
  control.addEventListener("pointerleave", () => {
    if (!control.matches(":focus-visible")) hide();
  });
  control.addEventListener("focus", show);
  control.addEventListener("blur", hide);
  control.addEventListener("click", show);
  control.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
}
