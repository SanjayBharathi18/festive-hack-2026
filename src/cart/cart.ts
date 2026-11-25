import type { Day } from "../../shared/day.ts";
import type { CheckoutLine } from "../../shared/orders.ts";
import type {
  CartLine as DayCheckLine,
  MenuItem,
  MenuSection,
  Pack,
} from "../../shared/store.ts";

export const maxQuantity = 999;
export const maxLines = 100;

export type DayPick = "buyer" | "voice";
export type Line = { pack_id: string; quantity: number; price: number };
export type Cart = {
  readonly lines: readonly Line[];
  readonly day: Day | null;
  readonly picked_by: DayPick | null;
};
export type MenuPack = { item: MenuItem; pack: Pack };
export type CartChange =
  | { kind: "sold_out"; item: MenuItem; pack: Pack }
  | { kind: "gone"; pack_id: string }
  | { kind: "price"; item: MenuItem; pack: Pack; before: number };

export const emptyCart: Cart = { lines: [], day: null, picked_by: null };

export function quantityOf(cart: Cart, packId: string): number {
  return cart.lines.find((line) => line.pack_id === packId)?.quantity ?? 0;
}

export function setQuantity(
  cart: Cart,
  pack: Pick<Pack, "id" | "price">,
  quantity: number,
): Cart {
  const next = clampQuantity(quantity);
  const index = cart.lines.findIndex((line) => line.pack_id === pack.id);
  if (next === 0) {
    return index === -1
      ? cart
      : { ...cart, lines: cart.lines.filter((_, at) => at !== index) };
  }
  const line = { pack_id: pack.id, quantity: next, price: pack.price };
  if (index === -1) {
    return cart.lines.length >= maxLines
      ? cart
      : { ...cart, lines: [...cart.lines, line] };
  }
  return {
    ...cart,
    lines: cart.lines.map((old, at) => (at === index ? line : old)),
  };
}

export function addLines(cart: Cart, lines: readonly Line[]): Cart {
  return lines.reduce(
    (next, line) =>
      setQuantity(
        next,
        { id: line.pack_id, price: line.price },
        quantityOf(next, line.pack_id) + line.quantity,
      ),
    cart,
  );
}

export function withDay(cart: Cart, day: Day | null, by: DayPick | null): Cart {
  return { ...cart, day, picked_by: day === null ? null : by };
}

export function cartCount(cart: Cart): number {
  return cart.lines.reduce((count, line) => count + line.quantity, 0);
}

export function cartTotal(cart: Cart): number {
  return cart.lines.reduce(
    (total, line) => total + line.quantity * line.price,
    0,
  );
}

export function dayCheckLines(cart: Cart): DayCheckLine[] {
  return cart.lines.map(({ pack_id, quantity }) => ({ pack_id, quantity }));
}

export function checkoutLines(cart: Cart): CheckoutLine[] {
  return cart.lines.map(({ pack_id, quantity, price }) => ({
    pack_id,
    quantity,
    price,
  }));
}

export function menuPacks(
  sections: readonly MenuSection[],
): Map<string, MenuPack> {
  return new Map(
    sections.flatMap(({ items }) =>
      items.flatMap((item) =>
        item.packs.map((pack) => [pack.id, { item, pack }] as const),
      ),
    ),
  );
}

// The cart that the buyer kept on the phone meets the menu of today: a pack
// that is gone or sold out leaves the cart, and a new price replaces the old.
export function reconcile(
  cart: Cart,
  packs: ReadonlyMap<string, MenuPack>,
): { cart: Cart; changes: CartChange[] } {
  const changes: CartChange[] = [];
  const lines: Line[] = [];
  for (const line of cart.lines) {
    const found = packs.get(line.pack_id);
    if (found === undefined) {
      changes.push({ kind: "gone", pack_id: line.pack_id });
    } else if (found.item.sold_out) {
      changes.push({ kind: "sold_out", ...found });
    } else {
      if (found.pack.price !== line.price) {
        changes.push({ kind: "price", ...found, before: line.price });
      }
      lines.push({ ...line, price: found.pack.price });
    }
  }
  return { cart: changes.length === 0 ? cart : { ...cart, lines }, changes };
}

function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 0;
  return Math.min(maxQuantity, Math.max(0, Math.trunc(quantity)));
}
