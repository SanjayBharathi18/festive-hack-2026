import assert from "node:assert/strict";
import { test } from "node:test";
import { phoneSchema } from "./phone.ts";

test("an Indian mobile number in any common form becomes E.164", () => {
  for (const input of [
    "9876543210",
    "98765 43210",
    "098765-43210",
    "+91 98765 43210",
    "919876543210",
    "0091 (98765) 43210",
  ]) {
    assert.equal(phoneSchema.parse(input), "+919876543210", input);
  }
});

test("a number of another country needs its country code", () => {
  assert.equal(phoneSchema.parse("+44 7700 900123"), "+447700900123");
  assert.equal(phoneSchema.parse("0044 7700 900123"), "+447700900123");
  assert.equal(phoneSchema.safeParse("020 7946 0018").success, false);
});

test("a number that WhatsApp cannot reach is refused", () => {
  for (const input of [
    "",
    "12345",
    "+91 12345 67890",
    "+91 98765 4321",
    "+9198765432100",
    "98765 4321x",
    "+0 98765 43210",
  ]) {
    assert.equal(phoneSchema.safeParse(input).success, false, input);
  }
});

test("the made-up numbers of the demo data are accepted, because codes are simulated in this build", () => {
  assert.equal(phoneSchema.parse("+91 00000 00002"), "+910000000002");
  assert.equal(phoneSchema.parse("00000 00002"), "+910000000002");
  assert.equal(phoneSchema.safeParse("+91 00000 0002").success, false);
  assert.equal(phoneSchema.safeParse("+91 00001 00002").success, false);
});
