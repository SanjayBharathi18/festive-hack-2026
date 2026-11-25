import type { AppLanguage } from "../../shared/languages.ts";
import { languageOfText } from "./names.ts";

export type Translation = { text: string; language: AppLanguage } | null;

export type Shown = {
  text: string;
  lang: string | undefined;
  translated: boolean;
};

// Her language first; the original when she asks for it, or when there is
// no real translation.
export function shownWords(
  original: string,
  translation: Translation,
  showOriginal: boolean,
): Shown {
  if (showOriginal || !isTranslated(original, translation)) {
    return {
      text: original,
      lang: languageOfText(original),
      translated: false,
    };
  }
  return {
    text: translation.text,
    lang: translation.language,
    translated: true,
  };
}

export function isTranslated(
  original: string | null,
  translation: Translation,
): translation is NonNullable<Translation> {
  return (
    original !== null &&
    translation !== null &&
    translation.text.trim() !== "" &&
    translation.text.trim() !== original.trim()
  );
}
