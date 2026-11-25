import assert from "node:assert/strict";
import { test } from "node:test";
import {
  editDistance,
  itemNames,
  keyterms,
  matchItem,
  maxKeyterms,
  menuNameSeparator,
  nameForms,
  normalizeName,
  type ReadingItem,
} from "./menu.ts";
import { heroMenu, menu } from "./test-menu.ts";

test("keyterms are the item names in their script and in Latin, with the name in brackets apart", () => {
  const terms = keyterms(menu);
  assert.deepEqual(terms.slice(0, 2), ["ಮೈಸೂರು ಪಾಕ್", "Mysore pak"]);
  for (const term of [
    "ಕೊಬ್ಬರಿ ಮಿಠಾಯಿ",
    "Kobbari mithai",
    "coconut burfi",
    "Chakkuli",
    "chakli",
  ]) {
    assert.ok(terms.includes(term), term);
  }
  assert.equal(
    terms.some((term) => term.includes("(")),
    false,
  );
});

test("keyterms are 50 at most, each 64 characters at most, with no repeats", () => {
  const big: ReadingItem[] = Array.from({ length: 40 }, (_, index) => ({
    id: `item-${index}`,
    name: `ಸಿಹಿ ${index}`,
    name_latin: index === 0 ? "x".repeat(65) : `Sweet ${index}`,
    sold_out: false,
    packs: [],
  }));
  big.push({ ...big[1]!, id: "repeat" });
  const terms = keyterms(big);
  assert.equal(terms.length, maxKeyterms);
  assert.ok(terms.every((term) => term.length <= 64));
  assert.equal(
    new Set(terms.map((term) => term.toLowerCase())).size,
    terms.length,
  );
});

test("sold-out items come last in the keyterms", () => {
  const terms = keyterms([
    { ...heroMenu.mysorePak, sold_out: true },
    heroMenu.kajuKatli,
  ]);
  assert.deepEqual(terms, [
    "ಕಾಜು ಕಟ್ಲಿ",
    "Kaju katli",
    "ಮೈಸೂರು ಪಾಕ್",
    "Mysore pak",
  ]);
});

test("a name with a name in brackets has both forms", () => {
  assert.deepEqual(nameForms("Kobbari mithai (coconut burfi)"), [
    "Kobbari mithai",
    "coconut burfi",
  ]);
  assert.deepEqual(nameForms("Kodubale"), ["Kodubale"]);
  assert.deepEqual(itemNames(heroMenu.chakkuli), [
    "ಚಕ್ಕುಲಿ",
    "Chakkuli (chakli)",
    "Chakkuli",
    "chakli",
  ]);
});

test("names are compared in lower case, with no spaces or marks, and one vowel for a doubled vowel", () => {
  assert.equal(normalizeName("Kaju  Katli!"), "kajukatli");
  assert.equal(normalizeName("Besan Laddoo"), normalizeName("besan laddo"));
  assert.equal(normalizeName("ಕಾಜು ಕಟ್ಲಿ"), "ಕಾಜುಕಟ್ಲಿ");
  assert.equal(editDistance("chakli", "chakkuli"), 2);
});

test("a menu name in either script, or in brackets, is an exact match", () => {
  for (const name of [
    "ಮೈಸೂರು ಪಾಕ್",
    "mysore pak",
    "Kobbari mithai",
    "coconut burfi",
    "Kobbari mithai (coconut burfi)",
  ]) {
    const match = matchItem(menu, [name, "anything"]);
    assert.ok(match, name);
    assert.equal(match.near, false, name);
  }
  assert.equal(matchItem(menu, ["ಮೈಸೂರು ಪಾಕ್"])?.item, heroMenu.mysorePak);
});

test("a menu name copied with all its names, as the prompt lists them, is an exact match", () => {
  for (const item of menu.filter(({ name_latin }) => name_latin !== null)) {
    const copied = [item.name, item.name_latin].join(menuNameSeparator);
    assert.deepEqual(
      matchItem(menu, [copied, `1 kg ${item.name}`]),
      { item, near: false },
      copied,
    );
  }
});

test("a name that is close to a menu name is a near match", () => {
  const cases: [string, ReadingItem][] = [
    ["chakkli", heroMenu.chakkuli],
    ["Kaju Kathli", heroMenu.kajuKatli],
    ["Mysur pak", heroMenu.mysorePak],
    ["Nipattu", heroMenu.nippattu],
  ];
  for (const [name, item] of cases) {
    assert.deepEqual(matchItem(menu, [name]), { item, near: true }, name);
  }
});

test("the words of the buyer can name the item, as a near match", () => {
  assert.deepEqual(
    matchItem(menu, [null, "two Diwali assorted boxes, one kilo each"]),
    {
      item: heroMenu.diwaliBox,
      near: true,
    },
  );
  assert.deepEqual(matchItem(menu, [null, "ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ ಬೇಕು"]), {
    item: heroMenu.chakkuli,
    near: true,
  });
});

test("an item that is not on the menu has no match", () => {
  assert.equal(
    matchItem(menu, ["Gulab jamun", "two kilo gulab jamun"]),
    undefined,
  );
  assert.equal(matchItem(menu, [null, "the"]), undefined);
  assert.equal(matchItem(menu, []), undefined);
});
