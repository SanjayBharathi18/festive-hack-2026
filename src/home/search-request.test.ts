import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fieldsOf,
  filtersOn,
  keptFields,
  pageQuery,
  searchPath,
} from "./search-request.ts";

const empty = { q: "", need_by: "", veg: "", category: "", sort: "" };

test("no words and no filters is a search for every cook", () => {
  assert.equal(searchPath(empty, null), "/api/search");
});

test("the words and the filters go in the address; empty ones stay out", () => {
  assert.equal(
    searchPath(
      {
        ...empty,
        q: " ಕಾಜು ಕಟ್ಲಿ ",
        need_by: "2026-11-28",
        veg: "veg",
        sort: "rating",
      },
      null,
    ),
    `/api/search?q=${encodeURIComponent("ಕಾಜು ಕಟ್ಲಿ")}&need_by=2026-11-28&veg=veg&sort=rating`.replace(
      /%20/g,
      "+",
    ),
  );
});

test("the buyer's place goes only when she shared it", () => {
  assert.equal(
    searchPath({ ...empty, category: "sweets" }, { lat: 12.912, lng: 77.645 }),
    "/api/search?category=sweets&lat=12.912&lng=77.645",
  );
});

test("the search keeps to the city of the picker", () => {
  assert.equal(
    searchPath({ ...empty, sort: "distance" }, null, "navi mumbai"),
    "/api/search?sort=distance&city=navi+mumbai",
  );
  assert.equal(searchPath(empty, null, ""), "/api/search");
});

test("the fields come from the form, and a missing field is empty", () => {
  const form = new Map<string, unknown>([
    ["q", "laddu"],
    ["veg", "egg"],
    ["sort", new Blob([])],
  ]);
  assert.deepEqual(
    fieldsOf((name) => form.get(name)),
    { ...empty, q: "laddu", veg: "egg" },
  );
});

test("the page address keeps the dish and the filters, and its other values", () => {
  const fields = {
    q: " kaju katli ",
    need_by: "2026-11-28",
    veg: "veg",
    category: "",
    sort: "distance",
  };
  assert.equal(
    pageQuery(fields, "?lang=hi&category=sweets"),
    "?lang=hi&q=kaju+katli&need_by=2026-11-28&veg=veg",
  );
  assert.equal(
    pageQuery({ ...fields, q: "", need_by: "", veg: "" }, "?q=old"),
    "",
  );
});

test("a page address gives back the dish and the filters it kept", () => {
  assert.deepEqual(
    keptFields("?lang=kn&q=ಕಾಜು+ಕಟ್ಲಿ&veg=egg&sort=distance&category="),
    [
      ["q", "ಕಾಜು ಕಟ್ಲಿ"],
      ["veg", "egg"],
    ],
  );
  assert.deepEqual(keptFields(""), []);
});

test("the Filters button counts the day, the food type and the category, not the words or the sort", () => {
  assert.equal(filtersOn(empty), 0);
  assert.equal(
    filtersOn({ ...empty, q: "laddu", sort: "distance", veg: "egg" }),
    1,
  );
  assert.equal(
    filtersOn({
      ...empty,
      need_by: "2026-11-28",
      veg: "veg",
      category: "sweets",
    }),
    3,
  );
});
