import type { Stamp } from "../../shared/orders.ts";
import type { RecorderPhase } from "../voice/recorder.ts";
import { createSampleCache } from "./buffers.ts";
import { makeupGain, renderSound, roomImpulse } from "./render.ts";
import {
  arrivalRings,
  fadeMs,
  fire,
  frequentRenders,
  heldArrivalMs,
  heroOffsetMs,
  levelVariationDb,
  maxVoices,
  openThrottle,
  repeatDb,
  seedOrder,
  separationDelay,
  startMarkMs,
  throttle,
  voiceToStop,
  type Throttle,
} from "./schedule.ts";
import { createSoundSetting, type KeyValueStore } from "./setting.ts";
import {
  core,
  cueKey,
  cues,
  roles,
  sendLevels,
  type ArrivalKind,
  type AvailChange,
  type CommitForm,
  type Cue,
  type RecordMark,
  type RoleId,
  type Send,
} from "./sounds.ts";
import { createVibration, patternFor } from "./vibration.ts";

/** One function for each role. None of them throws: a failed sound is logged, and the action goes on. */
export type Sounds = {
  readonly enabled: boolean;
  /** The toggle: sound and vibration. Turning it on plays a tick. */
  setEnabled(on: boolean): void;
  /** Forward each phase of the recorder: sounds wait while the microphone is open. */
  microphone(phase: RecorderPhase): void;
  /** A choice; a pack plays on its swara, by its place in the row of packs (0 is the smallest). */
  tick(pack?: number): void;
  step(quantity: number): void;
  pick(chosen: boolean): void;
  /** The start mark resolves when it has ended, so the recorder opens the microphone after it. */
  record(mark: RecordMark): Promise<void>;
  limit(): void;
  error(): void;
  stamp(status: Stamp | "paid"): void;
  commit(form?: CommitForm): void;
  cancel(): void;
  undo(): void;
  /** The draft fields that filled, in order, and the places among them of the unsure ones. */
  cascade(fields: number, unsure?: readonly number[]): void;
  settle(): void;
  avail(change: AvailChange): void;
  working(): void;
  fallback(): void;
  arrival(kind?: ArrivalKind): void;
  /** On the server's reply; `moveStartedAt` is the performance.now() of the start of the slip move. */
  saved(moveStartedAt?: number): void;
  placed(): void;
};
export type SoundOptions = {
  store?: KeyValueStore | undefined;
  report?: (message: string, error: unknown) => void;
};

type Audio = {
  readonly ctx: AudioContext;
  readonly bus: GainNode;
  readonly master: GainNode;
  readonly sends: Readonly<Record<Send, GainNode>>;
};
type Voice = {
  readonly role: RoleId;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
};
type Job = { readonly cue: Cue; readonly seed: number; readonly key: string };
type PlayOptions = {
  readonly offsetMs?: number;
  readonly whileOpening?: boolean;
};

// The context runs at this rate, so the buffers render before it exists.
const sampleRate = 48_000;
const sampleBudget = 30 * sampleRate;
const gestures = ["pointerup", "touchend", "click", "keydown"] as const;
const limiter = {
  threshold: -6,
  knee: 0,
  ratio: 20,
  attack: 0.001,
  release: 0.1,
};
const idleSliceMs = 8;

export function createSounds({
  store,
  report = console.error,
}: SoundOptions = {}): Sounds {
  const setting = createSoundSetting(store, report);
  const vibration = createVibration({
    userAgent: navigator.userAgent,
    vibrate:
      typeof navigator.vibrate === "function"
        ? (pattern) => navigator.vibrate(pattern)
        : undefined,
  });
  const supported =
    typeof AudioContext === "function" && typeof AudioBuffer === "function";
  const cache = createSampleCache<AudioBuffer>(
    sampleBudget,
    (buffer) => buffer.length,
  );
  const queued = new Set<string>();
  const jobs: Job[] = [];
  const turns = new Map<string, number>();
  const repeats = new Map<RoleId, { at: number; db: number }>();
  const voices: Voice[] = [];
  let audio: Audio | undefined;
  let resuming = false;
  let warming = false;
  let muted = false;
  let phase: RecorderPhase = "idle";
  let micOpen = false;
  let held: Cue | undefined;
  let lastStart: { role: RoleId; at: number } | undefined;
  let lastBellAt: number | undefined;
  let steps: Throttle = openThrottle;
  let waitingStep: Cue | undefined;
  let stepTimer: ReturnType<typeof setTimeout> | undefined;

  const safely = (run: () => void) => {
    try {
      run();
    } catch (error) {
      report("A sound failed.", error);
    }
  };

  const later = (run: () => void, ms: number) => {
    if (ms <= 0) safely(run);
    else setTimeout(() => safely(run), ms);
  };

  // A touch pointerdown does not allow audio; these events do. After the page
  // comes back from the background, the next one resumes the context.
  const wake = () =>
    safely(() => {
      if (!supported || !setting.on) return;
      audio ??= openAudio();
      const { ctx } = audio;
      if (ctx.state === "running" || resuming) return;
      resuming = true;
      ctx
        .resume()
        .catch((error: unknown) => report("The sound cannot start.", error))
        .finally(() => {
          resuming = false;
        });
    });

  function openAudio(): Audio {
    const ctx = new AudioContext({ latencyHint: "interactive", sampleRate });
    const bus = new GainNode(ctx);
    const master = new GainNode(ctx);
    const trim = new GainNode(ctx, {
      gain: 1 / makeupGain(limiter.threshold, limiter.ratio),
    });
    bus
      .connect(
        new BiquadFilterNode(ctx, {
          type: "highpass",
          frequency: 180,
          Q: Math.SQRT1_2,
        }),
      )
      .connect(
        new BiquadFilterNode(ctx, {
          type: "lowpass",
          frequency: 12_000,
          Q: Math.SQRT1_2,
        }),
      )
      .connect(master)
      .connect(new DynamicsCompressorNode(ctx, limiter))
      .connect(trim)
      .connect(ctx.destination);
    const [left, right] = roomImpulse(sampleRate);
    const impulse = new AudioBuffer({
      length: left.length,
      numberOfChannels: 2,
      sampleRate,
    });
    impulse.copyToChannel(left, 0);
    impulse.copyToChannel(right, 1);
    const room = new ConvolverNode(ctx, { buffer: impulse });
    room
      .connect(
        new BiquadFilterNode(ctx, {
          type: "highpass",
          frequency: 300,
          Q: Math.SQRT1_2,
        }),
      )
      .connect(bus);
    const send = (gain: number) => {
      const node = new GainNode(ctx, { gain });
      node.connect(room);
      return node;
    };
    return {
      ctx,
      bus,
      master,
      sends: {
        hand: send(sendLevels.hand),
        answer: send(sendLevels.answer),
        hero: send(sendLevels.hero),
      },
    };
  }

  function playable(): Audio | undefined {
    if (audio === undefined) return undefined;
    return audio.ctx.state === "running" || resuming ? audio : undefined;
  }

  function play(
    cue: Cue,
    { offsetMs = 0, whileOpening = false }: PlayOptions = {},
  ): Voice | undefined {
    if (!setting.on) return undefined;
    const startMark = whileOpening && phase === "opening";
    if (micOpen && !startMark) return undefined;
    const sound = playable();
    if (sound === undefined) return undefined;
    const now = performance.now();
    const waitMs =
      startMark || lastStart === undefined || lastStart.role === cue.role
        ? 0
        : separationDelay(lastStart.at, now);
    const previous = repeats.get(cue.role);
    const db = repeatDb(
      previous?.db ?? 0,
      previous === undefined ? undefined : now - previous.at,
    );
    repeats.set(cue.role, { at: now, db });
    lastStart = { role: cue.role, at: now + waitMs };
    const level = db + levelVariationDb(Math.random());
    const voice = start(
      sound,
      bufferFor(cue),
      cue.role,
      waitMs,
      offsetMs,
      level,
    );
    const pattern = patternFor(cue);
    if (pattern !== undefined) later(() => vibration.buzz(pattern), waitMs);
    return voice;
  }

  function start(
    sound: Audio,
    buffer: AudioBuffer,
    role: RoleId,
    waitMs: number,
    offsetMs: number,
    db: number,
  ): Voice {
    const { ctx } = sound;
    const source = new AudioBufferSourceNode(ctx, { buffer });
    const gain = new GainNode(ctx, { gain: 10 ** (db / 20) });
    source.connect(gain);
    gain.connect(sound.bus);
    gain.connect(sound.sends[roles[role].send]);
    const voice: Voice = { role, source, gain };
    voices.push(voice);
    source.addEventListener(
      "ended",
      () => {
        drop(voice);
        gain.disconnect();
      },
      { once: true },
    );
    const offset = Math.min(offsetMs / 1000, buffer.duration);
    source.start(ctx.currentTime + waitMs / 1000, offset);
    const playing = voices.map((other) => other.role);
    const replaced = voices[voiceToStop(playing, role, maxVoices)];
    if (replaced !== undefined && replaced !== voice) fadeOut(replaced);
    return voice;
  }

  function drop(voice: Voice) {
    const index = voices.indexOf(voice);
    if (index >= 0) voices.splice(index, 1);
  }

  function fadeOut(voice: Voice) {
    drop(voice);
    const now = voice.gain.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, fadeMs / 4000);
    voice.source.stop(now + fadeMs / 1000);
  }

  function hush() {
    for (const voice of [...voices]) fadeOut(voice);
    clearTimeout(stepTimer);
    stepTimer = undefined;
    waitingStep = undefined;
    steps = openThrottle;
  }

  function mute(on: boolean) {
    if (audio === undefined || muted === on) return;
    muted = on;
    const { ctx, master } = audio;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    if (on) master.gain.setTargetAtTime(0, now, fadeMs / 4000);
    else master.gain.setValueAtTime(1, now);
  }

  function bufferFor(cue: Cue): AudioBuffer {
    const base = cueKey(cue);
    const count = roles[cue.role].frequent ? frequentRenders : 1;
    if (count > 1) warm([cue], count);
    for (const seed of seedOrder(turns.get(base), count)) {
      const buffer = cache.get(`${base}|${seed}`);
      if (buffer === undefined) continue;
      turns.set(base, seed);
      return buffer;
    }
    turns.set(base, 0);
    return render(cue, 0);
  }

  function render(cue: Cue, seed: number): AudioBuffer {
    const key = `${cueKey(cue)}|${seed}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const { data } = renderSound(cue, sampleRate, seed);
    const buffer = new AudioBuffer({
      length: data.length,
      numberOfChannels: 1,
      sampleRate,
    });
    buffer.copyToChannel(data, 0);
    cache.set(key, buffer);
    return buffer;
  }

  function warm(list: readonly Cue[], count: number) {
    if (!supported) return;
    for (const cue of list) {
      for (let seed = 0; seed < count; seed++) {
        const key = `${cueKey(cue)}|${seed}`;
        if (queued.has(key) || cache.has(key)) continue;
        queued.add(key);
        jobs.push({ cue, seed, key });
      }
    }
    if (warming || jobs.length === 0) return;
    warming = true;
    idle(work);
  }

  function work(deadline?: IdleDeadline) {
    do {
      const job = jobs.shift();
      if (job === undefined) break;
      queued.delete(job.key);
      if (setting.on) safely(() => render(job.cue, job.seed));
    } while (jobs.length > 0 && (deadline?.timeRemaining() ?? 0) > idleSliceMs);
    if (jobs.length > 0) idle(work);
    else warming = false;
  }

  function step(cue: Cue) {
    if (!setting.on || micOpen) return;
    const now = performance.now();
    const next = throttle(steps, now);
    steps = next.state;
    if (next.play === "now") {
      play(cue);
      return;
    }
    waitingStep = cue;
    if (next.play === "merge") return;
    stepTimer = setTimeout(
      () =>
        safely(() => {
          stepTimer = undefined;
          steps = fire(performance.now());
          const due = waitingStep;
          waitingStep = undefined;
          if (due !== undefined) play(due);
        }),
      next.at - now,
    );
  }

  function ring(cue: Cue) {
    if (!setting.on) return;
    if (micOpen) {
      held = cue;
      return;
    }
    const now = performance.now();
    if (!arrivalRings(lastBellAt, now)) return;
    if (play(cue) !== undefined) lastBellAt = now;
  }

  function record(mark: RecordMark): Promise<void> {
    try {
      if (mark === "stop") {
        play(cues.record("stop"));
        return Promise.resolve();
      }
      const voice = play(cues.record("start"), { whileOpening: true });
      if (voice === undefined) return Promise.resolve();
      return new Promise((resolve) => {
        setTimeout(() => {
          safely(() => {
            if (micOpen) mute(true);
          });
          setTimeout(resolve, fadeMs);
        }, startMarkMs);
      });
    } catch (error) {
      report("A sound failed.", error);
      return Promise.resolve();
    }
  }

  for (const type of gestures) {
    addEventListener(type, wake, { capture: true, passive: true });
  }
  if (setting.on) warm(core, 1);

  return {
    get enabled() {
      return setting.on;
    },
    setEnabled: (on) =>
      safely(() => {
        setting.set(on);
        if (!on) {
          hush();
          held = undefined;
          return;
        }
        wake();
        warm(core, 1);
        play(cues.tick());
      }),
    microphone: (next) =>
      safely(() => {
        const was = phase;
        phase = next;
        const open = next === "opening" || next === "recording";
        if (open && !micOpen) {
          micOpen = true;
          hush();
        }
        if (next === "recording") mute(true);
        if (open || !micOpen) return;
        micOpen = false;
        mute(false);
        if (was === "recording") play(cues.record("stop"));
        const arrival = held;
        held = undefined;
        if (arrival !== undefined) later(() => ring(arrival), heldArrivalMs);
      }),
    tick: (pack) => safely(() => play(cues.tick(pack))),
    step: (quantity) => safely(() => step(cues.step(quantity))),
    pick: (chosen) => safely(() => play(cues.pick(chosen))),
    record,
    limit: () => safely(() => play(cues.limit())),
    error: () => safely(() => play(cues.error())),
    stamp: (status) => safely(() => play(cues.stamp(status))),
    commit: (form) => safely(() => play(cues.commit(form))),
    cancel: () => safely(() => play(cues.cancel())),
    undo: () => safely(() => play(cues.undo())),
    cascade: (fields, unsure) =>
      safely(() => play(cues.cascade(fields, unsure))),
    settle: () => safely(() => play(cues.settle())),
    avail: (change) => safely(() => play(cues.avail(change))),
    working: () => safely(() => play(cues.working())),
    fallback: () => safely(() => play(cues.fallback())),
    arrival: (kind) => safely(() => ring(cues.arrival(kind))),
    saved: (moveStartedAt) =>
      safely(() =>
        play(cues.saved(), {
          offsetMs:
            moveStartedAt === undefined
              ? 0
              : heroOffsetMs(moveStartedAt, performance.now()),
        }),
      ),
    placed: () => safely(() => play(cues.placed())),
  };
}

function idle(run: (deadline?: IdleDeadline) => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 50);
  }
}
