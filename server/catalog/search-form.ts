import { scriptOf, type Script } from "../../shared/scripts.ts";

// The Sarvam language that writes each Indian script, as the source of a
// transliteration to Latin. Marathi also writes Devanagari: Hindi reads it
// the same way.
export const scriptLanguages: Readonly<
  Record<Exclude<Script, "latin">, string>
> = {
  kannada: "kn-IN",
  devanagari: "hi-IN",
  tamil: "ta-IN",
  telugu: "te-IN",
};

// The search form of a name or a query (docs/system.md, "Search"): lower
// case with no accents; only letters, digits and vowel signs, so no spaces;
// then one vowel for a doubled vowel. Latin spellings of Indian words write
// a long vowel twice, so ee and oo become i and u, as in "katlee" and
// "kaajoo". The index and the query use the same rule.
export function searchForm(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "")
    .replace(/e{2,}/g, "i")
    .replace(/o{2,}/g, "u")
    .replace(/([aiu])\1+/g, "$1")
    .normalize("NFC");
}

// The words of a name, each in its search form: a query of 1 or 2 letters
// matches the start of a word.
export function searchWords(text: string): string {
  return text
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .map(searchForm)
    .filter((word) => word !== "")
    .join(" ");
}

// The Sarvam language of a query that needs a Latin form first, or null for
// a Latin query.
export function sourceLanguage(query: string): string | null {
  const script = scriptOf(query);
  return script === undefined || script === "latin"
    ? null
    : scriptLanguages[script];
}
