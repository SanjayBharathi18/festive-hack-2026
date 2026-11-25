import assert from "node:assert/strict";
import { test } from "node:test";
import { errorBodySchema } from "./errors.ts";

test("an error body has a known code and a message", () => {
  const body = {
    error: { code: "rate_limited", message: "Try again in 60 seconds." },
  };
  assert.deepEqual(errorBodySchema.parse(body), body);
  assert.equal(
    errorBodySchema.safeParse({ error: { code: "oops", message: "x" } })
      .success,
    false,
  );
});
