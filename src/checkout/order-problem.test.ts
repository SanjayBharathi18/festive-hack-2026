import assert from "node:assert/strict";
import { test } from "node:test";
import { createApi } from "../api/api.ts";
import { orderProblem } from "./order-problem.ts";

test("each refusal of the order leads to its next step", async () => {
  const cases = {
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
    rate_limited: "other",
  };
  for (const [code, problem] of Object.entries(cases)) {
    assert.equal(orderProblem(await refusal(code)), problem, code);
  }
});

test("a network failure or a plain error is another problem", async () => {
  const offline = await createApi({ online: () => false })
    .get("/api/x", { safeParse: () => ({ success: true }) } as never)
    .catch((error: unknown) => error);
  assert.equal(orderProblem(offline), "other");
  assert.equal(orderProblem(new Error("x")), "other");
});

async function refusal(code: string): Promise<unknown> {
  const api = createApi({
    fetch: async () =>
      Response.json({ error: { code, message: "x" } }, { status: 409 }),
  });
  return api
    .get("/api/orders", { safeParse: () => ({ success: true }) } as never)
    .catch((error: unknown) => error);
}
