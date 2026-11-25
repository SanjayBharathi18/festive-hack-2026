import type { AppLanguage } from "../../shared/languages.ts";
import { languageOfText } from "./names.ts";

export type VoiceLine = { id: string; language: string; text: string };
export type Sample = {
  id: string;
  text: string;
  label: string;
  lang: AppLanguage | undefined;
};
export type SampleWords = {
  name: (language: string) => string;
  mix: (name: string) => string;
};

// The voice lines that the demo desk offers, from fixtures/sarvam/voice-lines.json:
// Kannada, Kannada with English, Hindi, and Hindi with English.
export const sampleIds = ["VK1", "VM4", "VH1", "VM1"] as const;

// Each sample keeps the order of the ids. A line in Latin letters in a
// language other than English is a mix of that language and English.
export function pickSamples(
  lines: readonly VoiceLine[],
  ids: readonly string[],
  words: SampleWords,
): Sample[] {
  return ids.flatMap((id) => {
    const line = lines.find((each) => each.id === id);
    if (line === undefined) return [];
    const language = line.language.split("-")[0]?.toLowerCase() ?? "";
    const script = languageOfText(line.text);
    const name = words.name(language);
    const mixed = script === "en" && language !== "en";
    return [
      {
        id: line.id,
        text: line.text,
        label: mixed ? words.mix(name) : name,
        lang: script,
      },
    ];
  });
}
