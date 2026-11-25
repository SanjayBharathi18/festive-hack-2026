import type { Asked } from "../../shared/reading.ts";
import type { ReadingPack } from "./menu.ts";

export type PackCount = { pack: ReadingPack; quantity: number };
export type PackChoice = { packs: PackCount[]; near: boolean };
type Measure = "grams" | "pieces";
type Sized = { pack: ReadingPack; size: number };

export const maxPackCount = 999;
export const maxSearchSteps = 15_000;

export function choosePacks(
  packs: readonly ReadingPack[],
  asked: Asked,
): PackChoice | undefined {
  if (packs.length === 0) return undefined;
  if (asked.unit === "packs") return packsOfSize(packs, asked);
  const measure: Measure = asked.unit === "pieces" ? "pieces" : "grams";
  const sized = sizedBy(packs, measure);
  const amount =
    asked.quantity === null
      ? 0
      : Math.round(asked.quantity * (asked.unit === "kg" ? 1000 : 1));
  if (sized.length === 0 || amount < 1) {
    return { packs: [{ pack: smallest(packs), quantity: 1 }], near: true };
  }
  return capped(fewestPacks(sized, amount));
}

export function fewestPacks(
  sized: readonly Sized[],
  amount: number,
): PackChoice {
  const step = sized.reduce((divisor, { size }) => gcd(divisor, size), 0);
  const smallestSize = Math.min(...sized.map(({ size }) => size));
  const limit = Math.floor((amount + smallestSize) / step);
  if ((limit + 1) * sized.length > maxSearchSteps) {
    return largestFirst(sized, amount);
  }
  const count = new Float64Array(limit + 1).fill(Infinity);
  const price = new Float64Array(limit + 1).fill(Infinity);
  const last = new Int32Array(limit + 1).fill(-1);
  const units = Int32Array.from(sized, ({ size }) => size / step);
  const prices = Float64Array.from(sized, ({ pack }) => pack.price);
  count[0] = 0;
  price[0] = 0;
  for (let total = 1; total <= limit; total += 1) {
    let bestCount = Infinity;
    let bestPrice = Infinity;
    let bestIndex = -1;
    for (let index = 0; index < units.length; index += 1) {
      const before = total - (units[index] ?? total + 1);
      if (before < 0) continue;
      const packs = (count[before] ?? Infinity) + 1;
      const cost = (price[before] ?? Infinity) + (prices[index] ?? 0);
      if (packs < bestCount || (packs === bestCount && cost < bestPrice)) {
        bestCount = packs;
        bestPrice = cost;
        bestIndex = index;
      }
    }
    count[total] = bestCount;
    price[total] = bestPrice;
    last[total] = bestIndex;
  }
  const exact =
    amount % step === 0 && (count[amount / step] ?? Infinity) < Infinity
      ? amount / step
      : undefined;
  const target = exact ?? nearestTotal(count, amount, step);
  const quantities = new Map<number, number>();
  for (let total = target; total > 0;) {
    const index = last[total] ?? -1;
    const choice = sized[index];
    if (choice === undefined) break;
    quantities.set(index, (quantities.get(index) ?? 0) + 1);
    total -= choice.size / step;
  }
  const packs = [...quantities]
    .map(([index, quantity]) => ({ sized: sized[index], quantity }))
    .filter(
      (entry): entry is { sized: Sized; quantity: number } =>
        entry.sized !== undefined,
    )
    .sort((a, b) => b.sized.size - a.sized.size)
    .map(({ sized: { pack }, quantity }) => ({ pack, quantity }));
  return { packs, near: exact === undefined };
}

export function largestFirst(
  sized: readonly Sized[],
  amount: number,
): PackChoice {
  const bySize = [...sized].sort(
    (a, b) => b.size - a.size || a.pack.price - b.pack.price,
  );
  const quantities = new Map<Sized, number>();
  let left = amount;
  for (const option of bySize) {
    const quantity = Math.floor(left / option.size);
    if (quantity === 0) continue;
    quantities.set(option, quantity);
    left -= quantity * option.size;
  }
  const smallestOption = bySize.at(-1);
  if (
    smallestOption !== undefined &&
    left > 0 &&
    (left * 2 >= smallestOption.size || quantities.size === 0)
  ) {
    quantities.set(smallestOption, (quantities.get(smallestOption) ?? 0) + 1);
    left -= smallestOption.size;
  }
  const packs = [...quantities]
    .sort(([a], [b]) => b.size - a.size)
    .map(([{ pack }, quantity]) => ({ pack, quantity }));
  return { packs, near: left !== 0 };
}

function nearestTotal(
  count: Float64Array,
  amount: number,
  step: number,
): number {
  let best = 0;
  for (let total = 1; total < count.length; total += 1) {
    if ((count[total] ?? Infinity) === Infinity) continue;
    const distance = Math.abs(total * step - amount);
    if (best === 0 || distance < Math.abs(best * step - amount)) best = total;
  }
  return best;
}

function packsOfSize(packs: readonly ReadingPack[], asked: Asked): PackChoice {
  const wanted = asked.quantity ?? 1;
  const quantity = Math.max(1, Math.round(wanted));
  const size =
    asked.pack_grams !== null
      ? nearestSize(packs, "grams", asked.pack_grams)
      : asked.pack_pieces !== null
        ? nearestSize(packs, "pieces", asked.pack_pieces)
        : packs.length === 1
          ? { pack: smallest(packs), near: false }
          : { pack: smallest(packs), near: true };
  return capped({
    packs: [{ pack: size.pack, quantity }],
    near: size.near || asked.quantity === null || quantity !== wanted,
  });
}

function nearestSize(
  packs: readonly ReadingPack[],
  measure: Measure,
  wanted: number,
): { pack: ReadingPack; near: boolean } {
  const [nearest] = sizedBy(packs, measure).sort(
    (a, b) =>
      Math.abs(a.size - wanted) - Math.abs(b.size - wanted) || a.size - b.size,
  );
  return nearest === undefined
    ? { pack: smallest(packs), near: true }
    : { pack: nearest.pack, near: nearest.size !== wanted };
}

function capped(choice: PackChoice): PackChoice {
  const over = choice.packs.some(({ quantity }) => quantity > maxPackCount);
  return over
    ? {
        packs: choice.packs.map(({ pack, quantity }) => ({
          pack,
          quantity: Math.min(quantity, maxPackCount),
        })),
        near: true,
      }
    : choice;
}

function sizedBy(packs: readonly ReadingPack[], measure: Measure): Sized[] {
  return packs.flatMap((pack) => {
    const size = pack[measure];
    return size !== null && Number.isInteger(size) && size > 0
      ? [{ pack, size }]
      : [];
  });
}

function smallest(packs: readonly ReadingPack[]): ReadingPack {
  const [first] = [...packs].sort(
    (a, b) =>
      (a.grams ?? a.pieces ?? Infinity) - (b.grams ?? b.pieces ?? Infinity) ||
      a.price - b.price,
  );
  if (first === undefined) {
    throw new Error("An item with no packs has no smallest pack.");
  }
  return first;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
