import type { AppLanguage } from "../../shared/languages.ts";

const scripts: readonly [RegExp, AppLanguage][] = [
  [/\p{Script=Kannada}/u, "kn"],
  [/\p{Script=Devanagari}/u, "hi"],
  [/\p{Script=Tamil}/u, "ta"],
  [/\p{Script=Telugu}/u, "te"],
  [/\p{Script=Latin}/u, "en"],
];

export type ItemName = {
  name: string;
  lang: AppLanguage | undefined;
  latin: string | null;
};

// Like a station board: her name for the item in her script, and the Latin
// form next to it at the same size. The script sets the line height.
export function itemName(name: string, latin: string | null): ItemName {
  const second = latin?.trim() ?? "";
  return {
    name,
    lang: scriptOf(name),
    latin:
      second === "" || second.toLowerCase() === name.trim().toLowerCase()
        ? null
        : second,
  };
}

export function scriptOf(text: string): AppLanguage | undefined {
  for (const character of text) {
    for (const [pattern, language] of scripts) {
      if (pattern.test(character)) return language;
    }
  }
  return undefined;
}

// One name for a sentence or a label: her name when the reader reads her
// script, else the Latin form.
export function nameFor(
  { name, lang, latin }: ItemName,
  reader: AppLanguage,
): string {
  const readable =
    lang !== undefined && scriptGroup(lang) === scriptGroup(reader);
  return readable || latin === null ? name : latin;
}

// The lang of a name in a script that the reader does not read, so that a
// screen reader says it in its language; undefined for her own script.
export function foreignLang(
  name: string,
  reader: AppLanguage,
): AppLanguage | undefined {
  const lang = scriptOf(name);
  return lang === undefined || scriptGroup(lang) === scriptGroup(reader)
    ? undefined
    : lang;
}

// Hindi and Marathi share Devanagari.
function scriptGroup(language: AppLanguage): AppLanguage {
  return language === "mr" ? "hi" : language;
}
