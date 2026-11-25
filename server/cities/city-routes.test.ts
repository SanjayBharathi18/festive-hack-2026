import assert from "node:assert/strict";
import { test } from "node:test";
import { citiesAnswerSchema } from "../../shared/cities.ts";
import { createTestApp } from "../test-app.ts";
import { seedStore } from "../test-store.ts";

test("the city list has the cities of the marketplace stores, once each, with labels and a centre", async () => {
  const { app, deps } = createTestApp();
  const { db } = deps;
  const city = (slug: string, name: string | null) =>
    db.prepare("UPDATE stores SET city = ? WHERE slug = ?").run(name, slug);
  seedStore(db);
  seedStore(db, { slug: "second-bengaluru", phone: "+919800000002" });
  city("second-bengaluru", "Bangalore");
  seedStore(db, { slug: "bombay-bites", phone: "+919800000003" });
  city("bombay-bites", "Bombay");
  seedStore(db, { slug: "udupi-kitchen", phone: "+919800000004" });
  city("udupi-kitchen", " Udupi ");
  seedStore(db, { slug: "pune-hidden", phone: "+919800000005" });
  city("pune-hidden", "Pune");
  db.prepare("UPDATE stores SET in_marketplace = 0 WHERE slug = ?").run(
    "pune-hidden",
  );
  const unverified = seedStore(db, {
    slug: "chennai-unverified",
    phone: "+919800000006",
  });
  city("chennai-unverified", "Chennai");
  db.prepare("UPDATE sellers SET verified_at = NULL WHERE id = ?").run(
    unverified.sellerId,
  );
  seedStore(db, { slug: "no-city", phone: "+919800000007" });
  city("no-city", null);

  const response = await app.request("/api/cities");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const text = await response.text();
  const { cities } = citiesAnswerSchema.parse(JSON.parse(text));
  assert.deepEqual(
    cities.map(({ key }) => key),
    ["bengaluru", "mumbai", "udupi"],
  );
  assert.deepEqual(cities[1]?.labels, {
    en: "Mumbai",
    hi: "मुंबई",
    kn: "ಮುಂಬೈ",
    ta: "மும்பை",
    te: "ముంబై",
    mr: "मुंबई",
  });
  assert.deepEqual(cities[1]?.centre, { lat: 19.076, lng: 72.8777 });
  assert.equal(cities[2]?.labels.hi, "Udupi");
  assert.equal(cities[2]?.centre, null);
  assert.doesNotMatch(text, /12\.9417|77\.5755/);
});
