import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import {
  migrate,
  readMigrations,
  schemaVersion,
  type Migration,
} from "./migrate.ts";

const first: Migration = {
  version: 1,
  name: "001-stores.sql",
  sql: "CREATE TABLE stores (id TEXT PRIMARY KEY) STRICT;",
};
const second: Migration = {
  version: 2,
  name: "002-items.sql",
  sql: "CREATE TABLE items (id TEXT PRIMARY KEY) STRICT;",
};

function tables(db: Database.Database): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
    )
    .pluck()
    .all() as string[];
}

function folderWith(files: string[]): URL {
  const folder = mkdtempSync(join(tmpdir(), "migrations-"));
  for (const file of files) writeFileSync(join(folder, file), "SELECT 1;");
  return pathToFileURL(`${folder}/`);
}

test("a fresh database gets every migration", () => {
  const db = new Database(":memory:");
  migrate(db, [first, second]);
  assert.equal(schemaVersion(db), 2);
  assert.deepEqual(tables(db), ["items", "stores"]);
});

test("a second run changes nothing and keeps the data", () => {
  const db = new Database(":memory:");
  migrate(db, [first, second]);
  db.prepare("INSERT INTO stores (id) VALUES ('s1')").run();
  migrate(db, [first, second]);
  assert.equal(schemaVersion(db), 2);
  assert.equal(db.prepare("SELECT count(*) FROM stores").pluck().get(), 1);
});

test("only the new migrations run", () => {
  const db = new Database(":memory:");
  migrate(db, [first]);
  assert.deepEqual(tables(db), ["stores"]);
  migrate(db, [first, second]);
  assert.equal(schemaVersion(db), 2);
  assert.deepEqual(tables(db), ["items", "stores"]);
});

test("a failing migration rolls back and keeps the old version", () => {
  const db = new Database(":memory:");
  const broken: Migration = {
    version: 2,
    name: "002-broken.sql",
    sql: "CREATE TABLE items (id TEXT); INSERT INTO nowhere VALUES (1);",
  };
  migrate(db, [first]);
  assert.throws(() => migrate(db, [first, broken]), /no such table: nowhere/);
  assert.equal(schemaVersion(db), 1);
  assert.deepEqual(tables(db), ["stores"]);
});

test("a database that is newer than the code is refused", () => {
  const db = new Database(":memory:");
  db.pragma("user_version = 5");
  assert.throws(() => migrate(db, [first]), /schema version 5/);
});

test("the migrations folder gives numbered migrations in order", () => {
  const migrations = readMigrations(new URL("./migrations/", import.meta.url));
  assert.ok(migrations.length >= 1);
  migrations.forEach((migration, index) => {
    assert.equal(migration.version, index + 1);
    assert.match(migration.name, /^\d{3}-[\w-]+\.sql$/);
  });
});

test("gaps, repeats and unnumbered files are refused", () => {
  assert.throws(
    () => readMigrations(folderWith(["001-a.sql", "003-c.sql"])),
    /003-c\.sql must have the number 2/,
  );
  assert.throws(
    () => readMigrations(folderWith(["001-a.sql", "001-b.sql"])),
    /must have the number 2/,
  );
  assert.throws(
    () => readMigrations(folderWith(["stores.sql"])),
    /stores\.sql must be named like/,
  );
});

const storesAndItems: Migration = {
  version: 1,
  name: "001-stores-items.sql",
  sql: `
    CREATE TABLE stores (
      id TEXT PRIMARY KEY,
      limit_unit TEXT NOT NULL CHECK (limit_unit IN ('orders', 'kg'))
    ) STRICT;
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores (id) ON DELETE CASCADE
    ) STRICT;
  `,
};

function withStoreAndItem(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db, [storesAndItems]);
  db.prepare("INSERT INTO stores VALUES ('s1', 'kg')").run();
  db.prepare("INSERT INTO items VALUES ('i1', 's1')").run();
  return db;
}

test("a rebuild of a parent table keeps the child rows, and foreign keys stay on", () => {
  const db = withStoreAndItem();
  const rebuild: Migration = {
    version: 2,
    name: "002-pieces-limit.sql",
    sql: `
      CREATE TABLE stores_new (
        id TEXT PRIMARY KEY,
        limit_unit TEXT NOT NULL CHECK (limit_unit IN ('orders', 'kg', 'pieces'))
      ) STRICT;
      INSERT INTO stores_new SELECT * FROM stores;
      DROP TABLE stores;
      ALTER TABLE stores_new RENAME TO stores;
    `,
  };
  migrate(db, [storesAndItems, rebuild]);
  assert.equal(db.prepare("SELECT count(*) FROM items").pluck().get(), 1);
  db.prepare("INSERT INTO stores VALUES ('s2', 'pieces')").run();
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  assert.throws(
    () => db.prepare("INSERT INTO items VALUES ('i2', 'missing')").run(),
    /FOREIGN KEY/,
  );
});

test("a migration that leaves rows with no parent rolls back", () => {
  const db = withStoreAndItem();
  const orphans: Migration = {
    version: 2,
    name: "002-remove-stores.sql",
    sql: "DELETE FROM stores;",
  };
  assert.throws(
    () => migrate(db, [storesAndItems, orphans]),
    /002-remove-stores\.sql breaks foreign keys: items has rows with no parent/,
  );
  assert.equal(schemaVersion(db), 1);
  assert.equal(db.prepare("SELECT count(*) FROM stores").pluck().get(), 1);
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
});
