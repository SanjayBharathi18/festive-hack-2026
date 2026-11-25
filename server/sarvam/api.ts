import type { Outcome } from "../metrics/metrics.ts";

export const sarvamApis = [
  "speech_to_text",
  "chat",
  "translate",
  "language_id",
  "transliterate",
] as const;
export type SarvamApi = (typeof sarvamApis)[number];

export const apiPaths: Record<SarvamApi, string> = {
  speech_to_text: "/speech-to-text",
  chat: "/v1/chat/completions",
  translate: "/translate",
  language_id: "/text-lid",
  transliterate: "/transliterate",
};

export const timeoutsMs: Record<SarvamApi, number> = {
  speech_to_text: 20_000,
  chat: 20_000,
  translate: 10_000,
  language_id: 5_000,
  transliterate: 5_000,
};

export type SarvamSettings = Record<string, string | number | boolean | null>;

export type SarvamRequest = {
  api: SarvamApi;
  model: string;
  input: string | Uint8Array;
  settings?: SarvamSettings;
  body: Record<string, unknown> | FormData;
};

export type FailedOutcome = Exclude<Outcome, "ok">;

export type SarvamAnswer =
  | { ok: true; status: number; body: unknown; placeholder: boolean }
  | {
      ok: false;
      outcome: FailedOutcome;
      status: number | null;
      code: string | null;
      missing: boolean;
    };

export type SarvamTransport = {
  mode: "live" | "recorded";
  send: (request: SarvamRequest, signal?: AbortSignal) => Promise<SarvamAnswer>;
};
