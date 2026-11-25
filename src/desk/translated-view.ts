import type { Text } from "../text/text.ts";
import { isTranslated, shownWords, type Translation } from "./translation.ts";

// One text of a buyer on her desk, and its translation into her language.
export type TranslatedField = {
  element: HTMLElement;
  original: string | null;
  translation: Translation;
};

type Filled = { fields: readonly TranslatedField[]; text: Text };

const filled = new WeakMap<HTMLElement, Filled>();

// The texts of one request, note or post in her language, with the
// "Translated" badge and one switch that shows the originals. The switch
// keeps its place when the same texts fill the block again.
export function fillTranslated(
  block: HTMLElement,
  fields: readonly TranslatedField[],
  text: Text,
): void {
  const before = filled.get(block);
  if (before !== undefined && !sameTexts(before.fields, fields)) {
    delete block.dataset.showing;
  }
  if (before === undefined) {
    block.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest(".translated-switch");
      if (button === null || !block.contains(button)) return;
      block.dataset.showing =
        block.dataset.showing === "original" ? "translation" : "original";
      const current = filled.get(block);
      if (current !== undefined) show(block, current);
    });
  }
  const current = { fields, text };
  filled.set(block, current);
  show(block, current);
}

function show(block: HTMLElement, { fields, text }: Filled): void {
  const original = block.dataset.showing === "original";
  const any = fields.some((field) =>
    isTranslated(field.original, field.translation),
  );
  for (const field of fields) {
    const words = shownWords(field.original ?? "", field.translation, original);
    field.element.textContent = words.text;
    if (words.lang === undefined) field.element.removeAttribute("lang");
    else field.element.lang = words.lang;
  }
  const badge = block.querySelector<HTMLElement>(".translated-badge");
  if (badge) badge.hidden = !any || original;
  const button = block.querySelector<HTMLButtonElement>(".translated-switch");
  if (button) {
    button.hidden = !any;
    button.textContent = text.t(
      original ? "desk.translated.translation" : "desk.translated.original",
    );
  }
}

function sameTexts(
  a: readonly TranslatedField[],
  b: readonly TranslatedField[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (field, index) =>
        field.original === b[index]?.original &&
        field.translation?.text === b[index]?.translation?.text,
    )
  );
}
