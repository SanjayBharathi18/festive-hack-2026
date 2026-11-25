import type { Sounds } from "./engine.ts";
import { settingKey } from "./setting.ts";

export type ToggleWords = { readonly on: string; readonly off: string };

/**
 * The "Sound: on / off" pill of the app bar: a chip with aria-pressed. Its name stays "Sound and
 * vibration"; the words in `[data-sound-state]` show the state. Another tab's change shows here too.
 * It returns a function that shows the pill in other words, for a page that changes its language.
 */
export function bindSoundToggle(
  button: HTMLButtonElement,
  sounds: Pick<Sounds, "enabled" | "setEnabled">,
  words: ToggleWords,
): (words: ToggleWords) => void {
  const state =
    button.querySelector<HTMLElement>("[data-sound-state]") ?? button;
  let shown = words;
  const show = () => {
    const on = sounds.enabled;
    button.setAttribute("aria-pressed", String(on));
    state.textContent = on ? shown.on : shown.off;
  };
  button.addEventListener("click", () => {
    sounds.setEnabled(!sounds.enabled);
    show();
  });
  addEventListener("storage", (event) => {
    if (event.key === settingKey || event.key === null) show();
  });
  show();
  return (next) => {
    shown = next;
    show();
  };
}
