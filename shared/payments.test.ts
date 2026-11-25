import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mockResultSchema,
  paymentHoldMs,
  paymentStartAnswerSchema,
} from "./payments.ts";

test("an unpaid required order holds its space for 15 minutes", () => {
  assert.equal(paymentHoldMs, 900_000);
});

test("the prototype payment has two results: pay and fail", () => {
  assert.deepEqual(mockResultSchema.options, ["pay", "fail"]);
  assert.equal(mockResultSchema.safeParse("refund").success, false);
});

test("a started payment names the screen of the provider on this site", () => {
  assert.equal(
    paymentStartAnswerSchema.safeParse({
      paid: false,
      amount: 88000,
      pay_url: "/pay/abcdefghijklmnopqrstuvwx",
    }).success,
    true,
  );
  assert.equal(
    paymentStartAnswerSchema.safeParse({
      paid: true,
      amount: 88000,
      pay_url: null,
    }).success,
    true,
  );
  assert.equal(
    paymentStartAnswerSchema.safeParse({
      paid: false,
      amount: 88000,
      pay_url: "https://evil.example/pay",
    }).success,
    false,
  );
});
