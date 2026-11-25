import type { AppLanguage } from "./languages.ts";
import { scriptOf, scriptOfLanguage, type Script } from "./scripts.ts";

export type DishNames = {
  name: string;
  name_latin: string | null;
  name_script?: string | null | undefined;
};

// A dish name as a page shows it: the primary part, with its lang so that its
// script gets its font, then the English name, or null.
export type ShownName = {
  primary: string;
  lang: AppLanguage;
  secondary: string | null;
};

const languageOfScript: Readonly<Record<Script, AppLanguage>> = {
  latin: "en",
  devanagari: "hi",
  kannada: "kn",
  tamil: "ta",
  telugu: "te",
};

// An English page shows the English name alone. A page in another language
// shows the name in its script first, then the English name. The name in its
// script is the seller's own name when she wrote it in that script, else its
// transliteration (name_script), else there is none and the English name
// shows alone.
export function shownName(dish: DishNames, language: AppLanguage): ShownName {
  const english = englishName(dish);
  const inScript = language === "en" ? "" : scriptName(dish, language);
  if (inScript === "" || sameWords(inScript, english)) {
    return {
      primary: english,
      lang: languageOf(english, language),
      secondary: null,
    };
  }
  return { primary: inScript, lang: language, secondary: english };
}

// The English name of a dish: its Latin form, else her name as she wrote it.
export function englishName({ name, name_latin }: DishNames): string {
  const latin = name_latin?.trim() ?? "";
  return latin === "" ? name.trim() : latin;
}

// The name on one line of text, such as a message: "ಮೈಸೂರು ಪಾಕ್ · Mysore pak".
export function nameText({ primary, secondary }: ShownName): string {
  return secondary === null ? primary : `${primary} · ${secondary}`;
}

// The name for a screen reader, with a pause between the two parts:
// "ಮೈಸೂರು ಪಾಕ್, Mysore pak".
export function spokenName({ primary, secondary }: ShownName): string {
  return secondary === null ? primary : `${primary}, ${secondary}`;
}

function scriptName(
  { name, name_script }: DishNames,
  language: AppLanguage,
): string {
  const script = scriptOfLanguage[language];
  if (scriptOf(name) === script) return name.trim();
  const transliteration = name_script?.trim() ?? "";
  return scriptOf(transliteration) === script ? transliteration : "";
}

// Hindi and Marathi share Devanagari: a name in the script of the page takes
// the language of the page.
function languageOf(words: string, page: AppLanguage): AppLanguage {
  const script = scriptOf(words);
  if (script === undefined || script === scriptOfLanguage[page]) return page;
  return languageOfScript[script];
}

function sameWords(one: string, other: string): boolean {
  return one.toLocaleLowerCase() === other.toLocaleLowerCase();
}
