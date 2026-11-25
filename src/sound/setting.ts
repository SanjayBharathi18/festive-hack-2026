export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
export type SoundSetting = {
  readonly on: boolean;
  set(on: boolean): void;
};

export const settingKey = "sound";

/** One setting for sound and vibration: on by default, kept in the browser. */
export function createSoundSetting(
  store: KeyValueStore | undefined,
  report: (message: string, error: unknown) => void = console.error,
): SoundSetting {
  let memory = true;
  return {
    get on() {
      try {
        return parseSetting(store?.getItem(settingKey)) ?? memory;
      } catch {
        return memory;
      }
    },
    set(on) {
      memory = on;
      try {
        store?.setItem(settingKey, on ? "on" : "off");
      } catch (error) {
        report("The sound setting cannot be kept.", error);
      }
    },
  };
}

export function parseSetting(
  stored: string | null | undefined,
): boolean | undefined {
  if (stored === "on") return true;
  if (stored === "off") return false;
  return undefined;
}
