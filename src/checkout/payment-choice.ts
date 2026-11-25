import type { PublicStore } from "../../shared/store.ts";
import type { Via } from "../cart/links.ts";

export type PaymentChoice = "none" | "optional" | "required";
export type PaymentPick = "now" | "later";

// A store that takes online payments lets the buyer pay now, later or in
// cash. It asks a buyer from the marketplace to pay first only when she
// asks strangers to pay online (docs/concept.md, "Order food: checkout").
export function paymentChoice(
  store: Pick<PublicStore, "accepts_online" | "advance_for_strangers">,
  via: Via | undefined,
): PaymentChoice {
  if (!store.accepts_online) return "none";
  return via === "market" && store.advance_for_strangers
    ? "required"
    : "optional";
}

export function paysNow(
  choice: PaymentChoice,
  pick: PaymentPick | null,
): boolean {
  return choice === "required" || (choice === "optional" && pick === "now");
}
