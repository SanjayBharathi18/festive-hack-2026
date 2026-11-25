import type { AppLanguage } from "../../shared/languages.ts";

type Script = "kn" | "hi" | "ta" | "te" | "latin";

const scripts: readonly [Script, RegExp][] = [
  ["kn", /\p{Script=Kannada}/u],
  ["hi", /\p{Script=Devanagari}/u],
  ["ta", /\p{Script=Tamil}/u],
  ["te", /\p{Script=Telugu}/u],
  ["latin", /\p{Script=Latin}/u],
];

// The lang attribute for words that come from people or the model, so that
// each script gets its own font and line height, whatever the desk language.
export function languageOfText(text: string): AppLanguage | undefined {
  const script = scriptOf(text);
  return script === "latin" ? "en" : script;
}

function scriptOf(text: string): Script | undefined {
  return scripts.find(([, pattern]) => pattern.test(text))?.[0];
}
