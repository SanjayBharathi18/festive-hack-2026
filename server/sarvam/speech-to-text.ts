import { z } from "zod";
import {
  sarvamLanguageCodeSchema,
  type SarvamLanguage,
} from "../../shared/languages.ts";
import { callSarvam, type SarvamDeps, type SarvamResult } from "./call.ts";

export type SpeechInput = {
  audio: Uint8Array<ArrayBuffer>;
  seconds: number;
  model: string;
  mode: string;
  keyterms: readonly string[];
};

export type Speech = {
  transcript: string;
  language: SarvamLanguage | null;
  probability: number | null;
};

const speechAnswerSchema = z.object({
  request_id: z.string().nullish(),
  transcript: z.string(),
  language_code: z.string().nullish(),
  language_probability: z.number().min(0).max(1).nullish(),
});

export function speechToText(
  deps: SarvamDeps,
  { audio, seconds, model, mode, keyterms }: SpeechInput,
  signal?: AbortSignal,
): Promise<SarvamResult<Speech>> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "part.wav");
  form.append("model", model);
  form.append("mode", mode);
  if (keyterms.length > 0) form.append("keyterms", JSON.stringify(keyterms));
  return callSarvam(
    deps,
    {
      api: "speech_to_text",
      model,
      input: audio,
      settings: { mode },
      body: form,
    },
    {
      parse: (body) => {
        const answer = speechAnswerSchema.safeParse(body);
        if (!answer.success) {
          return { ok: false, reason: "not a speech-to-text answer" };
        }
        const { transcript, language_code, language_probability } = answer.data;
        const language = sarvamLanguageCodeSchema.safeParse(language_code);
        return {
          ok: true,
          value: {
            transcript: transcript.trim(),
            language: language.success ? language.data : null,
            probability: language_probability ?? null,
          },
        };
      },
      language: (speech) => speech?.language ?? null,
      units: () => ({ audio_seconds: seconds }),
    },
    signal,
  );
}
