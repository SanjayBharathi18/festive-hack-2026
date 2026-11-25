import type { Day } from "../../shared/day.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import { phoneSchema } from "../../shared/phone.ts";
import { codeSchema } from "../../shared/verify.ts";
import { checkoutLines, type Cart } from "../cart/cart.ts";
import type { Via } from "../cart/links.ts";
import type { OrderInput } from "./checkout-flow.ts";
import type { Draft } from "./checkout-storage.ts";

// The order as the server takes it. The address and the gift go only with a
// delivery; empty optional fields go as nothing.
export function orderBody({
  storeId,
  via,
  day,
  cart,
  draft,
  name,
  language,
}: {
  storeId: string;
  via: Via | undefined;
  day: Day;
  cart: Cart;
  draft: Draft;
  name: string;
  language: AppLanguage;
}): OrderInput {
  const delivery = draft.fulfilment === "delivery";
  return {
    store_id: storeId,
    ...(via === undefined ? {} : { via }),
    day,
    fulfilment: draft.fulfilment ?? "pickup",
    address: delivery ? orNull(draft.address) : null,
    gift:
      delivery && draft.gift
        ? {
            name: draft.gift_name.trim(),
            phone: orNull(draft.gift_phone),
            message: orNull(draft.gift_message),
          }
        : null,
    note: orNull(draft.note),
    buyer_name: name.trim(),
    buyer_language: language,
    cart: checkoutLines(cart),
  };
}

export function isPhone(text: string): boolean {
  return phoneSchema.safeParse(text).success;
}

export function isCode(text: string): boolean {
  return codeSchema.safeParse(text).success;
}

function orNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}
