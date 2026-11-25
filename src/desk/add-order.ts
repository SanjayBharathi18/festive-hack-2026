import type { DeskOrderAnswer, DeskOrderBody } from "../../shared/orders.ts";
import type {
  DeskReadAnswer,
  DeskReadBody,
  PartAnswer,
} from "../../shared/reading.ts";
import { isAbortError } from "../api/api.ts";
import type { Wait } from "../wait/wait.ts";
import {
  draftFromReading,
  emptyDraft,
  isEdited,
  orderFields,
  type Draft,
  type Values,
} from "./draft.ts";

export type Control = "record" | "upload" | "paste" | "save" | "undo";
export type Voice = { parts: Blob[]; seconds: number };
export type Source =
  { kind: "voice"; audio: Blob } | { kind: "text"; text: string };

export type CheckStep = {
  name: "check";
  reading: DeskReadAnswer | undefined;
  draft: Draft;
  heard: string;
  manual: boolean;
  error: unknown;
};

// saved keeps the check step that it came from, so that Undo can go back
// to it with her values.
export type Step =
  | { name: "input"; error: unknown; retry: Source | undefined }
  | { name: "reading"; source: Source["kind"] }
  | CheckStep
  | {
      name: "saved";
      answer: DeskOrderAnswer;
      checked: CheckStep;
      error: unknown;
    };

export type AddOrderDeps = {
  prepare: (audio: Blob, signal: AbortSignal) => Promise<Voice>;
  uploadPart: (part: Blob, signal: AbortSignal) => Promise<PartAnswer>;
  read: (body: DeskReadBody, signal: AbortSignal) => Promise<DeskReadAnswer>;
  save: (body: DeskOrderBody, signal: AbortSignal) => Promise<DeskOrderAnswer>;
  remove: (orderId: string, signal: AbortSignal) => Promise<unknown>;
  waitFor: (control: Control) => Pick<Wait, "run" | "cancel">;
  words: { voice: string; text: string; saving: string; undoing: string };
};

export type AddOrder = {
  readonly step: Step;
  readVoice(audio: Blob, control: "record" | "upload"): Promise<void>;
  readText(text: string): Promise<void>;
  retry(): Promise<void>;
  fillByHand(): void;
  save(values: Values): Promise<void>;
  // Takes back the order just saved and goes back to its check step. It
  // gives the id of the order that is gone.
  undoSave(): Promise<string | undefined>;
  reset(): void;
};

type Heard = { transcripts: string[] };

// These answers refuse the file itself: nothing in it can be used.
const refusedCodes = new Set([
  "unsupported_media_type",
  "payload_too_large",
  "cannot_decode",
  "audio_invalid",
]);

// These answers mean that a reading cannot come from this source: she fills
// in the order by hand, next to the words that were heard.
const manualCodes = new Set([
  "speech_failed",
  "recording_missing",
  "voice_off",
  "audio_invalid",
  "no_words",
  "unsupported_media_type",
  "payload_too_large",
  "cannot_decode",
]);

// Add order: a voice note or a text becomes a draft to check, or the empty
// draft of the manual path; then the order is saved. Each step can be
// cancelled, and a newer step cancels the older one.
export function createAddOrder({
  deps,
  onStep,
}: {
  deps: AddOrderDeps;
  onStep: (step: Step) => void;
}): AddOrder {
  let step: Step = { name: "input", error: undefined, retry: undefined };
  let active: Pick<Wait, "cancel"> | undefined;

  const show = (next: Step) => {
    step = next;
    onStep(next);
  };

  const begin = (control: Control) => {
    active?.cancel();
    const wait = deps.waitFor(control);
    active = wait;
    return wait;
  };

  const readSource = async (
    source: Source,
    control: Control,
  ): Promise<void> => {
    const wait = begin(control);
    const heard: Heard = { transcripts: [] };
    show({ name: "reading", source: source.kind });
    try {
      const reading = await wait.run(
        (signal) =>
          source.kind === "text"
            ? deps.read({ text: source.text }, signal)
            : readVoiceParts(deps, source.audio, heard, signal),
        source.kind === "voice" ? deps.words.voice : deps.words.text,
      );
      show({
        name: "check",
        reading,
        draft: draftFromReading(reading.draft),
        heard: reading.transcript,
        manual: reading.show_manual,
        error: undefined,
      });
    } catch (error) {
      if (isAbortError(error)) return;
      if (manualCodes.has(codeOf(error))) {
        show({
          name: "check",
          reading: undefined,
          draft: emptyDraft(),
          heard:
            source.kind === "text"
              ? source.text
              : heard.transcripts.join(" ").trim(),
          manual: true,
          error,
        });
        return;
      }
      show({ name: "input", error, retry: source });
    } finally {
      if (active === wait) active = undefined;
    }
  };

  return {
    get step() {
      return step;
    },
    readVoice: (audio, control) =>
      readSource({ kind: "voice", audio }, control),
    readText: (text) => readSource({ kind: "text", text }, "paste"),
    async retry() {
      if (step.name !== "input" || step.retry === undefined) return;
      const source = step.retry;
      await readSource(source, source.kind === "text" ? "paste" : "upload");
    },
    fillByHand() {
      active?.cancel();
      show({
        name: "check",
        reading: undefined,
        draft: emptyDraft(),
        heard: "",
        manual: true,
        error: undefined,
      });
    },
    async save(values) {
      if (step.name !== "check") return;
      const fields = orderFields(values);
      if (fields === undefined) return;
      const checking = step;
      const { reading } = checking;
      const body: DeskOrderBody = {
        ...fields,
        source: "desk",
        reading:
          reading === undefined
            ? null
            : {
                order_id: reading.draft.order_id,
                transcript: reading.transcript,
                language: reading.language,
                variant: reading.variant,
                edited: isEdited(checking.draft.initial, values),
              },
      };
      const wait = begin("save");
      show({ ...checking, error: undefined });
      try {
        const answer = await wait.run(
          (signal) => deps.save(body, signal),
          deps.words.saving,
        );
        show({ name: "saved", answer, checked: checking, error: undefined });
      } catch (error) {
        if (isAbortError(error)) return;
        show({ ...checking, error });
      } finally {
        if (active === wait) active = undefined;
      }
    },
    async undoSave() {
      if (step.name !== "saved") return undefined;
      const saved = step;
      const id = saved.answer.order.id;
      const wait = begin("undo");
      show({ ...saved, error: undefined });
      try {
        await wait.run((signal) => deps.remove(id, signal), deps.words.undoing);
      } catch (error) {
        if (isAbortError(error)) return undefined;
        if (codeOf(error) !== "not_found") {
          show({ ...saved, error });
          return undefined;
        }
      } finally {
        if (active === wait) active = undefined;
      }
      show({ ...saved.checked, error: undefined });
      return id;
    },
    reset() {
      active?.cancel();
      active = undefined;
      show({ name: "input", error: undefined, retry: undefined });
    },
  };
}

// The parts go up together. A part that has expired on the server is sent
// once more, so that a slow phone does not lose the voice note.
async function readVoiceParts(
  deps: AddOrderDeps,
  audio: Blob,
  heard: Heard,
  signal: AbortSignal,
): Promise<DeskReadAnswer> {
  const voice = await deps.prepare(audio, signal);
  const upload = async () => {
    const answers = await allOrNone(
      voice.parts.map((part) => (inner) => deps.uploadPart(part, inner)),
      signal,
    );
    heard.transcripts = answers.map((answer) => answer.transcript);
    return answers.map((answer) => answer.part_id);
  };
  const partIds = await upload();
  try {
    return await deps.read({ part_ids: partIds }, signal);
  } catch (error) {
    if (codeOf(error) !== "parts_expired") throw error;
    return deps.read({ part_ids: await upload() }, signal);
  }
}

async function allOrNone<T>(
  works: readonly ((signal: AbortSignal) => Promise<T>)[],
  signal: AbortSignal,
): Promise<T[]> {
  const controller = new AbortController();
  const stop = () => controller.abort(signal.reason);
  signal.addEventListener("abort", stop, { once: true });
  try {
    return await Promise.all(
      works.map((work) =>
        work(controller.signal).catch((error: unknown) => {
          controller.abort(error);
          throw error;
        }),
      ),
    );
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

export function isRefusedFile(error: unknown): boolean {
  return refusedCodes.has(codeOf(error));
}

function codeOf(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "";
}
