import { z } from "zod";
import { daySchema } from "../../shared/day.ts";
import { paiseSchema } from "../../shared/money.ts";
import { emptyCart, maxLines, maxQuantity, type Cart } from "./cart.ts";

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type CartStorage = {
  load(slug: string): Cart;
  save(slug: string, cart: Cart): void;
  clear(slug: string): void;
};

const storedCartSchema = z.object({
  v: z.literal(1),
  lines: z
    .array(
      z.object({
        pack_id: z.uuid(),
        quantity: z.int().min(1).max(maxQuantity),
        price: paiseSchema,
      }),
    )
    .max(maxLines)
    .refine(
      (lines) =>
        new Set(lines.map((line) => line.pack_id)).size === lines.length,
    ),
  day: daySchema.nullable(),
  picked_by: z.enum(["buyer", "voice"]).nullable(),
});

// Each store has its own cart, because items from two cooks make two orders.
export function createCartStorage(
  store: KeyValueStore | undefined,
  report: (message: string, error: unknown) => void = console.error,
): CartStorage {
  const key = (slug: string) => `cart:${slug}`;
  return {
    load(slug) {
      let text: string | null = null;
      try {
        text = store?.getItem(key(slug)) ?? null;
      } catch (error) {
        report("The saved cart could not be read.", error);
      }
      if (text === null) return emptyCart;
      const parsed = storedCartSchema.safeParse(parseJson(text));
      if (!parsed.success) return emptyCart;
      const { lines, day, picked_by } = parsed.data;
      return { lines, day, picked_by: day === null ? null : picked_by };
    },
    save(slug, cart) {
      try {
        if (cart.lines.length === 0 && cart.day === null) {
          store?.removeItem(key(slug));
        } else {
          store?.setItem(key(slug), JSON.stringify({ v: 1, ...cart }));
        }
      } catch (error) {
        report("The cart could not be saved on this phone.", error);
      }
    },
    clear(slug) {
      try {
        store?.removeItem(key(slug));
      } catch (error) {
        report("The saved cart could not be cleared.", error);
      }
    },
  };
}

// Reading localStorage throws when the browser blocks storage for the page.
export function storageOf(
  open: () => KeyValueStore,
): KeyValueStore | undefined {
  try {
    return open();
  } catch {
    return undefined;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
