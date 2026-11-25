import assert from "node:assert/strict";
import { test } from "node:test";
import { scriptOf, scriptOfLanguage } from "./scripts.ts";

test("scriptOf names the script of the first letter", () => {
  assert.equal(scriptOf("ಮೈಸೂರು ಪಾಕ್"), "kannada");
  assert.equal(scriptOf("मैसूर पाक"), "devanagari");
  assert.equal(scriptOf("மைசூர் பாக்"), "tamil");
  assert.equal(scriptOf("మైసూర్ పాక్"), "telugu");
  assert.equal(scriptOf("250 g Mysore pak"), "latin");
  assert.equal(scriptOf("250 ₹"), undefined);
});

test("Hindi and Marathi share Devanagari", () => {
  assert.equal(scriptOfLanguage.hi, scriptOfLanguage.mr);
  assert.notEqual(scriptOfLanguage.kn, scriptOfLanguage.te);
});
