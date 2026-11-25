import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appLanguageSchema,
  sarvamLanguageSchema,
  toAppLanguage,
  toSarvamLanguage,
} from "./languages.ts";

test("app languages are the six languages of the app text", () => {
  assert.deepEqual(appLanguageSchema.options, [
    "en",
    "hi",
    "kn",
    "ta",
    "te",
    "mr",
  ]);
  assert.equal(appLanguageSchema.safeParse("bn").success, false);
});

test("Sarvam codes have the form kn-IN", () => {
  assert.equal(sarvamLanguageSchema.parse("kn-IN"), "kn-IN");
  assert.equal(sarvamLanguageSchema.parse("brx-IN"), "brx-IN");
  assert.equal(sarvamLanguageSchema.safeParse("kn").success, false);
  assert.equal(sarvamLanguageSchema.safeParse("kn-in").success, false);
});

test("app languages and Sarvam codes convert both ways", () => {
  assert.equal(toSarvamLanguage("kn"), "kn-IN");
  assert.equal(toAppLanguage("hi-IN"), "hi");
  assert.equal(toAppLanguage("bn-IN"), undefined);
  assert.equal(toAppLanguage("unknown"), undefined);
});
