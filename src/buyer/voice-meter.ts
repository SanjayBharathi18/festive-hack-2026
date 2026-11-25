import { formatTimer } from "../text/format.ts";
import { sourceSeconds } from "../voice/limits.ts";

// The type of HTMLElement.hidden, so that this module runs under node:test.
type Hidden = boolean | "until-found";

export type MeterView = { phase: string; level: number; ms: number };
export type MeterParts = {
  level: {
    hidden: Hidden;
    style: { setProperty(name: string, value: string): void };
  };
  timer: { hidden: Hidden; textContent: string | null };
};

const limit = formatTimer(sourceSeconds * 1000);

// The level meter and the timer of a recording, as on the desk: they show
// only while the microphone is open, and the timer counts up to the limit.
export function showVoiceMeter({ level, timer }: MeterParts, view: MeterView) {
  const listening = view.phase === "recording";
  level.hidden = !listening;
  timer.hidden = !listening;
  level.style.setProperty("--level", String(view.level));
  timer.textContent = timerText(view.ms);
}

export function timerText(ms: number): string {
  return `${formatTimer(ms)} / ${limit}`;
}
