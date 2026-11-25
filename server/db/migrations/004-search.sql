-- Search (docs/system.md, "Search").
--
-- search_index  An FTS5 table with the trigram tokenizer. One row for each
--               item and each store:
--                 form      the search form of the Latin name (indexed):
--                           items.name_latin, else items.name; stores.name.
--                 words     the same name word by word, for a query of one
--                           or two letters (not indexed).
--                 kind      'item' or 'store'.
--                 id        the id of the item or the store.
--                 store_id  the store of the row.
-- search_stale  The items and stores whose names changed since their row in
--               search_index was made. The search form comes from a rule in
--               server/catalog/search-form.ts that SQL cannot run, so these
--               triggers only queue each change. server/catalog/search-index.ts
--               indexes the queue before each search.

CREATE VIRTUAL TABLE search_index USING fts5 (
  form,
  words UNINDEXED,
  kind UNINDEXED,
  id UNINDEXED,
  store_id UNINDEXED,
  tokenize = 'trigram'
);

CREATE TABLE search_stale (
  kind TEXT NOT NULL CHECK (kind IN ('item', 'store')),
  id TEXT NOT NULL,
  PRIMARY KEY (kind, id)
) STRICT, WITHOUT ROWID;

INSERT INTO search_stale (kind, id) SELECT 'item', id FROM items;
INSERT INTO search_stale (kind, id) SELECT 'store', id FROM stores;

CREATE TRIGGER items_search_insert AFTER INSERT ON items BEGIN
  INSERT INTO search_stale (kind, id) VALUES ('item', new.id) ON CONFLICT DO NOTHING;
END;

CREATE TRIGGER items_search_update AFTER UPDATE OF name, name_latin, store_id ON items BEGIN
  INSERT INTO search_stale (kind, id) VALUES ('item', new.id) ON CONFLICT DO NOTHING;
END;

CREATE TRIGGER items_search_delete AFTER DELETE ON items BEGIN
  INSERT INTO search_stale (kind, id) VALUES ('item', old.id) ON CONFLICT DO NOTHING;
END;

CREATE TRIGGER stores_search_insert AFTER INSERT ON stores BEGIN
  INSERT INTO search_stale (kind, id) VALUES ('store', new.id) ON CONFLICT DO NOTHING;
END;

CREATE TRIGGER stores_search_update AFTER UPDATE OF name ON stores BEGIN
  INSERT INTO search_stale (kind, id) VALUES ('store', new.id) ON CONFLICT DO NOTHING;
END;

CREATE TRIGGER stores_search_delete AFTER DELETE ON stores BEGIN
  INSERT INTO search_stale (kind, id) VALUES ('store', old.id) ON CONFLICT DO NOTHING;
END;
