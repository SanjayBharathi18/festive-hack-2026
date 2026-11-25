import assert from "node:assert/strict";
import { test } from "node:test";
import { menuItemSchema, type MenuItem } from "../../shared/store.ts";
import { openDatabase, type Db } from "../db/database.ts";
import { getMenu, menuSections } from "./menu.ts";

type Row = Record<string, string | number | null>;

const ids = {
  store: "4f6b1a52-6c1e-4b8e-9a0e-2d3c4b5a6f70",
  other: "4f6b1a52-6c1e-4b8e-9a0e-2d3c4b5a6f71",
  mysorePak: "0c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5",
  chakkuli: "0c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d6",
  box: "0c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d7",
  bulkOnly: "0c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d8",
  elsewhere: "0c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d9",
};

function insert(db: Db, table: string, row: Row): void {
  const columns = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`,
  ).run(row);
}

function item(id: string, store_id: string, overrides: Row = {}): Row {
  return {
    id,
    store_id,
    name: "ಮೈಸೂರು ಪಾಕ್",
    category: "sweets",
    veg_mark: "veg",
    ...overrides,
  };
}

let packCount = 0;

function pack(item_id: string, overrides: Row): Row {
  packCount += 1;
  return {
    id: `9e8d7c6b-5a49-4382-a716-${String(packCount).padStart(12, "0")}`,
    item_id,
    ...overrides,
  };
}

function menuDb(): Db {
  const db = openDatabase(":memory:");
  insert(db, "sellers", { id: "s1", phone: "+910000000001", language: "kn" });
  insert(db, "stores", {
    id: ids.store,
    seller_id: "s1",
    slug: "a",
    name: "A",
  });
  insert(db, "stores", {
    id: ids.other,
    seller_id: "s1",
    slug: "b",
    name: "B",
  });
  insert(
    db,
    "items",
    item(ids.mysorePak, ids.store, {
      name_latin: "Mysore pak",
      allergens: '["dairy"]',
      sold_out: 1,
    }),
  );
  insert(
    db,
    "items",
    item(ids.chakkuli, ids.store, {
      name: "ಚಕ್ಕುಲಿ",
      name_latin: "Chakkuli (chakli)",
      category: "savouries",
      allergens: '["sesame"]',
    }),
  );
  insert(
    db,
    "items",
    item(ids.box, ids.store, {
      name: "ದೀಪಾವಳಿ ಸ್ವೀಟ್ ಬಾಕ್ಸ್",
      box_contents: "Mysore pak, kaju katli",
      special: 1,
    }),
  );
  insert(db, "items", item(ids.bulkOnly, ids.store, { in_menu: 0 }));
  insert(db, "items", item(ids.elsewhere, ids.other));
  insert(
    db,
    "packs",
    pack(ids.mysorePak, { label: "1 kg", grams: 1000, price: 88000 }),
  );
  insert(
    db,
    "packs",
    pack(ids.mysorePak, { label: "250 g", grams: 250, price: 23000 }),
  );
  insert(
    db,
    "packs",
    pack(ids.mysorePak, { label: "500 g", grams: 500, price: 45000 }),
  );
  insert(
    db,
    "packs",
    pack(ids.chakkuli, { label: "1 kg", grams: 1000, price: 40000 }),
  );
  insert(
    db,
    "packs",
    pack(ids.bulkOnly, { label: "Box", pieces: 1, price: 0 }),
  );
  insert(
    db,
    "packs",
    pack(ids.elsewhere, { label: "1 kg", grams: 1000, price: 1 }),
  );
  return db;
}

test("getMenu gives her menu items in her order, with their packs", () => {
  const menu = getMenu(menuDb(), ids.store);
  assert.deepEqual(
    menu.map((entry) => entry.id),
    [ids.mysorePak, ids.chakkuli, ids.box],
  );
  for (const entry of menu) menuItemSchema.parse(entry);
  const [mysorePak, chakkuli, box] = menu;
  assert.deepEqual(mysorePak, {
    id: ids.mysorePak,
    name: "ಮೈಸೂರು ಪಾಕ್",
    name_latin: "Mysore pak",
    name_script: null,
    category: "sweets",
    veg_mark: "veg",
    allergens: ["dairy"],
    box_contents: null,
    photo: null,
    special: false,
    sold_out: true,
    packs: [
      {
        id: mysorePak?.packs[0]?.id,
        label: "250 g",
        grams: 250,
        pieces: null,
        price: 23000,
      },
      {
        id: mysorePak?.packs[1]?.id,
        label: "500 g",
        grams: 500,
        pieces: null,
        price: 45000,
      },
      {
        id: mysorePak?.packs[2]?.id,
        label: "1 kg",
        grams: 1000,
        pieces: null,
        price: 88000,
      },
    ],
  });
  assert.deepEqual(chakkuli?.allergens, ["sesame"]);
  assert.equal(chakkuli?.packs.length, 1);
  assert.equal(box?.special, true);
  assert.equal(box?.box_contents, "Mysore pak, kaju katli");
  assert.deepEqual(box?.packs, []);
});

test("getMenu leaves out bulk-only items and the items of other stores", () => {
  const db = menuDb();
  const menuIds = getMenu(db, ids.store).map((entry) => entry.id);
  assert.equal(menuIds.includes(ids.bulkOnly), false);
  assert.equal(menuIds.includes(ids.elsewhere), false);
  assert.deepEqual(
    getMenu(db, ids.other).map((entry) => entry.id),
    [ids.elsewhere],
  );
  assert.deepEqual(getMenu(db, "no-such-store"), []);
});

function menuItem(id: string, overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    name: id,
    name_latin: null,
    name_script: null,
    category: "sweets",
    veg_mark: "veg",
    allergens: [],
    box_contents: null,
    photo: null,
    special: false,
    sold_out: false,
    packs: [],
    ...overrides,
  };
}

test("menuSections groups items by category in the fixed category order", () => {
  const sections = menuSections([
    menuItem("chakkuli", { category: "savouries" }),
    menuItem("thali", { category: "meals" }),
    menuItem("mysore-pak"),
    menuItem("kodubale", { category: "savouries" }),
  ]);
  assert.deepEqual(
    sections.map(({ category, items }) => [
      category,
      items.map(({ id }) => id),
    ]),
    [
      ["sweets", ["mysore-pak"]],
      ["savouries", ["chakkuli", "kodubale"]],
      ["meals", ["thali"]],
    ],
  );
});

test("menuSections puts Special items first, and their section first", () => {
  const sections = menuSections([
    menuItem("mysore-pak"),
    menuItem("chakkuli", { category: "savouries" }),
    menuItem("kodubale", { category: "savouries", special: true }),
    menuItem("nippattu", { category: "savouries" }),
    menuItem("kaju-katli"),
  ]);
  assert.deepEqual(
    sections.map(({ category, items }) => [
      category,
      items.map(({ id }) => id),
    ]),
    [
      ["savouries", ["kodubale", "chakkuli", "nippattu"]],
      ["sweets", ["mysore-pak", "kaju-katli"]],
    ],
  );
  assert.deepEqual(menuSections([]), []);
});
