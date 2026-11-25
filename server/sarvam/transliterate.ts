import { z } from "zod";
import { callSarvam, type SarvamDeps, type SarvamResult } from "./call.ts";
import { splitAtSentences } from "./chunks.ts";

export type TransliterateInput = {
  text: string;
  source: string;
  target: string;
};

export const transliterateModel = "transliterate";
export const transliterateLimit = 1_000;

const transliterateAnswerSchema = z.object({
  request_id: z.string().nullish(),
  transliterated_text: z.string(),
  source_language_code: z.string().nullish(),
});

export async function transliterate(
  deps: SarvamDeps,
  { text, source, target }: TransliterateInput,
  signal?: AbortSignal,
): Promise<SarvamResult<string>> {
  const input = splitAtSentences(text, transliterateLimit)[0] ?? "";
  return callSarvam(
    deps,
    {
      api: "transliterate",
      model: transliterateModel,
      input,
      settings: { target_language_code: target },
      body: {
        input,
        source_language_code: source,
        target_language_code: target,
      },
    },
    {
      parse: (body) => {
        const answer = transliterateAnswerSchema.safeParse(body);
        const value = answer.data?.transliterated_text.trim();
        return value
          ? { ok: true, value }
          : { ok: false, reason: "no transliterated text" };
      },
      language: () => target,
      units: () => ({ characters: input.length }),
    },
    signal,
  );
}
