import { test, expect, type Page } from "@playwright/test";

type AudioLog = {
  contexts: { state: string }[];
  links: number;
  starts: { at: number; phase: string }[];
  microphoneAt: number | undefined;
};
type SoundTest = {
  phase(): string;
  sounds: {
    tick(): void;
    step(quantity: number): void;
    arrival(kind?: "order" | "quote"): void;
    saved(): void;
    error(): void;
  };
};

declare global {
  interface Window {
    audioLog: AudioLog;
    soundTest: SoundTest;
  }
}

test.use({
  launchOptions: {
    args: [
      "--autoplay-policy=user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
});

test("the audio starts after a click, through the one master chain, with no errors", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openHarness(page);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.audioLog.contexts.length)).toBe(0);

  await page.getByRole("button", { name: "Tick" }).click();
  await expect
    .poll(() => page.evaluate(() => window.audioLog.contexts[0]?.state))
    .toBe("running");
  await expect
    .poll(() => page.evaluate(() => window.audioLog.starts.length))
    .toBe(1);
  expect(await page.evaluate(() => window.audioLog.links)).toBe(1);
  expect(errors).toEqual([]);
});

test("the toggle keeps sound and vibration on or off across a reload", async ({
  page,
}) => {
  await openHarness(page);
  const toggle = page.getByRole("button", { name: "Sound and vibration" });
  const words = toggle.locator("[data-sound-state]");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(words).toHaveText("Sound: on");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(words).toHaveText("Sound: off");
  await page.reload();
  await openedHarness(page);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(words).toHaveText("Sound: off");

  await page.getByRole("button", { name: "Tick" }).click();
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => [
      window.audioLog.contexts.length,
      window.audioLog.starts.length,
    ]),
  ).toEqual([0, 0]);

  await toggle.click();
  await expect(words).toHaveText("Sound: on");
  await expect
    .poll(() => page.evaluate(() => window.audioLog.starts.length))
    .toBe(1);
  await page.reload();
  await openedHarness(page);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("no sound plays while the microphone is open; one held arrival plays after it", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openHarness(page);
  const record = page.getByRole("button", { name: "Record" });
  const phase = () => page.evaluate(() => window.soundTest.phase());

  await record.click();
  await expect.poll(phase).toBe("recording");
  await page.evaluate(() => {
    const { sounds } = window.soundTest;
    sounds.tick();
    sounds.step(2);
    sounds.arrival();
    sounds.arrival("quote");
    sounds.saved();
    sounds.error();
  });
  await page.waitForTimeout(500);
  await record.click();
  await expect.poll(phase).toBe("idle");
  await page.waitForTimeout(800);

  const log = await page.evaluate(() => window.audioLog);
  const phases = log.starts.map((start) => start.phase);
  expect(phases.filter((each) => each === "recording")).toEqual([]);
  expect(phases.slice(0, 2)).toEqual(["opening", "stopping"]);
  expect(phases).toHaveLength(3);
  const [startMark] = log.starts;
  expect(log.microphoneAt).toBeDefined();
  expect((log.microphoneAt ?? 0) - (startMark?.at ?? 0)).toBeGreaterThan(120);
  expect(errors).toEqual([]);
});

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function openHarness(page: Page): Promise<void> {
  await page.route("**/sound-harness", (route) =>
    route.fulfill({ contentType: "text/html", body: harnessPage }),
  );
  await page.goto("/sound-harness");
  await openedHarness(page);
}

async function openedHarness(page: Page): Promise<void> {
  await page.waitForFunction(() => window.soundTest !== undefined);
}

const harnessPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Sound</title></head>
  <body>
    <button type="button" class="chip" id="sound-toggle" aria-pressed="true">
      <span class="visually-hidden">Sound and vibration</span>
      <span aria-hidden="true" data-sound-state>Sound: on</span>
    </button>
    <button type="button" id="tick">Tick</button>
    <button type="button" id="record">Record</button>
    <script>
      window.audioLog = { contexts: [], links: 0, starts: [], microphoneAt: undefined };
      const NativeContext = window.AudioContext;
      window.AudioContext = class extends NativeContext {
        constructor(options) {
          super(options);
          audioLog.contexts.push(this);
        }
      };
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (target, ...rest) {
        if (target instanceof AudioDestinationNode) audioLog.links += 1;
        return connect.call(this, target, ...rest);
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        audioLog.starts.push({ at: performance.now(), phase: window.soundTest?.phase() ?? "idle" });
        return start.apply(this, args);
      };
      const media = navigator.mediaDevices;
      const getUserMedia = media.getUserMedia.bind(media);
      media.getUserMedia = (constraints) => {
        audioLog.microphoneAt ??= performance.now();
        return getUserMedia(constraints);
      };
    </script>
    <script type="module">
      import { createSounds } from "/sound/engine.ts";
      import { bindSoundToggle } from "/sound/toggle.ts";
      import { createRecorder } from "/voice/recorder.ts";

      const sounds = createSounds({ store: localStorage });
      let phase = "idle";
      const recorder = createRecorder((view) => {
        phase = view.phase;
        sounds.microphone(view.phase);
      });
      bindSoundToggle(document.querySelector("#sound-toggle"), sounds, { on: "Sound: on", off: "Sound: off" });
      document.querySelector("#tick").addEventListener("click", () => sounds.tick());
      document.querySelector("#record").addEventListener("click", () => {
        if (recorder.phase !== "idle") return recorder.stop();
        recorder.record({ beforeOpen: () => sounds.record("start") }).catch(() => {});
      });
      window.soundTest = { sounds, phase: () => phase };
    </script>
  </body>
</html>`;
