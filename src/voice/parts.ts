// Cuts samples into the fewest parts of maxLength or less. Each cut sits at
// the quietest frame near an even split, so that a cut does not split a word.
export function cutParts(
  samples: Float32Array,
  maxLength: number,
  frame: number,
): Float32Array[] {
  const count = Math.ceil(samples.length / maxLength);
  if (count <= 1) return [samples];
  const even = samples.length / count;
  const reach = Math.max(0, Math.floor((maxLength - even) / 2) - frame);
  const cuts = [0];
  for (let part = 1; part < count; part++) {
    const target = Math.round(part * even);
    cuts.push(quietest(samples, target - reach, target + reach, frame));
  }
  cuts.push(samples.length);
  return cuts.slice(1).map((end, part) => samples.subarray(cuts[part]!, end));
}

function quietest(
  samples: Float32Array,
  from: number,
  to: number,
  frame: number,
): number {
  const half = Math.floor(frame / 2);
  let energy = 0;
  for (let index = from - half; index < from - half + frame; index++) {
    energy += (samples[index] ?? 0) ** 2;
  }
  const target = Math.round((from + to) / 2);
  let best = from;
  let lowest = energy;
  for (let centre = from + 1; centre <= to; centre++) {
    energy +=
      (samples[centre - half + frame - 1] ?? 0) ** 2 -
      (samples[centre - half - 1] ?? 0) ** 2;
    const quieter = energy < lowest - 1e-9;
    const asQuietButCloser =
      !quieter &&
      energy <= lowest + 1e-9 &&
      Math.abs(centre - target) < Math.abs(best - target);
    if (quieter || asQuietButCloser) {
      lowest = Math.min(lowest, energy);
      best = centre;
    }
  }
  return best;
}
