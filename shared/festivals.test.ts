import assert from "node:assert/strict";
import { test } from "node:test";
import { daySchema } from "./day.ts";
import {
  festivals,
  festivalWindowDays,
  nearFestival,
  nearFestivals,
  type Festival,
} from "./festivals.ts";

const list: Festival[] = [
  { id: "late", name: "Late", date: "2026-12-25", items: ["Plum cake"] },
  { id: "soon", name: "Soon", date: "2026-11-30", items: ["Kaju katli"] },
];

test("each festival has an id, a name, a real date and common items, in date order", () => {
  const ids = new Set<string>();
  for (const festival of festivals) {
    assert.match(festival.id, /^[a-z_]+$/);
    assert.ok(!ids.has(festival.id), `${festival.id} repeats`);
    ids.add(festival.id);
    assert.notEqual(festival.name.trim(), "");
    assert.ok(daySchema.safeParse(festival.date).success, festival.date);
    assert.ok(festival.items.length > 0, `${festival.id} has no items`);
  }
  const dates = festivals.map((festival) => festival.date);
  assert.deepEqual(dates, [...dates].sort());
});

test("a festival is near from 20 days before its date to the day itself", () => {
  assert.equal(festivalWindowDays, 21);
  assert.deepEqual(nearFestivals("2026-11-09", list), []);
  assert.deepEqual(
    nearFestivals("2026-11-10", list).map(({ id }) => id),
    ["soon"],
  );
  assert.deepEqual(
    nearFestivals("2026-11-30", list).map(({ id }) => id),
    ["soon"],
  );
  assert.equal(nearFestival("2026-12-01", list), null);
});

test("the nearest festival comes first", () => {
  assert.deepEqual(
    nearFestivals("2026-12-05", [...list, list[1] as Festival]).map(
      ({ id }) => id,
    ),
    ["late"],
  );
  const both: Festival[] = [
    ...list,
    { id: "early", name: "Early", date: "2026-12-10", items: ["Laddu"] },
  ];
  assert.deepEqual(
    nearFestivals("2026-12-05", both).map(({ id }) => id),
    ["early", "late"],
  );
  assert.equal(nearFestival("2026-12-05", both)?.id, "early");
});

test("Guru Nanak Jayanti is near on its day in the season list", () => {
  assert.equal(nearFestival("2026-11-24")?.id, "guru_nanak_jayanti");
  assert.equal(nearFestival("2026-12-05")?.id, "christmas");
});
