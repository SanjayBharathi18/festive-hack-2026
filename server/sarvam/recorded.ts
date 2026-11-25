import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  sarvamApis,
  type SarvamApi,
  type SarvamSettings,
  type SarvamTransport,
} from "./api.ts";

export const fixturesDir = new URL("../../fixtures/sarvam/", import.meta.url);

export const recordingFiles: Record<SarvamApi, string> = {
  speech_to_text: "speech-to-text.json",
  chat: "chat.json",
  translate: "translate.json",
  language_id: "language-id.json",
  transliterate: "transliterate.json",
};

const settingSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const recordingSchema = z.object({
  api: z.enum(sarvamApis),
  model: z.string().min(1),
  input_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  input: z.string(),
  line: z.string().optional(),
  when: z.record(z.string(), settingSchema).optional(),
  placeholder: z.boolean(),
  recorded_at: z.string().optional(),
  response: z.unknown(),
});
export type Recording = z.infer<typeof recordingSchema>;

export type RecordingSummary = {
  saved: number;
  placeholders: number;
  test_only: number;
};

let saved: Recording[] | undefined;

export function createRecordedTransport(
  recordings: readonly Recording[],
): SarvamTransport {
  const index = Map.groupBy(recordings, (recording) =>
    lookupKey(recording.api, recording.model, recording.input_sha256),
  );
  return {
    mode: "recorded",
    send: async ({ api, model, input, settings = {} }, signal) => {
      signal?.throwIfAborted();
      const candidates = index.get(lookupKey(api, model, inputHash(input)));
      const match = pickRecording(candidates ?? [], settings);
      if (match === undefined) {
        return {
          ok: false,
          outcome: "error",
          status: null,
          code: null,
          missing: true,
        };
      }
      return {
        ok: true,
        status: 200,
        body: structuredClone(match.response),
        placeholder: match.placeholder,
      };
    },
  };
}

export function savedRecordings(): Recording[] {
  saved ??= loadRecordings();
  return saved;
}

export function loadRecordings(dir: URL = fixturesDir): Recording[] {
  return sarvamApis.flatMap((api) =>
    readRecordingFile(new URL(recordingFiles[api], dir)),
  );
}

export function pickRecording(
  candidates: readonly Recording[],
  settings: SarvamSettings,
): Recording | undefined {
  const fitting = candidates
    .filter(
      ({ when }) =>
        when !== undefined &&
        Object.entries(when).every(([name, value]) => settings[name] === value),
    )
    .sort(
      (a, b) =>
        Object.keys(b.when ?? {}).length - Object.keys(a.when ?? {}).length,
    );
  return fitting[0] ?? candidates.find(({ when }) => when === undefined);
}

export function summarizeRecordings(
  recordings: readonly Recording[],
): RecordingSummary {
  const testOnly = recordings.filter(isTestOnly);
  return {
    saved: recordings.length,
    placeholders: recordings.filter(
      (recording) => recording.placeholder && !isTestOnly(recording),
    ).length,
    test_only: testOnly.length,
  };
}

export function isTestOnly({ input }: Pick<Recording, "input">): boolean {
  return input.startsWith("audio/synthetic-") || input.startsWith("TEST ");
}

export function inputHash(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function lookupKey(api: SarvamApi, model: string, hash: string): string {
  return `${api} ${model} ${hash}`;
}

function readRecordingFile(file: URL): Recording[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      `${file.pathname} is not JSON. Fix the file or record it again.`,
    );
  }
  const result = z.array(recordingSchema).safeParse(value);
  if (!result.success) {
    throw new Error(
      `${file.pathname} is not a list of saved Sarvam answers:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
