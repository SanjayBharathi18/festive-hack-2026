import type { AppLanguage } from "./languages.ts";

export type Script = "kannada" | "devanagari" | "tamil" | "telugu" | "latin";

const patterns: readonly [RegExp, Script][] = [
  [/\p{Script=Kannada}/u, "kannada"],
  [/\p{Script=Devanagari}/u, "devanagari"],
  [/\p{Script=Tamil}/u, "tamil"],
  [/\p{Script=Telugu}/u, "telugu"],
  [/\p{Script=Latin}/u, "latin"],
];

export const scriptOfLanguage: Readonly<Record<AppLanguage, Script>> = {
  en: "latin",
  hi: "devanagari",
  mr: "devanagari",
  kn: "kannada",
  ta: "tamil",
  te: "telugu",
};

export function scriptOf(text: string): Script | undefined {
  for (const character of text) {
    for (const [pattern, script] of patterns) {
      if (pattern.test(character)) return script;
    }
  }
  return undefined;
}
