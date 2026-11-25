export type PackSpec = {
  label: string;
  grams: number | null;
  pieces: number | null;
  price: number;
};

const fiveRupees = 500;

export function kiloPacks(pricePerKg: number): PackSpec[] {
  return [250, 500, 1000].map((grams) => ({
    label: grams < 1000 ? `${grams} g` : `${grams / 1000} kg`,
    grams,
    pieces: null,
    price: Math.ceil((pricePerKg * grams) / 1000 / fiveRupees) * fiveRupees,
  }));
}

export function piecePacks(
  pricePerPiece: number,
  gramsPerPiece?: number,
): PackSpec[] {
  return [1, 6, 12].map((pieces) => ({
    label: pieces === 1 ? "1 piece" : `${pieces} pieces`,
    grams: gramsPerPiece === undefined ? null : gramsPerPiece * pieces,
    pieces,
    price: pricePerPiece * pieces,
  }));
}
