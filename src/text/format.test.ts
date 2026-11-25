import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoney, formatTimer, formatWeight } from "./format.ts";

test("money is whole rupees with Indian grouping and Latin digits", () => {
  assert.equal(formatMoney(12_500_000), "₹1,25,000");
  assert.equal(formatMoney(45_000), "₹450");
  assert.equal(formatMoney(0), "₹0");
  assert.equal(formatMoney(45_050), "₹451");
});

test("weights under 1 kg are in grams, the rest in kg", () => {
  assert.equal(formatWeight(250), "250 g");
  assert.equal(formatWeight(1000), "1 kg");
  assert.equal(formatWeight(1250), "1.25 kg");
  assert.equal(formatWeight(1005), "1.005 kg");
  assert.equal(formatWeight(25_000), "25 kg");
  assert.equal(formatWeight(1_250_000), "1,250 kg");
});

test("the timer shows minutes and seconds", () => {
  assert.equal(formatTimer(0), "0:00");
  assert.equal(formatTimer(7_400), "0:07");
  assert.equal(formatTimer(65_000), "1:05");
  assert.equal(formatTimer(300_000), "5:00");
  assert.equal(formatTimer(-5), "0:00");
});
