export type SampleCache<T> = {
  get(key: string): T | undefined;
  has(key: string): boolean;
  set(key: string, value: T): void;
  readonly samples: number;
};

/** Rendered sounds by key, least recently used first out, within a budget of samples. */
export function createSampleCache<T>(
  budget: number,
  samplesOf: (value: T) => number,
): SampleCache<T> {
  const entries = new Map<string, T>();
  let samples = 0;
  return {
    get(key) {
      const value = entries.get(key);
      if (value !== undefined) {
        entries.delete(key);
        entries.set(key, value);
      }
      return value;
    },
    has: (key) => entries.has(key),
    set(key, value) {
      const old = entries.get(key);
      if (old !== undefined) {
        samples -= samplesOf(old);
        entries.delete(key);
      }
      entries.set(key, value);
      samples += samplesOf(value);
      for (const [oldest, entry] of entries) {
        if (samples <= budget || oldest === key) break;
        entries.delete(oldest);
        samples -= samplesOf(entry);
      }
    },
    get samples() {
      return samples;
    },
  };
}
