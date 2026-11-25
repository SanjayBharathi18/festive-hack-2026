import assert from "node:assert/strict";
import { test } from "node:test";
import {
  citiesAnswerSchema,
  cityCentre,
  cityChoices,
  cityKey,
  cityQuerySchema,
  sameCity,
} from "./cities.ts";

test("a city matches in each script of the app and by its older name", () => {
  assert.equal(sameCity("पुणे", "Pune"), true);
  assert.equal(sameCity("ಬೆಂಗಳೂರು", " bangalore "), true);
  assert.equal(sameCity("Bengaluru", "బెంగళూరు"), true);
  assert.equal(sameCity("बेंगळुरू", "Bengaluru"), true);
  assert.equal(sameCity("சென்னை", "Madras"), true);
  assert.equal(sameCity("नई दिल्ली", "Delhi"), true);
  assert.equal(sameCity("म्हैसूर", "Mysore"), true);
  assert.equal(sameCity("Pune", "Mumbai"), false);
});

test("another city matches by its words, in any case and spacing", () => {
  assert.equal(sameCity("Udupi", "  UDUPI"), true);
  assert.equal(sameCity("Navi  Mumbai", "navi mumbai"), true);
  assert.equal(sameCity("Navi Mumbai", "Mumbai"), false);
  assert.equal(cityKey("ಉಡುಪಿ"), "ಉಡುಪಿ");
  assert.equal(cityKey("Bombay"), "mumbai");
});

test("a city of the table has a centre by any of its names; another has none", () => {
  assert.deepEqual(cityCentre("mumbai"), { lat: 19.076, lng: 72.8777 });
  assert.deepEqual(cityCentre("मुंबई"), cityCentre("Bombay"));
  assert.equal(cityCentre("Udupi"), null);
});

test("the city list has each city of the stores once, with its labels and centre", () => {
  const choices = cityChoices([
    "Pune",
    "Bengaluru",
    "पुणे",
    "Bangalore",
    "  Navi   Mumbai ",
    "",
  ]);
  assert.deepEqual(
    choices.map(({ key }) => key),
    ["bengaluru", "navi mumbai", "pune"],
  );
  const [bengaluru, other] = choices;
  assert.equal(bengaluru?.labels.kn, "ಬೆಂಗಳೂರು");
  assert.equal(bengaluru?.labels.mr, "बेंगळुरू");
  assert.deepEqual(bengaluru?.centre, { lat: 12.9716, lng: 77.5946 });
  assert.equal(other?.labels.en, "Navi Mumbai");
  assert.equal(other?.labels.ta, "Navi Mumbai");
  assert.equal(other?.centre, null);
  assert.ok(citiesAnswerSchema.safeParse({ cities: choices }).success);
});

test("each city of the table gives a valid choice in all six languages", () => {
  const all = cityChoices([
    "Bengaluru",
    "Mysuru",
    "Mangaluru",
    "Hubballi",
    "Mumbai",
    "Pune",
    "Nagpur",
    "Nashik",
    "Delhi",
    "Chennai",
    "Coimbatore",
    "Madurai",
    "Hyderabad",
    "Visakhapatnam",
    "Vijayawada",
    "Kolkata",
    "Ahmedabad",
  ]);
  assert.equal(all.length, 17);
  for (const choice of all) {
    assert.notEqual(choice.centre, null, choice.key);
    for (const label of Object.values(choice.labels)) {
      assert.equal(cityKey(label), choice.key, label);
    }
  }
  assert.ok(citiesAnswerSchema.safeParse({ cities: all }).success);
});

test("the city of a query is optional, and at most 60 characters", () => {
  assert.equal(cityQuerySchema.parse({}).city, undefined);
  assert.equal(cityQuerySchema.parse({ city: "" }).city, undefined);
  assert.equal(cityQuerySchema.parse({ city: " mumbai " }).city, "mumbai");
  assert.equal(
    cityQuerySchema.safeParse({ city: "x".repeat(61) }).success,
    false,
  );
});
