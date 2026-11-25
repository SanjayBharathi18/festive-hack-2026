export const floorDb = -60;
const release = 0.15;

export function levelOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  if (rms === 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db - floorDb) / -floorDb));
}

export function smoothLevel(previous: number, next: number): number {
  return next >= previous ? next : previous + (next - previous) * release;
}
