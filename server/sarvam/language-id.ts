import { z } from "zod";
import {
  sarvamLanguageCodeSchema,
  type SarvamLanguage,
} from "../../shared/languages.ts";
import { callSarvam, type SarvamDeps, type SarvamResult } from "./call.ts";
import { splitAtSentences } from "./chunks.ts";

export const languageIdModel = "text-lid";
export const languageIdLimit = 1_000;

const languageAnswerSchema = z.object({
  request_id: z.string().nullish(),
  language_code: z.string().nullish(),
  script_code: z.string().nullish(),
});

export function identifyLanguage(
  deps: SarvamDeps,
  text: string,
  signal?: AbortSignal,
): Promise<SarvamResult<SarvamLanguage | null>> {
  const input = splitAtSentences(text, languageIdLimit)[0] ?? "";
  return callSarvam(
    deps,
    {
      api: "language_id",
      model: languageIdModel,
      input,
      body: { input },
    },
    {
      parse: (body) => {
        const answer = languageAnswerSchema.safeParse(body);
        if (!answer.success) {
          return { ok: false, reason: "not a language answer" };
        }
        const language = sarvamLanguageCodeSchema.safeParse(
          answer.data.language_code,
        );
        return { ok: true, value: language.success ? language.data : null };
      },
      language: (language) => language ?? null,
      units: () => ({ characters: input.length }),
    },
    signal,
  );
}
