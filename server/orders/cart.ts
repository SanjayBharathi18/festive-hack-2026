import type { OrderLine } from "../../shared/orders.ts";
import type { MenuItem } from "../../shared/store.ts";

export type Offer = Omit<OrderLine, "quantity"> & { sold_out: boolean };
export type Offers = ReadonlyMap<string, Offer>;

export type CartRequest = {
  pack_id: string;
  quantity: number;
  price?: number;
};

export type CartProblem =
  | { kind: "unavailable" }
  | { kind: "sold_out"; name: string }
  | { kind: "price_changed"; name: string };

export type PricedCart =
  | { ok: true; lines: OrderLine[]; total: number }
  | { ok: false; problem: CartProblem };

export function priceCart(
  offers: Offers,
  cart: readonly CartRequest[],
  {
    checkPrices,
    allowSoldOut,
  }: { checkPrices: boolean; allowSoldOut: boolean },
): PricedCart {
  const lines: OrderLine[] = [];
  for (const { pack_id, quantity, price } of cart) {
    const offer = offers.get(pack_id);
    if (offer === undefined)
      return { ok: false, problem: { kind: "unavailable" } };
    if (offer.sold_out && !allowSoldOut) {
      return { ok: false, problem: { kind: "sold_out", name: offer.name } };
    }
    if (checkPrices && price !== offer.price) {
      return {
        ok: false,
        problem: { kind: "price_changed", name: offer.name },
      };
    }
    const { sold_out: _, ...line } = offer;
    lines.push({ ...line, quantity });
  }
  return { ok: true, lines, total: orderTotal(lines) };
}

export function menuOffers(menu: readonly MenuItem[]): Map<string, Offer> {
  return new Map(
    menu.flatMap((item) =>
      item.packs.map((pack): [string, Offer] => [
        pack.id,
        {
          item_id: item.id,
          pack_id: pack.id,
          name: item.name,
          label: pack.label,
          price: pack.price,
          grams: pack.grams,
          pieces: pack.pieces,
          sold_out: item.sold_out,
        },
      ]),
    ),
  );
}

export function keptOffers(
  menu: readonly MenuItem[],
  lines: readonly OrderLine[],
): Map<string, Offer> {
  const offers = menuOffers(menu);
  for (const { quantity: _, ...line } of lines) {
    if (line.pack_id !== null) {
      offers.set(line.pack_id, { ...line, sold_out: false });
    }
  }
  return offers;
}

export function orderTotal(
  lines: readonly { price: number; quantity: number }[],
): number {
  return lines.reduce((total, line) => total + line.price * line.quantity, 0);
}
