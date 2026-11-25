import assert from "node:assert/strict";
import { test } from "node:test";
import {
  searchAnswerSchema,
  searchQuerySchema,
  searchSpeechAnswerSchema,
  searchStoreSchema,
} from "./search.ts";

const dish = {
  id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
  name: "ಕಾಜು ಕಟ್ಲಿ",
  name_latin: "Kaju katli",
  veg_mark: "veg",
  sold_out: false,
  pack: { label: "250 g", grams: 250, pieces: null, price: 33000 },
};

const store = {
  slug: "shobhas-kitchen",
  name: "Shobha's Kitchen",
  area: "Basavanagudi",
  city: "Bengaluru",
  categories: ["sweets", "savouries"],
  distance_km: 3,
  rating: { average: 4.6, count: 128 },
  taking_orders: true,
  next_free_day: "2026-11-25",
  dishes: [dish],
  more_dishes: 0,
};

test("a search query takes the words, the filters and a location", () => {
  assert.deepEqual(
    searchQuerySchema.parse({
      q: "  kaju katli ",
      need_by: "2026-11-28",
      veg: "veg",
      category: "sweets",
      sort: "distance",
      lat: "12.97",
      lng: "77.59",
    }),
    {
      q: "kaju katli",
      need_by: "2026-11-28",
      veg: "veg",
      category: "sweets",
      sort: "distance",
      lat: 12.97,
      lng: 77.59,
    },
  );
});

test("empty filters count as absent, and no words is a search for every cook", () => {
  const query = searchQuerySchema.parse({ need_by: "", veg: "", sort: "" });
  assert.equal(query.q, "");
  assert.equal(query.need_by, undefined);
  assert.equal(query.veg, undefined);
  assert.equal(query.sort, undefined);
});

test("a search query refuses a bad day, a half location and long words", () => {
  for (const query of [
    { need_by: "28-11-2026" },
    { lat: "12.97" },
    { lat: "120", lng: "77" },
    { veg: "vegan" },
    { q: "x".repeat(101) },
  ]) {
    assert.equal(searchQuerySchema.safeParse(query).success, false);
  }
});

test("a result is a cook with at least one dish and no location of her own", () => {
  assert.equal(searchStoreSchema.safeParse(store).success, true);
  assert.equal(
    searchStoreSchema.safeParse({ ...store, rating: null }).success,
    true,
  );
  for (const rating of [
    { average: 5.2, count: 3 },
    { average: 4.6, count: 0 },
  ]) {
    assert.equal(
      searchStoreSchema.safeParse({ ...store, rating }).success,
      false,
    );
  }
  assert.equal(
    searchStoreSchema.safeParse({ ...store, dishes: [{ ...dish, pack: null }] })
      .success,
    true,
  );
  assert.equal(
    searchStoreSchema.safeParse({ ...store, dishes: [] }).success,
    false,
  );
  assert.equal(
    "lat" in searchStoreSchema.parse({ ...store, lat: 12.9 }),
    false,
  );
});

test("a search answer and a voice answer have their shapes", () => {
  const answer = {
    today: "2026-11-24",
    query: "ಕಾಜು ಕಟ್ಲಿ",
    latin: "kaju katli",
    match: "trigram",
    need_by: null,
    need_by_met: true,
    sort: "rating",
    located: false,
    city: "bengaluru",
    distance_from: null,
    stores: [store],
    voice: true,
    recorded: true,
  };
  assert.equal(searchAnswerSchema.safeParse(answer).success, true);
  assert.equal(
    searchAnswerSchema.safeParse({ ...answer, match: "fuzzy" }).success,
    false,
  );
  assert.equal(
    searchAnswerSchema.safeParse({
      ...answer,
      sort: "distance",
      distance_from: "centre",
    }).success,
    true,
  );
  assert.equal(
    searchAnswerSchema.safeParse({ ...answer, distance_from: "pin" }).success,
    false,
  );
  assert.equal(
    searchSpeechAnswerSchema.safeParse({
      transcript: "kaju katli",
      language: "en-IN",
      recorded: true,
      placeholder: false,
    }).success,
    true,
  );
  assert.equal(
    searchSpeechAnswerSchema.safeParse({ transcript: 3 }).success,
    false,
  );
});
