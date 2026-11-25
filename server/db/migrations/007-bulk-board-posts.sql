-- The request board: board posts and the stores that answered them
-- (docs/system.md, "Data"). The encodings of 001-must-tables.sql apply.
--
--   id               the id that the desks use.
--   token            the secret of the company's link, /board-posts/<token>.
--   company_name     NULL: the post shows only the description.
--   items            TEXT JSON array of {"name", "quantity", "unit"}, with the
--                    unit pieces, boxes or kg.
--   places           TEXT JSON array of the delivery places.
--   budget_per_unit  paise. NULL is no budget.
--   status           open, or closed by the company. A post also closes after
--                    its need-by day.
--   language         the app language of the company's page.
--   note_language    a Sarvam language code: the seller's language.

CREATE TABLE board_posts (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE CHECK (length(token) >= 16),
  buyer_phone TEXT NOT NULL CHECK (
    buyer_phone GLOB '+[1-9]*' AND buyer_phone NOT GLOB '+*[^0-9]*'
    AND length(buyer_phone) BETWEEN 8 AND 16
  ),
  work_email TEXT NOT NULL CHECK (work_email GLOB '?*@?*.?*'),
  company_name TEXT CHECK (company_name <> ''),
  description TEXT NOT NULL CHECK (description <> ''),
  items TEXT NOT NULL CHECK (json_valid(items) AND json_type(items) = 'array'),
  need_by TEXT NOT NULL CHECK (date(need_by) IS need_by),
  places TEXT NOT NULL CHECK (json_valid(places) AND json_type(places) = 'array'),
  budget_per_unit INTEGER CHECK (budget_per_unit >= 0),
  city TEXT NOT NULL CHECK (city <> ''),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  language TEXT NOT NULL CHECK (language IN ('en', 'hi', 'kn', 'ta', 'te', 'mr')),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX board_posts_city ON board_posts (city, status, need_by);

CREATE TABLE board_interests (
  board_post_id TEXT NOT NULL REFERENCES board_posts (id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  note TEXT CHECK (note <> ''),
  note_language TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (board_post_id, store_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX board_interests_store ON board_interests (store_id);
