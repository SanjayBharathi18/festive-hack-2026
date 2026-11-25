import { isAbortError } from "../api/api.ts";
import type { Wait } from "../wait/wait.ts";

export type VoiceFlow = {
  toggle(): void;
  choose(file: Blob): void;
};

// The shapes of the recorder, prepareVoice and the sounds in src/, without
// their browser types, so that this flow runs under node:test.
export type VoiceRecorder = {
  readonly phase: "idle" | "opening" | "recording" | "stopping";
  record(options?: {
    beforeOpen?: () => unknown;
  }): Promise<{ audio: Blob; atLimit: boolean }>;
  stop(): void;
};

export type VoiceSounds = {
  record(mark: "start"): Promise<void>;
  working(): void;
  fallback(): void;
};

// A reading that takes longer than this plays the working sound, once.
export const workingAfterMs = 1000;

export type VoiceFlowDeps<Answer, Step> = {
  recorder: VoiceRecorder;
  prepare: (
    source: Blob,
    options: { signal?: AbortSignal },
  ) => Promise<{ parts: Blob[] }>;
  read: (
    parts: readonly Blob[],
    options: { signal: AbortSignal; onStep: (step: Step) => void },
  ) => Promise<Answer>;
  wait: Pick<Wait, "run" | "cancel">;
  sounds: VoiceSounds;
  words: { opening: string; step: (step: Step) => string };
  onStart: () => void;
  onAtLimit: () => void;
  onAnswer: (answer: Answer) => void;
  onError: (error: unknown) => void;
};

// Tap to start, tap to stop; or choose a voice note. A new recording or file
// replaces a reading that still runs, so nobody waits to speak. The start
// mark plays before the microphone opens. A failure plays the fallback
// sound (docs/sound.md): voice failed, and the list and the typed words stay.
export function createVoiceFlow<Answer, Step>(
  deps: VoiceFlowDeps<Answer, Step>,
): VoiceFlow {
  const { recorder, wait, sounds } = deps;

  const fail = (error: unknown) => {
    if (isAbortError(error)) return;
    sounds.fallback();
    deps.onError(error);
  };

  async function readSource(source: Blob): Promise<void> {
    const working = setTimeout(() => sounds.working(), workingAfterMs);
    try {
      const answer = await wait.run(async (signal, progress) => {
        const voice = await deps.prepare(source, { signal });
        signal.throwIfAborted();
        return deps.read(voice.parts, {
          signal,
          onStep: (step) => progress(deps.words.step(step)),
        });
      }, deps.words.opening);
      clearTimeout(working);
      deps.onAnswer(answer);
    } catch (error) {
      fail(error);
    } finally {
      clearTimeout(working);
    }
  }

  const start = () => {
    wait.cancel();
    deps.onStart();
  };

  return {
    toggle() {
      if (recorder.phase === "opening" || recorder.phase === "recording") {
        recorder.stop();
        return;
      }
      if (recorder.phase === "stopping") return;
      start();
      recorder
        .record({ beforeOpen: () => sounds.record("start") })
        .then((recording) => {
          if (recording.atLimit) deps.onAtLimit();
          return readSource(recording.audio);
        }, fail);
    },
    choose(file) {
      if (recorder.phase !== "idle") return;
      start();
      void readSource(file);
    },
  };
}
