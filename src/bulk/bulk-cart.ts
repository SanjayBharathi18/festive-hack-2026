import type { BulkItem, ListedStore } from "../../shared/bulk.ts";

export type BulkLine = { item: BulkItem; quantity: number };

export type StoreCart = {
  readonly store: Pick<ListedStore, "id" | "name">;
  readonly lines: readonly BulkLine[];
  readonly short: readonly BulkLine[];
  readonly estimate: number | null;
};

export type BulkCartState = {
  readonly carts: readonly StoreCart[];
};

export type BulkCart = {
  readonly state: BulkCartState;
  set(
    store: Pick<ListedStore, "id" | "name">,
    item: BulkItem,
    quantity: number,
  ): void;
  quantity(storeId: string, itemId: string): number | undefined;
  clear(storeId: string): void;
};

// One bulk cart for each store, as each store gets its own request. Each
// cart with a line shows, in the order the buyer started them. A quantity
// under the minimum stays in the cart, marked short, until the buyer raises
// it.
export function createBulkCart(
  onChange: (state: BulkCartState) => void,
): BulkCart {
  const carts = new Map<string, Map<string, BulkLine>>();
  const stores = new Map<string, Pick<ListedStore, "id" | "name">>();

  const state = (): BulkCartState => ({
    carts: [...carts].flatMap(([id, cart]) => {
      const store = stores.get(id);
      const lines = [...cart.values()];
      return store === undefined || lines.length === 0
        ? []
        : [
            {
              store,
              lines,
              short: shortLines(lines),
              estimate: bulkEstimate(lines),
            },
          ];
    }),
  });

  return {
    get state() {
      return state();
    },
    set(store, item, quantity) {
      const cart = carts.get(store.id) ?? new Map<string, BulkLine>();
      if (Number.isInteger(quantity) && quantity > 0) {
        cart.set(item.id, { item, quantity });
      } else {
        cart.delete(item.id);
      }
      if (cart.size > 0) carts.set(store.id, cart);
      else carts.delete(store.id);
      stores.set(store.id, store);
      onChange(state());
    },
    quantity: (storeId, itemId) => carts.get(storeId)?.get(itemId)?.quantity,
    clear(storeId) {
      carts.delete(storeId);
      onChange(state());
    },
  };
}

export function shortLines(lines: readonly BulkLine[]): BulkLine[] {
  return lines.filter(({ item, quantity }) => underMinimum(quantity, item));
}

// A quantity that the buyer typed and that is under the minimum: the cart
// marks it short, and the field plays limit when she leaves it.
export function underMinimum(
  quantity: number,
  item: Pick<BulkItem, "min_qty">,
): boolean {
  return Number.isFinite(quantity) && quantity > 0 && quantity < item.min_qty;
}

// The sum of the priced lines, or null when a price is on request.
export function bulkEstimate(lines: readonly BulkLine[]): number | null {
  if (lines.length === 0) return 0;
  let total = 0;
  for (const { item, quantity } of lines) {
    if (item.price === null) return null;
    total += item.price * quantity;
  }
  return total;
}

// The stores whose bulk items or names match the search, with only the
// matching items unless the store name matches.
export function searchBulk<
  T extends {
    store: { name: string; area: string | null };
    items: readonly BulkItem[];
  },
>(stores: readonly T[], query: string): T[] {
  const words = normal(query)
    .split(" ")
    .filter((word) => word !== "");
  if (words.length === 0) return [...stores];
  const matches = (text: string) =>
    words.every((word) => normal(text).includes(word));
  return stores.flatMap((entry) => {
    if (matches(`${entry.store.name} ${entry.store.area ?? ""}`))
      return [entry];
    const items = entry.items.filter((item) =>
      matches(
        `${item.name} ${item.name_latin ?? ""} ${item.name_script ?? ""}`,
      ),
    );
    return items.length === 0 ? [] : [{ ...entry, items }];
  });
}

function normal(text: string): string {
  return text.toLocaleLowerCase("en-IN").replace(/\s+/g, " ").trim();
}
