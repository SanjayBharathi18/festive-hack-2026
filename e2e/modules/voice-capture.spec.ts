import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect } from "@playwright/test";
import { encodeWav } from "../../src/voice/wav.ts";

type PartSummary = {
  type: string;
  bytes: number;
  sampleRate: number | undefined;
  channels: number | undefined;
  seconds: number;
  sha256: string;
};
type Outcome = { parts: PartSummary[]; seconds: number } | { error: string };
type Source = "garbage" | "long_wav" | "long_mp3" | "short_mp3";
type VoiceTest = {
  phase(): string;
  phases(): string[];
  maxLevel(): number;
  timeline(): string[];
  tracksEndedAtStop(): boolean | undefined;
  reset(soundMs: number): void;
  recordWhileBusy(): Promise<string>;
  recording(): Promise<Outcome & { ms?: number; atLimit?: boolean }>;
  file(): Promise<Outcome>;
  prepare(source: Source): Promise<Outcome & { decodes: number }>;
};

declare global {
  interface Window {
    voiceTest: VoiceTest;
  }
}

const test = base.extend<{}, { fakeMicrophone: string }>({
  fakeMicrophone: [
    async ({}, use, workerInfo) => {
      mkdirSync(workerInfo.project.outputDir, { recursive: true });
      const file = join(
        workerInfo.project.outputDir,
        `microphone-${workerInfo.workerIndex}.wav`,
      );
      writeFileSync(file, encodeWav(toneBursts(48_000, 4), 48_000));
      await use(file);
    },
    { scope: "worker" },
  ],
  launchOptions: [
    async ({ launchOptions, fakeMicrophone }, use) => {
      await use({
        ...launchOptions,
        args: [
          ...(launchOptions.args ?? []),
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
          `--use-file-for-fake-audio-capture=${fakeMicrophone}`,
        ],
      });
    },
    { scope: "worker" },
  ],
});

test("a recording and an audio file become 16 kHz mono WAV parts", async ({
  page,
}) => {
  const record = page.getByRole("button", { name: "Record" });
  await page.route("**/voice-capture", (route) =>
    route.fulfill({ contentType: "text/html", body: harnessPage }),
  );
  await page.goto("/voice-capture");
  await page.waitForFunction(() => window.voiceTest !== undefined);

  await test.step("tap to start: the start sound ends before the microphone opens", async () => {
    await record.click();
    await expect
      .poll(() => page.evaluate(() => window.voiceTest.phase()))
      .toBe("recording");
    expect(await page.evaluate(() => window.voiceTest.timeline())).toEqual([
      "sound starts",
      "sound ends",
      "microphone opens",
    ]);
  });

  await test.step("the level moves while the timer runs", async () => {
    await page.waitForTimeout(1500);
    expect(
      await page.evaluate(() => window.voiceTest.maxLevel()),
    ).toBeGreaterThan(0.3);
  });

  await test.step("tap to stop: the microphone closes at once, then the parts come", async () => {
    await record.click();
    const outcome = await page.evaluate(() => window.voiceTest.recording());
    expect(
      await page.evaluate(() => window.voiceTest.tracksEndedAtStop()),
    ).toBe(true);
    expect(await page.evaluate(() => window.voiceTest.phases())).toEqual([
      "opening",
      "recording",
      "stopping",
      "idle",
    ]);
    if ("error" in outcome) {
      throw new Error(`The recording failed: ${outcome.error}`);
    }
    expect(outcome.atLimit).toBe(false);
    expect(outcome.parts).toHaveLength(1);
    expectWavPart(outcome.parts[0]);
    expect(outcome.seconds).toBeGreaterThan(1.2);
    expect(Math.abs(outcome.seconds - (outcome.ms ?? 0) / 1000)).toBeLessThan(
      0.5,
    );
  });

  await test.step("a tap during the start sound stops it, and the microphone never opens", async () => {
    await page.evaluate(() => window.voiceTest.reset(400));
    await record.click();
    expect(await page.evaluate(() => window.voiceTest.phase())).toBe("opening");
    expect(await page.evaluate(() => window.voiceTest.recordWhileBusy())).toBe(
      "AbortError",
    );
    await record.click();
    expect(await page.evaluate(() => window.voiceTest.recording())).toEqual({
      error: "AbortError",
    });
    expect(await page.evaluate(() => window.voiceTest.timeline())).toEqual([
      "sound starts",
      "sound ends",
    ]);
    expect(await page.evaluate(() => window.voiceTest.phase())).toBe("idle");
  });

  await test.step("a 65 s file from the file input becomes three balanced parts", async () => {
    const file = Buffer.from(encodeWav(toneBursts(44_100, 65), 44_100));
    await page.locator("input[type=file]").setInputFiles({
      name: "voice-note.wav",
      mimeType: "audio/wav",
      buffer: file,
    });
    const outcome = await page.evaluate(() => window.voiceTest.file());
    if ("error" in outcome) {
      throw new Error(`The file failed: ${outcome.error}`);
    }
    expect(outcome.parts).toHaveLength(3);
    for (const part of outcome.parts) expectWavPart(part);
    const total = outcome.parts.reduce((sum, part) => sum + part.seconds, 0);
    expect(Math.abs(total - 65)).toBeLessThan(0.01);
  });

  await test.step("a 16 kHz mono WAV of 29 s or less goes byte for byte", async () => {
    const sent = encodeWav(toneBursts(16_000, 10), 16_000);
    await page.locator("input[type=file]").setInputFiles({
      name: "fixture.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from(sent),
    });
    const outcome = await page.evaluate(() => window.voiceTest.file());
    if ("error" in outcome) {
      throw new Error(`The part failed: ${outcome.error}`);
    }
    expect(outcome.parts.map((part) => part.sha256)).toEqual([
      createHash("sha256").update(sent).digest("hex"),
    ]);
  });

  await test.step("a file the phone cannot open is refused", async () => {
    expect(
      await page.evaluate(() => window.voiceTest.prepare("garbage")),
    ).toMatchObject({ error: "cannot_decode" });
  });

  await test.step("more than 5 minutes is refused before any decoding", async () => {
    expect(
      await page.evaluate(() => window.voiceTest.prepare("long_wav")),
    ).toEqual({ error: "too_long", decodes: 0 });
    expect(
      await page.evaluate(() => window.voiceTest.prepare("long_mp3")),
    ).toEqual({ error: "too_long", decodes: 0 });
    const short = await page.evaluate(() =>
      window.voiceTest.prepare("short_mp3"),
    );
    expect(short).toMatchObject({ decodes: 1 });
    if ("error" in short) throw new Error(`The MP3 failed: ${short.error}`);
    expect(short.parts).toHaveLength(1);
  });
});

function expectWavPart(part: PartSummary | undefined): void {
  expect(part?.type).toBe("audio/wav");
  expect(part?.sampleRate).toBe(16_000);
  expect(part?.channels).toBe(1);
  expect(part?.seconds).toBeLessThanOrEqual(29);
  expect(part?.bytes).toBeLessThanOrEqual(1_000_000);
}

function toneBursts(rate: number, seconds: number): Float32Array {
  const samples = new Float32Array(Math.round(rate * seconds));
  for (let index = 0; index < samples.length; index++) {
    const on = index % Math.round(rate * 0.5) < rate * 0.35;
    samples[index] = on
      ? 0.5 * Math.sin((2 * Math.PI * 440 * index) / rate)
      : 0;
  }
  return samples;
}

// The page under test. It loads the modules as source from the Vite dev
// server. It wraps getUserMedia to see when the microphone opens, and
// decodeAudioData to count the decodes. The MP3 files are silent frames:
// MPEG-1 Layer III, 32 kbit/s, 44.1 kHz, mono, 104 bytes and 1152 samples each.
const harnessPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Voice capture</title></head>
  <body>
    <button type="button" id="record">Record</button>
    <input type="file" accept="audio/*" aria-label="Audio file" />
    <script type="module">
      import { createRecorder } from "/voice/recorder.ts";
      import { prepareVoice } from "/voice/prepare.ts";
      import { encodeWav, readWavFormat } from "/voice/wav.ts";

      const streams = [];
      let timeline = [];
      let views = [];
      let tracksEndedAtStop;
      let soundMs = 100;
      let decodes = 0;
      const media = navigator.mediaDevices;
      const getUserMedia = media.getUserMedia.bind(media);
      media.getUserMedia = async (constraints) => {
        timeline.push("microphone opens");
        const stream = await getUserMedia(constraints);
        streams.push(stream);
        return stream;
      };
      const decodeAudioData = BaseAudioContext.prototype.decodeAudioData;
      BaseAudioContext.prototype.decodeAudioData = function (...args) {
        decodes += 1;
        return decodeAudioData.apply(this, args);
      };
      const tracksEnded = () =>
        streams.length > 0 &&
        streams.flatMap((stream) => stream.getTracks()).every((track) => track.readyState === "ended");

      const recorder = createRecorder((view) => {
        if (view.phase === "stopping" && tracksEndedAtStop === undefined) tracksEndedAtStop = tracksEnded();
        views.push(view);
      });

      const summary = async (voice) => ({
        seconds: voice.seconds,
        parts: await Promise.all(
          voice.parts.map(async (part) => {
            const bytes = await part.arrayBuffer();
            const format = readWavFormat(bytes);
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            return {
              type: part.type,
              bytes: part.size,
              sampleRate: format?.sampleRate,
              channels: format?.channels,
              seconds: (format?.dataBytes ?? 0) / 32000,
              sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
            };
          }),
        ),
      });
      const failure = (error) => ({ error: typeof error.code === "string" ? error.code : error.name });
      const outcome = (work) => work.then(summary, failure);

      let recording;
      document.querySelector("#record").addEventListener("click", () => {
        if (recorder.phase !== "idle") return recorder.stop();
        recording = recorder
          .record({
            beforeOpen: async () => {
              timeline.push("sound starts");
              await new Promise((resolve) => setTimeout(resolve, soundMs));
              timeline.push("sound ends");
            },
          })
          .then(async (done) => ({ ...(await outcome(prepareVoice(done.audio))), ms: done.ms, atLimit: done.atLimit }))
          .catch(failure);
      });

      let file;
      document.querySelector("input[type=file]").addEventListener("change", (event) => {
        const chosen = event.currentTarget.files?.[0];
        if (chosen) file = outcome(prepareVoice(chosen));
      });

      const mp3 = (seconds) => {
        const frameBytes = 104;
        const frames = Math.ceil((seconds * 44100) / 1152);
        const bytes = new Uint8Array(frames * frameBytes);
        for (let frame = 0; frame < frames; frame++) bytes.set([0xff, 0xfb, 0x10, 0xc0], frame * frameBytes);
        return new Blob([bytes], { type: "audio/mpeg" });
      };
      const sources = {
        garbage: () => new Blob([new TextEncoder().encode("this is not audio ".repeat(100))], { type: "audio/ogg" }),
        long_wav: () => new Blob([encodeWav(new Float32Array(8000 * 302), 8000)], { type: "audio/wav" }),
        long_mp3: () => mp3(400),
        short_mp3: () => mp3(3),
      };

      window.voiceTest = {
        phase: () => recorder.phase,
        phases: () => views.map((view) => view.phase).filter((phase, index, all) => phase !== all[index - 1]),
        maxLevel: () => Math.max(0, ...views.map((view) => view.level)),
        timeline: () => [...timeline],
        tracksEndedAtStop: () => tracksEndedAtStop,
        reset: (ms) => {
          timeline = [];
          views = [];
          soundMs = ms;
        },
        recordWhileBusy: () => recorder.record().then(() => "resolved", (error) => error.name),
        recording: () => recording,
        file: () => file,
        prepare: async (source) => {
          const before = decodes;
          const result = await outcome(prepareVoice(sources[source]()));
          return { ...result, decodes: decodes - before };
        },
      };
    </script>
  </body>
</html>`;
