import assert from "node:assert/strict";
import { test } from "node:test";
import { itemName, nameFor, scriptOf } from "./item-name.ts";

test("her name and the Latin form show side by side", () => {
  assert.deepEqual(itemName("ಮೈಸೂರು ಪಾಕ್", "Mysore pak"), {
    name: "ಮೈಸೂರು ಪಾಕ್",
    lang: "kn",
    latin: "Mysore pak",
  });
});

test("a Latin form that repeats the name shows once", () => {
  assert.equal(itemName("Kulkuls", "Kulkuls").latin, null);
  assert.equal(itemName("Plum cake", " plum cake ").latin, null);
  assert.equal(itemName("ಚಕ್ಕುಲಿ", null).latin, null);
  assert.equal(itemName("ಚಕ್ಕುಲಿ", "  ").latin, null);
});

test("the script of a name gives its language", () => {
  assert.equal(scriptOf("काजू कतली"), "hi");
  assert.equal(scriptOf("முறுக்கு"), "ta");
  assert.equal(scriptOf("కజ్జికాయలు"), "te");
  assert.equal(scriptOf("2 Kaju katli"), "en");
  assert.equal(scriptOf("123"), undefined);
});

test("a sentence names the item in the reader's script when it can", () => {
  const mysorePak = itemName("ಮೈಸೂರು ಪಾಕ್", "Mysore pak");
  assert.equal(nameFor(mysorePak, "kn"), "ಮೈಸೂರು ಪಾಕ್");
  assert.equal(nameFor(mysorePak, "hi"), "Mysore pak");
  assert.equal(nameFor(itemName("ಚಕ್ಕುಲಿ", null), "en"), "ಚಕ್ಕುಲಿ");
  assert.equal(nameFor(itemName("काजू कतली", "Kaju katli"), "mr"), "काजू कतली");
});
