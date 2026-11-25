import assert from "node:assert/strict";
import { test } from "node:test";
import type { SearchStore } from "../../shared/search.ts";
import { sortNote } from "./sort-note.ts";

const store = (fields: Partial<SearchStore> = {}): SearchStore => ({
  slug: "shobhas-kitchen",
  name: "Shobha's Kitchen",
  area: "Basavanagudi",
  city: "Bengaluru",
  categories: ["sweets"],
  distance_km: null,
  rating: null,
  taking_orders: true,
  next_free_day: "2026-11-25",
  dishes: [
    {
      id: "6f1c1f3e-8f53-4d6a-9d43-3b0b1e6f2a11",
      name: "Mysore pak",
      name_latin: null,
      veg_mark: "veg",
      sold_out: false,
      pack: { label: "250 g", grams: 250, pieces: null, price: 23000 },
    },
  ],
  more_dishes: 0,
  ...fields,
});

test("Nearest with no location says that it measures from the centre of the city", () => {
  const nearest = {
    sort: "distance",
    city: "mumbai",
    stores: [store()],
  } as const;
  assert.equal(
    sortNote({ ...nearest, distance_from: "centre" }),
    "search.sort.centre",
  );
  assert.equal(sortNote({ ...nearest, distance_from: "buyer" }), null);
  assert.equal(
    sortNote({ ...nearest, city: "udupi", distance_from: null }),
    "search.sort.no_centre",
  );
});

test("Best rated says that the new cooks come after the rated ones, when there are new cooks", () => {
  const rated = {
    sort: "rating",
    distance_from: null,
    city: "mumbai",
  } as const;
  const stars = { average: 4.5, count: 3 };
  assert.equal(
    sortNote({ ...rated, stores: [store({ rating: stars }), store()] }),
    "search.sort.new_last",
  );
  assert.equal(
    sortNote({ ...rated, stores: [store({ rating: stars })] }),
    null,
  );
  assert.equal(sortNote({ ...rated, stores: [] }), null);
});
