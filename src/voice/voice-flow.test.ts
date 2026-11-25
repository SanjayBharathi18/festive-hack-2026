import assert from "node:assert/strict";
import { test } from "node:test";
import type { CartReadAnswer } from "../../shared/reading.ts";
import type { ReadStep } from "../store/voice-cart.ts";
import { voiceError } from "./voice-error.ts";
import type { Work } from "../wait/wait.ts";
import {
  createVoiceFlow,
  workingAfterMs,
  type VoiceFlowDeps,
  type VoiceRecorder,
} from "./voice-flow.ts";

type Recording = { audio: Blob; atLimit: boolean };

test("tap to start, tap to stop: the recording is read and the answer arrives", async () => {
  const { order, recorder, seen, settle } = setup();
  order.toggle();
  assert.equal(recorder.phase, "recording");
  assert.deepEqual(seen.events, ["start"]);
  order.toggle();
  await settle();
  assert.deepEqual(seen.events, ["start", "prepare", "read", "answer"]);
  assert.deepEqual(seen.words, [
    "Opening the voice note",
    "Reading your order",
  ]);
});

test("a recording stopped at the limit says so, and is still read", async () => {
  const { order, recorder, seen, settle } = setup();
  order.toggle();
  recorder.finish({ atLimit: true });
  await settle();
  assert.deepEqual(seen.events, [
    "start",
    "limit",
    "prepare",
    "read",
    "answer",
  ]);
});

test("a chosen file is read the same way", async () => {
  const { order, seen, settle } = setup();
  order.choose(new Blob(["audio"]));
  await settle();
  assert.deepEqual(seen.events, ["start", "prepare", "read", "answer"]);
});

test("a microphone problem reaches the page; a stop before the microphone opens does not", async () => {
  const blocked = setup({ refuse: voiceError("mic_denied") });
  blocked.order.toggle();
  await blocked.settle();
  assert.deepEqual(blocked.seen.events, ["start", "error:mic_denied"]);

  const stopped = setup({
    refuse: new DOMException(
      "Stopped before the microphone opened.",
      "AbortError",
    ),
  });
  stopped.order.toggle();
  await stopped.settle();
  assert.deepEqual(stopped.seen.events, ["start"]);
});

test("a failed reading reaches the page with its error", async () => {
  const { order, seen, settle } = setup({ failRead: true });
  order.choose(new Blob(["audio"]));
  await settle();
  assert.deepEqual(seen.events, [
    "start",
    "prepare",
    "read",
    "error:speech_failed",
  ]);
});

test("a new recording cancels the reading that runs", async () => {
  const { order, seen, recorder, settle, waits } = setup({ slowRead: true });
  order.choose(new Blob(["audio"]));
  await settle();
  order.toggle();
  assert.equal(waits.cancelled, 2);
  assert.equal(recorder.phase, "recording");
  await settle();
  assert.equal(seen.events.includes("answer"), false);
});

test("a file is ignored while the microphone is open", async () => {
  const { order, seen, settle } = setup();
  order.toggle();
  order.choose(new Blob(["audio"]));
  await settle();
  assert.deepEqual(seen.events, ["start"]);
});

test("the start mark plays before the microphone opens", async () => {
  const { order, recorder, seen } = setup();
  order.toggle();
  assert.deepEqual(seen.sounds, []);
  await recorder.beforeOpen?.();
  assert.deepEqual(seen.sounds, ["record:start"]);
});

test("a reading that passes one second plays the working sound once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { order, seen, settle } = setup({ slowRead: true });
  order.choose(new Blob(["audio"]));
  await settle();
  t.mock.timers.tick(workingAfterMs - 1);
  assert.deepEqual(seen.sounds, []);
  t.mock.timers.tick(1);
  t.mock.timers.tick(workingAfterMs * 3);
  assert.deepEqual(seen.sounds, ["working"]);
});

test("a quick reading plays no working sound", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { order, seen, settle } = setup();
  order.choose(new Blob(["audio"]));
  await settle();
  t.mock.timers.tick(workingAfterMs * 2);
  assert.deepEqual(seen.sounds, []);
});

test("a refused file, a microphone problem and a failed reading play the fallback sound; a stop does not", async () => {
  const refused = setup({ refuseFile: voiceError("too_big", { minutes: 5 }) });
  refused.order.choose(new Blob(["audio"]));
  await refused.settle();
  assert.deepEqual(refused.seen.events, ["start", "error:too_big"]);
  assert.deepEqual(refused.seen.sounds, ["fallback"]);

  const blocked = setup({ refuse: voiceError("mic_denied") });
  blocked.order.toggle();
  await blocked.settle();
  assert.deepEqual(blocked.seen.sounds, ["fallback"]);

  const failed = setup({ failRead: true });
  failed.order.choose(new Blob(["audio"]));
  await failed.settle();
  assert.deepEqual(failed.seen.sounds, ["fallback"]);

  const stopped = setup({
    refuse: new DOMException("Stopped.", "AbortError"),
  });
  stopped.order.toggle();
  await stopped.settle();
  assert.deepEqual(stopped.seen.sounds, []);
});

function setup({
  refuse,
  refuseFile,
  failRead = false,
  slowRead = false,
}: {
  refuse?: unknown;
  refuseFile?: unknown;
  failRead?: boolean;
  slowRead?: boolean;
} = {}) {
  const seen = {
    events: [] as string[],
    words: [] as string[],
    sounds: [] as string[],
  };
  let finish: (recording: Recording) => void = () => {};
  const recorder = {
    phase: "idle" as VoiceRecorder["phase"],
    beforeOpen: undefined as (() => unknown) | undefined,
    record(options?: { beforeOpen?: () => unknown }) {
      recorder.beforeOpen = options?.beforeOpen;
      if (refuse !== undefined) return Promise.reject(refuse);
      recorder.phase = "recording";
      return new Promise<Recording>((resolve) => {
        finish = (recording) => {
          recorder.phase = "idle";
          resolve(recording);
        };
      });
    },
    stop() {
      recorder.finish({ atLimit: false });
    },
    finish({ atLimit }: { atLimit: boolean }) {
      finish({ audio: new Blob(["audio"]), atLimit });
    },
  };
  let controller: AbortController | undefined;
  const waits = { cancelled: 0 };
  const wait = {
    async run<T>(work: Work<T>, words: string): Promise<T> {
      controller = new AbortController();
      seen.words.push(words);
      return work(controller.signal, (next) => seen.words.push(next));
    },
    cancel() {
      waits.cancelled += 1;
      controller?.abort(new DOMException("Cancelled.", "AbortError"));
    },
  };
  const deps: VoiceFlowDeps<CartReadAnswer, ReadStep> = {
    recorder,
    prepare: async () => {
      if (refuseFile !== undefined) throw refuseFile;
      seen.events.push("prepare");
      return { parts: [new Blob(["part"])], seconds: 2 };
    },
    read: async (_parts, { signal, onStep }) => {
      seen.events.push("read");
      onStep({ kind: "reading" });
      if (failRead)
        throw Object.assign(new Error("x"), { code: "speech_failed" });
      if (slowRead) {
        await new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
      return {} as CartReadAnswer;
    },
    wait,
    sounds: {
      record: async (mark) => {
        seen.sounds.push(`record:${mark}`);
      },
      working: () => seen.sounds.push("working"),
      fallback: () => seen.sounds.push("fallback"),
    },
    words: {
      opening: "Opening the voice note",
      step: () => "Reading your order",
    },
    onStart: () => seen.events.push("start"),
    onAtLimit: () => seen.events.push("limit"),
    onAnswer: () => seen.events.push("answer"),
    onError: (error) =>
      seen.events.push(`error:${(error as { code?: string }).code ?? "?"}`),
  };
  const order = createVoiceFlow(deps);
  const settle = async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setImmediate(resolve));
  };
  return { order, recorder, seen, settle, waits };
}
