import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categorySchema,
  fulfilmentSchema,
  limitUnitSchema,
  orderSourceSchema,
  orderStatusSchema,
  vegMarkSchema,
} from "./model.ts";

const cases = [
  { schema: orderStatusSchema, valid: "awaiting_payment", invalid: "paid" },
  { schema: orderSourceSchema, valid: "marketplace", invalid: "whatsapp" },
  { schema: fulfilmentSchema, valid: "pickup", invalid: "courier" },
  { schema: vegMarkSchema, valid: "non_veg", invalid: "non-veg" },
  { schema: categorySchema, valid: "savouries", invalid: "drinks" },
  { schema: limitUnitSchema, valid: "kg", invalid: "grams" },
];

for (const { schema, valid, invalid } of cases) {
  test(`${schema.options.join(", ")}: accepts ${valid}, rejects ${invalid}`, () => {
    assert.equal(schema.parse(valid), valid);
    assert.equal(schema.safeParse(invalid).success, false);
  });
}
