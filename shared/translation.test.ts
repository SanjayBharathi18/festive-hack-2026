import assert from "node:assert/strict";
import { test } from "node:test";
import { translationSchema } from "./translation.ts";

test("a translation has a text and an app language", () => {
  const translation = { text: "ಕಡಿಮೆ ಸಿಹಿ", language: "kn" };
  assert.deepEqual(translationSchema.parse(translation), translation);
  assert.equal(
    translationSchema.safeParse({ ...translation, text: "" }).success,
    false,
  );
  assert.equal(
    translationSchema.safeParse({ ...translation, language: "kn-IN" }).success,
    false,
  );
});
