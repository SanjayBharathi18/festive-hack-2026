import type { SetupPack } from "../../shared/setup.ts";
import { formatWeight } from "../text/format.ts";

export type PriceUnit = "kg" | "piece";
export type PackUnit = "g" | "kg" | "pieces";
export type PackRow = { amount: number; unit: PackUnit; rupees: number };

const packUnits: readonly string[] = ["g", "kg", "pieces"];
const fiveRupees = 500;

// From one price, the packs that most home cooks sell: 250 g, 500 g and
// 1 kg, or 1, 6 and 12 pieces. A weight rounds up to the next ₹5, so ₹400 a
// kg gives ₹100, ₹200 and ₹400.
export function suggestPacks(rupees: number, per: PriceUnit): PackRow[] {
  if (!Number.isFinite(rupees) || rupees <= 0) return [];
  const paise = Math.round(rupees * 100);
  if (per === "piece") {
    return [1, 6, 12].map((pieces) => ({
      amount: pieces,
      unit: "pieces",
      rupees: (paise * pieces) / 100,
    }));
  }
  return [
    { grams: 250, row: { amount: 250, unit: "g" } },
    { grams: 500, row: { amount: 500, unit: "g" } },
    { grams: 1000, row: { amount: 1, unit: "kg" } },
  ].map(({ grams, row }) => ({
    amount: row.amount,
    unit: row.unit as PackUnit,
    rupees: (Math.ceil((paise * grams) / 1000 / fiveRupees) * fiveRupees) / 100,
  }));
}

export function packOfRow(row: PackRow, id: string): SetupPack | undefined {
  if (!Number.isFinite(row.amount) || !Number.isFinite(row.rupees)) {
    return undefined;
  }
  const price = Math.round(row.rupees * 100);
  if (row.unit === "pieces") {
    const pieces = Math.round(row.amount);
    if (pieces < 1) return undefined;
    const label = pieces === 1 ? "1 piece" : `${pieces} pieces`;
    return { id, label, grams: null, pieces, price };
  }
  const grams = Math.round(row.unit === "kg" ? row.amount * 1000 : row.amount);
  if (grams < 1) return undefined;
  return { id, label: formatWeight(grams), grams, pieces: null, price };
}

export function rowOfPack(pack: SetupPack): PackRow {
  const rupees = pack.price / 100;
  if (pack.pieces !== null) {
    return { amount: pack.pieces, unit: "pieces", rupees };
  }
  const grams = pack.grams ?? 0;
  return grams >= 1000 && grams % 100 === 0
    ? { amount: grams / 1000, unit: "kg", rupees }
    : { amount: grams, unit: "g", rupees };
}

export function isPackUnit(value: string): value is PackUnit {
  return packUnits.includes(value);
}
