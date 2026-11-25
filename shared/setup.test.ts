import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coverAnswerSchema,
  madeUpSlug,
  normaliseSlug,
  numberedSlug,
  publishAnswerSchema,
  publishBodySchema,
  qrPath,
  setupItemSchema,
  setupMenuBodySchema,
  setupPackSchema,
  setupStateSchema,
  setupStoreBodySchema,
  slugCheckSchema,
  slugFromName,
  slugSchema,
} from "./setup.ts";

const storeId = "6f0c2a4e-8f7b-4b8e-9a51-2d3c4b5a6f70";
const itemId = "0b6a9c1e-2d3f-4a5b-8c7d-9e0f1a2b3c4d";
const packIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];

const pack = (id = packIds[0] ?? "", grams: number | null = 250) => ({
  id,
  label: "250 g",
  grams,
  pieces: null,
  price: 10_000,
});

const item = (overrides: Record<string, unknown> = {}) => ({
  id: itemId,
  name: "ಚಕ್ಕುಲಿ",
  name_latin: "Chakkuli",
  category: "savouries",
  veg_mark: "veg",
  box_contents: null,
  packs: [pack()],
  ...overrides,
});

const storeBody = (overrides: Record<string, unknown> = {}) => ({
  language: "kn",
  name: "Shobha's Kitchen",
  slug: "shobhas-kitchen",
  offers_pickup: true,
  offers_delivery: false,
  area: "Basavanagudi",
  city: "Bengaluru",
  address: null,
  location: null,
  ...overrides,
});

test("a store name gives a link in small Latin letters", () => {
  assert.equal(slugFromName("Shobha's Kitchen"), "shobhas-kitchen");
  assert.equal(
    slugFromName("  Amma’s Murukku Corner! "),
    "ammas-murukku-corner",
  );
  assert.equal(slugFromName("Café Rasoi & Sons"), "cafe-rasoi-and-sons");
  assert.equal(slugFromName("Ghar Ki Mithai 2"), "ghar-ki-mithai-2");
});

test("a name in another script, or a short name, gives no link", () => {
  assert.equal(slugFromName("ಶೋಭಾ ಅಡುಗೆಮನೆ"), "");
  assert.equal(slugFromName("A1"), "");
  assert.equal(slugFromName("--"), "");
});

test("a made-up link is a valid link that starts with store-", () => {
  assert.equal(
    madeUpSlug(() => 0),
    "store-aaaa",
  );
  for (let tries = 0; tries < 50; tries += 1) {
    const slug = madeUpSlug();
    assert.match(slug, /^store-[a-z2-9]{4}$/);
    assert.ok(slugSchema.safeParse(slug).success, slug);
  }
});

test("a long name is cut at a dash, within 40 characters", () => {
  const slug = slugFromName(
    "The Very Long Name Of A Home Kitchen In Basavanagudi Bengaluru",
  );
  assert.equal(slug, "the-very-long-name-of-a-home-kitchen-in");
  assert.ok(slug.length <= 40);
  assert.ok(slugSchema.safeParse(slug).success);
});

test("normaliseSlug keeps what she typed as a link", () => {
  assert.equal(normaliseSlug("Shobha Kitchen "), "shobha-kitchen");
  assert.equal(normaliseSlug("shobhas--kitchen"), "shobhas-kitchen");
  assert.equal(normaliseSlug("ab"), "ab");
});

test("a numbered link keeps within 40 characters", () => {
  assert.equal(numberedSlug("shobhas-kitchen", 1), "shobhas-kitchen");
  assert.equal(numberedSlug("shobhas-kitchen", 2), "shobhas-kitchen-2");
  const long = "the-very-long-name-of-a-home-kitchen-in";
  const numbered = numberedSlug(long, 12);
  assert.ok(numbered.length <= 40);
  assert.equal(numbered, "the-very-long-name-of-a-home-kitchen-12");
  assert.ok(slugSchema.safeParse(numbered).success);
});

test("the slug schema takes a link and refuses other text", () => {
  assert.ok(slugSchema.safeParse("shobhas-kitchen").success);
  for (const bad of [
    "ab",
    "Shobhas",
    "shobhas--kitchen",
    "-shobha",
    "a".repeat(41),
  ]) {
    assert.equal(slugSchema.safeParse(bad).success, false, bad);
  }
});

test("the QR code path names the store", () => {
  assert.equal(qrPath("shobhas-kitchen"), "/api/stores/shobhas-kitchen/qr.svg");
});

test("a slug check answer parses, and a bad one does not", () => {
  assert.ok(
    slugCheckSchema.safeParse({
      slug: "shobhas-kitchen",
      available: false,
      suggestion: "shobhas-kitchen-2",
    }).success,
  );
  assert.equal(
    slugCheckSchema.safeParse({ slug: "x", available: true, suggestion: null })
      .success,
    false,
  );
});

test("a store body needs pickup, delivery or both", () => {
  assert.ok(setupStoreBodySchema.safeParse(storeBody()).success);
  assert.ok(
    setupStoreBodySchema.safeParse(
      storeBody({
        location: { lat: 12.94, lng: 77.57 },
        address: "12, 4th Cross",
      }),
    ).success,
  );
  const neither = setupStoreBodySchema.safeParse(
    storeBody({ offers_pickup: false }),
  );
  assert.equal(neither.success, false);
  assert.deepEqual(neither.error?.issues[0]?.path, ["offers_pickup"]);
  assert.equal(
    setupStoreBodySchema.safeParse(storeBody({ area: "  " })).success,
    false,
  );
});

test("a pack needs a weight or pieces, and a price from ₹1", () => {
  assert.ok(setupPackSchema.safeParse(pack()).success);
  assert.ok(
    setupPackSchema.safeParse({ ...pack(), grams: null, pieces: 6 }).success,
  );
  assert.equal(
    setupPackSchema.safeParse(pack(packIds[0], null)).success,
    false,
  );
  assert.equal(
    setupPackSchema.safeParse({ ...pack(), price: 50 }).success,
    false,
  );
});

test("an item needs one pack at least, with distinct pack ids", () => {
  assert.ok(setupItemSchema.safeParse(item()).success);
  assert.ok(
    setupItemSchema.safeParse(
      item({ box_contents: "Mysore pak, kaju katli", name_latin: null }),
    ).success,
  );
  assert.equal(setupItemSchema.safeParse(item({ packs: [] })).success, false);
  assert.equal(
    setupItemSchema.safeParse(item({ packs: [pack(), pack()] })).success,
    false,
  );
  assert.equal(
    setupItemSchema.safeParse(item({ veg_mark: "vegan" })).success,
    false,
  );
});

test("a menu has distinct item and pack ids", () => {
  assert.ok(setupMenuBodySchema.safeParse({ items: [item()] }).success);
  const twice = setupMenuBodySchema.safeParse({
    items: [item(), item({ id: storeId, packs: [pack(packIds[1])] })],
  });
  assert.ok(twice.success);
  assert.equal(
    setupMenuBodySchema.safeParse({ items: [item(), item({ id: storeId })] })
      .success,
    false,
  );
  assert.equal(setupMenuBodySchema.safeParse({ items: [] }).success, false);
});

test("publish needs both agreements", () => {
  assert.ok(
    publishBodySchema.safeParse({ whatsapp_updates: true, food_safety: true })
      .success,
  );
  assert.equal(
    publishBodySchema.safeParse({ whatsapp_updates: true, food_safety: false })
      .success,
    false,
  );
});

test("the answers parse, and broken ones do not", () => {
  const store = {
    id: storeId,
    slug: "shobhas-kitchen",
    name: "Shobha's Kitchen",
    language: "kn",
    area: "Basavanagudi",
    city: "Bengaluru",
    offers_pickup: true,
    offers_delivery: false,
    has_address: false,
    has_location: true,
    cover_photo: null,
    slug_changed: false,
    published: false,
  };
  assert.ok(setupStateSchema.safeParse({ store, items: [] }).success);
  assert.equal(
    setupStateSchema.safeParse({ store: { ...store, lat: 1 }, items: {} })
      .success,
    false,
  );
  assert.ok(coverAnswerSchema.safeParse({ cover_photo: null }).success);
  assert.equal(coverAnswerSchema.safeParse({}).success, false);
  const published = {
    store: { id: storeId, slug: "shobhas-kitchen", name: "Shobha's Kitchen" },
    url: "https://34-12-56-78.sslip.io/s/shobhas-kitchen",
    qr_svg: "/api/stores/shobhas-kitchen/qr.svg",
  };
  assert.ok(publishAnswerSchema.safeParse(published).success);
  assert.equal(
    publishAnswerSchema.safeParse({ ...published, url: "not a link" }).success,
    false,
  );
});
