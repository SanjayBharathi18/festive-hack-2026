import { z } from "zod";
import { callSarvam, type SarvamDeps, type SarvamResult } from "./call.ts";
import { splitAtSentences } from "./chunks.ts";

export type TranslateInput = {
  text: string;
  model: string;
  language: string | null;
};

export type TranslateTextInput = {
  text: string;
  model: string;
  source: string;
  target: string;
  mode: "formal" | "modern-colloquial" | "classic-colloquial" | "code-mixed";
};

export const translateLimit = 1_000;

const translateAnswerSchema = z.object({
  request_id: z.string().nullish(),
  translated_text: z.string(),
  source_language_code: z.string().nullish(),
});

export function translateToEnglish(
  deps: SarvamDeps,
  { text, model, language }: TranslateInput,
  signal?: AbortSignal,
): Promise<SarvamResult<string>> {
  return translateText(
    deps,
    { text, model, source: "auto", target: "en-IN", mode: "code-mixed" },
    signal,
    language,
  );
}

export async function translateText(
  deps: SarvamDeps,
  { text, model, source, target, mode }: TranslateTextInput,
  signal?: AbortSignal,
  language: string | null = source === "auto" ? null : source,
): Promise<SarvamResult<string>> {
  const chunks = splitAtSentences(text, translateLimit);
  const results = await Promise.all(
    chunks.map((chunk) =>
      callSarvam(
        deps,
        {
          api: "translate",
          model,
          input: chunk,
          settings: { target_language_code: target },
          body: {
            input: chunk,
            source_language_code: source,
            target_language_code: target,
            model,
            mode,
          },
        },
        {
          parse: (body) => {
            const answer = translateAnswerSchema.safeParse(body);
            const translated = answer.data?.translated_text.trim();
            return translated
              ? { ok: true, value: translated }
              : { ok: false, reason: "no translated text" };
          },
          language: () => language,
          units: () => ({ characters: chunk.length }),
        },
        signal,
      ),
    ),
  );
  const translations: string[] = [];
  let placeholder = false;
  for (const result of results) {
    if (!result.ok) return result;
    translations.push(result.value);
    placeholder ||= result.placeholder;
  }
  return { ok: true, value: translations.join(" "), placeholder };
}
