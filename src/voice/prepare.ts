import {
  lengthProblem,
  maxFileBytes,
  sourceMinutes,
  wavRate,
} from "./limits.ts";
import { voiceError } from "./voice-error.ts";
import { secondsAsOnePart, toWavParts } from "./wav-parts.ts";
import { wavSeconds } from "./wav.ts";

export type Voice = { parts: Blob[]; seconds: number };

const metadataLimitMs = 3000;

export async function prepareVoice(
  source: Blob,
  { signal }: { signal?: AbortSignal | undefined } = {},
): Promise<Voice> {
  signal?.throwIfAborted();
  if (source.size === 0) throw voiceError("too_short");
  if (source.size > maxFileBytes) {
    throw voiceError("too_big", { minutes: sourceMinutes });
  }
  const bytes = await source.arrayBuffer();
  signal?.throwIfAborted();
  const seconds = secondsAsOnePart(bytes);
  if (seconds !== undefined) {
    return { parts: [new Blob([bytes], { type: "audio/wav" })], seconds };
  }
  // A 30-minute voice note is small as Opus but fills the phone's memory
  // once it is decoded, so its length is checked before the decode.
  const length = wavSeconds(bytes) ?? (await metadataSeconds(source, signal));
  signal?.throwIfAborted();
  if (length !== undefined && lengthProblem(length) === "too_long") {
    throw voiceError("too_long", { minutes: sourceMinutes });
  }
  const audio = await decode(bytes);
  signal?.throwIfAborted();
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) =>
    audio.getChannelData(index),
  );
  const prepared = toWavParts(channels, audio.sampleRate);
  return {
    parts: prepared.parts.map(
      (part) => new Blob([part], { type: "audio/wav" }),
    ),
    seconds: prepared.seconds,
  };
}

// The context decodes at 16 kHz, so the browser resamples in native code.
async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  try {
    return await new OfflineAudioContext(1, 1, wavRate).decodeAudioData(bytes);
  } catch (error) {
    throw voiceError("cannot_decode", {}, error);
  }
}

// The length from the file's metadata, or undefined when the browser does not
// know it (a MediaRecorder WebM file has none), cannot open the file, or is slow.
function metadataSeconds(
  source: Blob,
  signal: AbortSignal | undefined,
): Promise<number | undefined> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(source);
    let finished = false;
    const finish = (seconds?: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      resolve(
        seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined,
      );
    };
    const stop = () => finish();
    const timer = setTimeout(stop, metadataLimitMs);
    signal?.addEventListener("abort", stop, { once: true });
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => finish(audio.duration), {
      once: true,
    });
    audio.addEventListener("error", stop, { once: true });
    audio.src = url;
  });
}
