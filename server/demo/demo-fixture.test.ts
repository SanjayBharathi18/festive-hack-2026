import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { categorySchema, vegMarkSchema } from "../../shared/model.ts";
import { scriptOf, scriptOfLanguage } from "../../shared/scripts.ts";
import {
  demoFixtureSchema,
  demoFixtureUrl,
  readDemoFixture,
} from "./demo-fixture.ts";

const raw = () =>
  JSON.parse(readFileSync(demoFixtureUrl, "utf8")) as {
    stores: Record<string, unknown>[];
  };

test("fixtures/demo.json is a valid demo seed", () => {
  const fixture = readDemoFixture();
  assert.equal(fixture.stores.length, 14);
  assert.deepEqual(
    fixture.stores.filter(({ is_demo }) => !is_demo).map(({ slug }) => slug),
    ["test-kitchen"],
  );
});

test("the stores outside Bengaluru name each dish in the seller's script, and cover each category and mark", () => {
  const stores = readDemoFixture().stores.filter(
    ({ city }) => city !== "Bengaluru",
  );
  assert.deepEqual(
    stores.map(({ city, seller }) => [city, seller.language]),
    [
      ["Mumbai", "mr"],
      ["Delhi", "hi"],
      ["Chennai", "ta"],
      ["Hyderabad", "te"],
      ["Pune", "mr"],
      ["Kolkata", "en"],
    ],
  );
  const items = stores.flatMap(({ seller, items = [] }) => {
    for (const { name, name_latin } of items) {
      assert.equal(scriptOf(name), scriptOfLanguage[seller.language], name);
      assert.equal(scriptOf(name_latin), "latin", name_latin);
    }
    return items;
  });
  assert.deepEqual(
    new Set(items.map(({ category }) => category)),
    new Set(categorySchema.options),
  );
  assert.deepEqual(
    new Set(items.map(({ veg_mark }) => veg_mark)),
    new Set(vegMarkSchema.options),
  );
});

test("the fixture schema refuses a broken seed, with the reason", () => {
  const broken: [string, (fixture: ReturnType<typeof raw>) => void][] = [
    [
      "A menu item needs exactly one of packs",
      (fixture) => {
        const items = fixture.stores[0]?.items as Record<string, unknown>[];
        Object.assign(items[0] ?? {}, { price_per_kg: 88000 });
      },
    ],
    [
      "A delivery order has an address",
      (fixture) => {
        const orders = fixture.stores[0]?.orders as Record<string, unknown>[];
        delete orders[0]?.address;
      },
    ],
    [
      "its own items or the menu_of another store",
      (fixture) => {
        Object.assign(fixture.stores[1] ?? {}, { items: [] });
      },
    ],
    [
      "Each store has its own slug",
      (fixture) => {
        Object.assign(fixture.stores[2] ?? {}, { slug: "shobhas-kitchen" });
      },
    ],
    [
      "phone",
      (fixture) => {
        Object.assign(fixture.stores[0] ?? {}, {
          seller: { phone: "98765 43210", language: "kn" },
        });
      },
    ],
  ];
  for (const [reason, breakIt] of broken) {
    const fixture = raw();
    breakIt(fixture);
    const result = demoFixtureSchema.safeParse(fixture);
    assert.equal(result.success, false, reason);
    assert.match(JSON.stringify(result.error?.issues), new RegExp(reason));
  }
});

test("readDemoFixture names the file and the problem", () => {
  const file = join(mkdtempSync(join(tmpdir(), "demo-")), "demo.json");
  writeFileSync(file, JSON.stringify({ stores: [] }));
  assert.throws(
    () => readDemoFixture(pathToFileURL(file)),
    /The demo seed .*demo\.json is not valid: .*stores/s,
  );
});
