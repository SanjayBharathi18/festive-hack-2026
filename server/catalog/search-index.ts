import type { Db } from "../db/database.ts";
import { searchForm, searchWords } from "./search-form.ts";

export type HitKind = "item" | "store";
export type Hit = { kind: HitKind; id: string; store_id: string };
export type SearchIndex = ReturnType<typeof createSearchIndex>;

type Named = { id: string; store_id: string; name: string };
type Stale = { kind: HitKind; id: string };

export const trigramLength = 3;

// The FTS5 index of the Latin forms (server/db/migrations/004-search.sql).
// The first sync in a process indexes every row again, so a change of the
// search form rule reaches old rows. Later syncs index only the rows that
// the triggers queued.
export function createSearchIndex(db: Db) {
  const items = db.prepare(
    "SELECT id, store_id, coalesce(name_latin, name) AS name FROM items",
  );
  const stores = db.prepare("SELECT id, id AS store_id, name FROM stores");
  const item = db.prepare(
    "SELECT id, store_id, coalesce(name_latin, name) AS name FROM items WHERE id = ?",
  );
  const store = db.prepare(
    "SELECT id, id AS store_id, name FROM stores WHERE id = ?",
  );
  const stale = db.prepare("SELECT kind, id FROM search_stale");
  const clearStale = db.prepare("DELETE FROM search_stale");
  const dropStale = db.prepare(
    "DELETE FROM search_stale WHERE kind = ? AND id = ?",
  );
  const clear = db.prepare("DELETE FROM search_index");
  const drop = db.prepare("DELETE FROM search_index WHERE kind = ? AND id = ?");
  const insert = db.prepare(
    "INSERT INTO search_index (form, words, kind, id, store_id) VALUES (?, ?, ?, ?, ?)",
  );
  const trigram = db.prepare(
    "SELECT kind, id, store_id FROM search_index WHERE search_index MATCH ?",
  );
  const prefix = db.prepare(
    "SELECT kind, id, store_id FROM search_index WHERE instr(' ' || words, ' ' || ?) > 0",
  );

  const add = (kind: HitKind, row: Named) => {
    const form = searchForm(row.name);
    if (form !== "") {
      insert.run(form, searchWords(row.name), kind, row.id, row.store_id);
    }
  };
  const rebuild = db.transaction(() => {
    clear.run();
    clearStale.run();
    for (const row of items.all() as Named[]) add("item", row);
    for (const row of stores.all() as Named[]) add("store", row);
  });
  const catchUp = db.transaction(() => {
    for (const { kind, id } of stale.all() as Stale[]) {
      drop.run(kind, id);
      const row = (kind === "item" ? item : store).get(id) as Named | undefined;
      if (row !== undefined) add(kind, row);
      dropStale.run(kind, id);
    }
  });
  let built = false;

  return {
    sync(): void {
      if (built) {
        catchUp();
        return;
      }
      rebuild();
      built = true;
    },
    // form is a search form of 3 or more characters: letters, digits and
    // vowel signs only, so it is safe inside an FTS5 string.
    trigram: (form: string) => trigram.all(`"${form}"`) as Hit[],
    prefix: (form: string) => prefix.all(form) as Hit[],
  };
}
