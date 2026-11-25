import { isApiError } from "../api/api.ts";

// What the page does next for each refusal of the order.
export type OrderProblem =
  "day" | "cart" | "ways" | "code" | "new_code" | "store" | "other";

const problems: Readonly<Record<string, OrderProblem>> = {
  day_full: "day",
  day_closed: "day",
  day_past: "day",
  day_too_far: "day",
  price_changed: "cart",
  item_sold_out: "cart",
  item_unavailable: "cart",
  fulfilment_unavailable: "ways",
  code_wrong: "code",
  code_expired: "new_code",
  code_used: "new_code",
  code_tries_used: "new_code",
  proof_invalid: "new_code",
  store_not_taking_orders: "store",
  not_found: "store",
};

export function orderProblem(error: unknown): OrderProblem {
  return isApiError(error) ? (problems[error.code] ?? "other") : "other";
}
