import type { ShownName } from "../../shared/item-names.ts";
import type { AppLanguage } from "../../shared/languages.ts";

// The two parts of a dish name (shownName) in their two elements: the primary
// part with its lang, then the English name, which hides when there is none.
// A screen reader hears a pause between them, also where the two elements are
// flex items that it reads as one word.
export function showName(
  { first, second }: { first: HTMLElement; second: HTMLElement },
  { primary, lang, secondary }: ShownName,
  page: AppLanguage,
): void {
  first.textContent = primary;
  if (lang === page) first.removeAttribute("lang");
  else first.lang = lang;
  second.hidden = secondary === null;
  second.lang = "en";
  if (secondary === null) {
    second.replaceChildren();
    return;
  }
  const pause = document.createElement("span");
  pause.className = "visually-hidden";
  pause.textContent = ", ";
  second.replaceChildren(pause, secondary);
}
