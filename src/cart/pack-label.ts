import { formatWeight } from "../text/format.ts";
import type { Text } from "../text/text.ts";

export type PackSize = {
  label: string;
  grams: number | null;
  pieces: number | null;
};

// A size that the app can count reads in the buyer's language. Her own label
// is the fallback, for a pack with neither a weight nor a count.
export function packLabel(pack: PackSize, text: Pick<Text, "pieces">): string {
  if (pack.pieces !== null) return text.pieces(pack.pieces);
  if (pack.grams !== null) return formatWeight(pack.grams);
  return pack.label;
}
