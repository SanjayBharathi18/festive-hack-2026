import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codeSchema,
  verifyCheckAnswerSchema,
  verifyCheckBodySchema,
  verifyStartAnswerSchema,
  verifyStartBodySchema,
} from "./verify.ts";

test("a start body has a WhatsApp number and a purpose", () => {
  assert.deepEqual(
    verifyStartBodySchema.parse({ phone: "98765 43210", purpose: "desk" }),
    { phone: "+919876543210", purpose: "desk" },
  );
  assert.equal(
    verifyStartBodySchema.safeParse({ phone: "98765 43210", purpose: "login" })
      .success,
    false,
  );
});

test("a code has 6 digits, and spaces do not matter", () => {
  assert.equal(codeSchema.parse("482 913"), "482913");
  assert.equal(codeSchema.safeParse("48291").success, false);
  assert.equal(codeSchema.safeParse("48291a").success, false);
});

test("a check body has the number, the purpose and the code", () => {
  assert.deepEqual(
    verifyCheckBodySchema.parse({
      phone: "+919876543210",
      purpose: "order",
      code: "482913",
    }),
    { phone: "+919876543210", purpose: "order", code: "482913" },
  );
  assert.equal(
    verifyCheckBodySchema.safeParse({ phone: "+919876543210", code: "482913" })
      .success,
    false,
  );
});

test("a start answer marks the code as prototype", () => {
  const answer = { prototype: true, code: "482913", expires_at: 1 };
  assert.deepEqual(verifyStartAnswerSchema.parse(answer), answer);
  assert.equal(
    verifyStartAnswerSchema.safeParse({ ...answer, prototype: false }).success,
    false,
  );
});

test("a check answer gives a proof for an order, or the store for the desk", () => {
  const order = { purpose: "order", proof: "p".repeat(43), expires_at: 1 };
  const desk = {
    purpose: "desk",
    store: { slug: "shobhas-kitchen", name: "Shobha's Kitchen" },
  };
  assert.deepEqual(verifyCheckAnswerSchema.parse(order), order);
  assert.deepEqual(verifyCheckAnswerSchema.parse(desk), desk);
  assert.equal(
    verifyCheckAnswerSchema.safeParse({ purpose: "order", proof: "short" })
      .success,
    false,
  );
});
