import { levelOf, smoothLevel } from "./level.ts";
import { sourceSeconds } from "./limits.ts";
import { voiceError, type VoiceErrorCode } from "./voice-error.ts";

export type RecorderPhase = "idle" | "opening" | "recording" | "stopping";
export type RecorderView = { phase: RecorderPhase; level: number; ms: number };
export type Recording = { audio: Blob; ms: number; atLimit: boolean };
export type RecordOptions = {
  signal?: AbortSignal | undefined;
  beforeOpen?: (() => unknown) | undefined;
};
export type Recorder = {
  readonly phase: RecorderPhase;
  record(options?: RecordOptions): Promise<Recording>;
  stop(): void;
};

type End = "stop" | "limit" | "ended" | "abort";
type Meter = { listen(stream: MediaStream): () => number; close(): void };

const mimeTypes = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
// Speech models do better with the raw voice, and no sound plays while the
// microphone is open, so there is no echo to cancel.
const constraints: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
};
const microphoneProblems: Partial<Record<string, VoiceErrorCode>> = {
  NotAllowedError: "mic_denied",
  SecurityError: "mic_denied",
  NotFoundError: "mic_missing",
  OverconstrainedError: "mic_missing",
  NotReadableError: "mic_busy",
  AbortError: "mic_busy",
};
const hookLimitMs = 500;
const stopLimitMs = 2000;

export function createRecorder(
  onChange: (view: RecorderView) => void,
): Recorder {
  let phase: RecorderPhase = "idle";
  let end: ((reason: End) => void) | undefined;
  let stopBeforeOpen = false;

  const show = (next: RecorderPhase, level = 0, ms = 0) => {
    phase = next;
    onChange({ phase, level, ms });
  };

  async function capture(
    stream: MediaStream,
    meter: Meter | undefined,
    signal: AbortSignal | undefined,
  ): Promise<Recording> {
    const mimeType = mimeTypes.find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(
      stream,
      mimeType === undefined ? {} : { mimeType },
    );
    const chunks: Blob[] = [];
    let failure: unknown;
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    const ended = new Promise<End>((resolve) => {
      end = resolve;
    });
    recorder.addEventListener("error", (event) => {
      failure = event;
      end?.("ended");
    });
    const onAbort = () => end?.("abort");
    signal?.addEventListener("abort", onAbort, { once: true });
    for (const track of stream.getAudioTracks()) {
      track.addEventListener("ended", () => end?.("ended"), { once: true });
    }
    const limit = setTimeout(() => end?.("limit"), sourceSeconds * 1000);
    let frame = 0;
    let startedAt = performance.now();
    let reason: End;
    try {
      const readLevel = meter?.listen(stream);
      recorder.start(1000);
      startedAt = performance.now();
      let level = 0;
      const tick = () => {
        level = smoothLevel(level, readLevel?.() ?? 0);
        show("recording", level, performance.now() - startedAt);
        frame = requestAnimationFrame(tick);
      };
      show("recording");
      frame = requestAnimationFrame(tick);
      reason = await ended;
    } finally {
      end = undefined;
      cancelAnimationFrame(frame);
      clearTimeout(limit);
      signal?.removeEventListener("abort", onAbort);
    }

    const ms = performance.now() - startedAt;
    if (recorder.state !== "inactive") recorder.stop();
    stopTracks(stream);
    meter?.close();
    show("stopping", 0, ms);
    await Promise.race([stopped, delay(stopLimitMs)]);

    if (reason === "abort") throw signal?.reason;
    if (failure !== undefined) throw voiceError("mic_busy", {}, failure);
    const audio = new Blob(chunks, {
      type: recorder.mimeType || mimeType || "",
    });
    if (audio.size === 0) throw voiceError("too_short");
    return { audio, ms, atLimit: reason === "limit" };
  }

  return {
    get phase() {
      return phase;
    },
    async record({ signal, beforeOpen } = {}) {
      if (phase !== "idle") {
        throw new DOMException("The recorder is already busy.", "AbortError");
      }
      if (
        navigator.mediaDevices?.getUserMedia === undefined ||
        typeof MediaRecorder === "undefined"
      ) {
        throw voiceError("mic_unsupported");
      }
      signal?.throwIfAborted();
      const meter = createMeter();
      stopBeforeOpen = false;
      show("opening");
      const throwIfStopped = () => {
        signal?.throwIfAborted();
        if (stopBeforeOpen) {
          throw new DOMException(
            "Stopped before the microphone opened.",
            "AbortError",
          );
        }
      };
      let stream: MediaStream | undefined;
      try {
        await playBeforeOpen(beforeOpen);
        throwIfStopped();
        stream = await openMicrophone();
        throwIfStopped();
        return await capture(stream, meter, signal);
      } finally {
        if (stream !== undefined) stopTracks(stream);
        meter?.close();
        show("idle");
      }
    },
    stop() {
      if (phase === "opening") stopBeforeOpen = true;
      else end?.("stop");
    },
  };
}

async function playBeforeOpen(
  hook: (() => unknown) | undefined,
): Promise<void> {
  if (hook === undefined) return;
  try {
    await Promise.race([hook(), delay(hookLimitMs)]);
  } catch (error) {
    console.error("The sound before the recording failed.", error);
  }
}

async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw voiceError(microphoneProblems[name] ?? "mic_unsupported", {}, error);
  }
}

function createMeter(): Meter | undefined {
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch (error) {
    console.error("The level meter has no audio context.", error);
    return undefined;
  }
  // iOS runs a context only when it resumes inside the tap, before any await.
  void context.resume().catch(() => {});
  let closed = false;
  return {
    listen(stream) {
      try {
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        if (context.state !== "running") void context.resume().catch(() => {});
        const samples = new Float32Array(analyser.fftSize);
        return () => {
          analyser.getFloatTimeDomainData(samples);
          return levelOf(samples);
        };
      } catch (error) {
        console.error("The level meter cannot hear the microphone.", error);
        return () => 0;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      void context.close().catch(() => {});
    },
  };
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
