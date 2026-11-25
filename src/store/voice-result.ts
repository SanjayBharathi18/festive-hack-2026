import type { Day } from "../../shared/day.ts";
import type {
  Asked,
  CartReading,
  DraftItem,
  UnmatchedItem,
} from "../../shared/reading.ts";
import { addLines, withDay, type Cart } from "../cart/cart.ts";
import { formatWeight } from "../text/format.ts";
import type { Text } from "../text/text.ts";

// "near" marks a pack that the buyer must check: the nearest packs to the
// amount, or an item that matched a name only nearly.
export type VoiceMark = "heard" | "near";
export type AppliedReading = {
  cart: Cart;
  added: DraftItem[];
  soldOut: DraftItem[];
  unmatched: UnmatchedItem[];
  marks: Map<string, VoiceMark>;
  day: Day | null;
};
export type Segment = { text: string; heard: boolean };

export function applyReading(cart: Cart, reading: CartReading): AppliedReading {
  const added = reading.items.filter((item) => !item.sold_out);
  const marks = new Map<string, VoiceMark>();
  for (const item of added) {
    for (const pack of item.packs) {
      marks.set(pack.pack_id, isNear(item) ? "near" : "heard");
    }
  }
  const filled = addLines(
    cart,
    added.flatMap((item) =>
      item.packs.map(({ pack_id, quantity, price }) => ({
        pack_id,
        quantity,
        price,
      })),
    ),
  );
  return {
    cart: reading.day === null ? filled : withDay(filled, reading.day, "voice"),
    added,
    soldOut: reading.items.filter((item) => item.sold_out),
    unmatched: reading.unmatched,
    marks,
    day: reading.day,
  };
}

export function isNear(item: Pick<DraftItem, "near_amount" | "near_name">) {
  return item.near_amount || item.near_name;
}

// The words that the model used for each item, marked in the transcript.
export function heardSegments(
  transcript: string,
  saids: readonly string[],
): Segment[] {
  const lower = transcript.toLowerCase();
  const sameLength = lower.length === transcript.length;
  const ranges: [number, number][] = [];
  for (const said of saids) {
    const words = said.trim();
    if (words === "") continue;
    let at = transcript.indexOf(words);
    if (at === -1 && sameLength) at = lower.indexOf(words.toLowerCase());
    if (at !== -1) ranges.push([at, at + words.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1])
      last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const segments: Segment[] = [];
  let at = 0;
  for (const [start, end] of merged) {
    if (start > at)
      segments.push({ text: transcript.slice(at, start), heard: false });
    segments.push({ text: transcript.slice(start, end), heard: true });
    at = end;
  }
  if (at < transcript.length) {
    segments.push({ text: transcript.slice(at), heard: false });
  }
  return segments;
}

// The amount as the buyer said it, for "nearest pack to 300 g".
export function askedWords(
  asked: Asked,
  text: Pick<Text, "pieces" | "t">,
): string | null {
  const { quantity, unit, pack_grams, pack_pieces } = asked;
  if (quantity === null) return null;
  switch (unit) {
    case "kg":
      return formatWeight(Math.round(quantity * 1000));
    case "g":
      return formatWeight(Math.round(quantity));
    case "pieces":
      return text.pieces(quantity);
    case "packs": {
      const count = formatCount(quantity);
      if (pack_grams !== null) return `${count} × ${formatWeight(pack_grams)}`;
      if (pack_pieces !== null) return `${count} × ${text.pieces(pack_pieces)}`;
      return text.t("store.voice.packs", { count });
    }
  }
}

const counts = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function formatCount(quantity: number): string {
  return counts.format(quantity);
}
