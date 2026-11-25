import assert from "node:assert/strict";
import { test } from "node:test";
import { failedLine, payState } from "./pay-state.ts";

const online = { online: true, refunded: false, pay_by: null };

test("an open unpaid order can be paid, with its deadline when the payment is required", () => {
  assert.deepEqual(
    payState({ status: "new", paid: false, payment: online }, 0),
    {
      kind: "payable",
      payBy: null,
    },
  );
  assert.deepEqual(
    payState(
      {
        status: "awaiting_payment",
        paid: false,
        payment: { ...online, pay_by: 900 },
      },
      899,
    ),
    { kind: "payable", payBy: 900 },
  );
});

test("a paid, cancelled, expired or offline order cannot be paid here", () => {
  assert.deepEqual(
    payState({ status: "new", paid: true, payment: online }, 0),
    {
      kind: "paid",
    },
  );
  assert.deepEqual(
    payState({ status: "cancelled", paid: false, payment: online }, 0),
    { kind: "cancelled" },
  );
  assert.deepEqual(
    payState({ status: "expired", paid: false, payment: online }, 0),
    {
      kind: "expired",
    },
  );
  assert.deepEqual(
    payState(
      {
        status: "awaiting_payment",
        paid: false,
        payment: { ...online, pay_by: 900 },
      },
      900,
    ),
    { kind: "expired" },
  );
  assert.deepEqual(
    payState(
      { status: "new", paid: false, payment: { ...online, online: false } },
      0,
    ),
    { kind: "offline" },
  );
});

test("a failed payment says whether the order is placed", () => {
  assert.equal(failedLine({ status: "awaiting_payment" }), "failed_waiting");
  assert.equal(failedLine({ status: "new" }), "failed_placed");
});
