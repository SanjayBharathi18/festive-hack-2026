import type { LimitUnit } from "../../shared/model.ts";
import type { Asked } from "../../shared/reading.ts";
import { formatWeight } from "../text/format.ts";
import type { Text } from "../text/text.ts";

const kilograms = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const counts = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const askedNumbers = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

export function amountOf(unit: LimitUnit, value: number, text: Text): string {
  if (unit === "kg") return formatWeight(value);
  if (unit === "pieces") return text.pieces(value);
  return ordersOf(value, text);
}

export function ordersOf(count: number, text: Text): string {
  const form = new Intl.PluralRules(`${text.language}-IN`).select(count);
  return text.t(
    form === "one" ? "desk.unit.order_one" : "desk.unit.order_other",
    {
      count: counts.format(count),
    },
  );
}

// "23 / 25 kg" for a kg limit; "9 / 15" for orders or pieces, whose word
// stands under the gauge.
export function readout(unit: LimitUnit, load: number, limit: number): string {
  if (unit === "kg") {
    return `${kilograms.format(load / 1000)} / ${kilograms.format(limit / 1000)} kg`;
  }
  return `${counts.format(load)} / ${counts.format(limit)}`;
}

export function packAmount(quantity: number, label: string): string {
  return quantity === 1 ? label : `${counts.format(quantity)} × ${label}`;
}

export function packsText(
  packs: readonly { label: string; quantity: number }[],
): string {
  return packs
    .map((pack) => `${counts.format(pack.quantity)} × ${pack.label}`)
    .join(" · ");
}

export function madeAmount(
  item: { grams: number | null; pieces: number | null },
  text: Text,
): string {
  const parts = [
    item.grams === null || item.grams === 0
      ? undefined
      : formatWeight(item.grams),
    item.pieces === null || item.pieces === 0
      ? undefined
      : text.pieces(item.pieces),
  ].filter((part) => part !== undefined);
  return parts.join(" + ");
}

export function askedAmount(asked: Asked, text: Text): string {
  if (asked.quantity === null) return "";
  if (asked.unit === "kg") return formatWeight(asked.quantity * 1000);
  if (asked.unit === "g") return formatWeight(asked.quantity);
  if (asked.unit === "pieces") return text.pieces(asked.quantity);
  return askedNumbers.format(asked.quantity);
}
