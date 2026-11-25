-- The tables of the Must tier (docs/system.md, "Data"). All tables are STRICT.
--
-- Encodings:
--   id            TEXT UUID from crypto.randomUUID(). An order id is also its
--                 Flagsmith identity, "order:<id>".
--   money         INTEGER paise.
--   *_at          INTEGER milliseconds since the Unix epoch.
--   day, date     TEXT 'YYYY-MM-DD', a calendar day in IST.
--   yes or no     INTEGER 0 or 1.
--   phone         TEXT in E.164 form, for example '+919876543210'.
--   language      An app language: en, hi, kn, ta, te or mr.
--   note_language, reading_language
--                 A Sarvam language code, for example 'kn-IN'.
--   working_days  INTEGER bit mask. Bit n is set when the store works on
--                 weekday n, from 0 (Sunday) to 6 (Saturday), as weekday()
--                 in shared/day.ts gives it. 127 is every day.
--   daily_limit   In the unit of limit_unit: orders, grams (for kg) or
--                 pieces. NULL is no limit.
--   allergens     TEXT JSON array of strings, for example '["dairy","nuts"]'.
--                 '[]' is none.

CREATE TABLE sellers (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE CHECK (
    phone GLOB '+[1-9]*' AND phone NOT GLOB '+*[^0-9]*'
    AND length(phone) BETWEEN 8 AND 16
  ),
  language TEXT NOT NULL CHECK (language IN ('en', 'hi', 'kn', 'ta', 'te', 'mr')),
  verified_at INTEGER
) STRICT;

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES sellers (id),
  slug TEXT NOT NULL UNIQUE CHECK (slug <> '' AND slug NOT GLOB '*[^a-z0-9-]*'),
  name TEXT NOT NULL,
  cover_photo TEXT,
  area TEXT,
  city TEXT,
  address TEXT,
  lat REAL CHECK (lat BETWEEN -90 AND 90),
  lng REAL CHECK (lng BETWEEN -180 AND 180),
  offers_pickup INTEGER NOT NULL DEFAULT 0 CHECK (offers_pickup IN (0, 1)),
  offers_delivery INTEGER NOT NULL DEFAULT 0 CHECK (offers_delivery IN (0, 1)),
  accepts_online INTEGER NOT NULL DEFAULT 0 CHECK (accepts_online IN (0, 1)),
  advance_for_strangers INTEGER NOT NULL DEFAULT 0 CHECK (advance_for_strangers IN (0, 1)),
  in_marketplace INTEGER NOT NULL DEFAULT 0 CHECK (in_marketplace IN (0, 1)),
  fssai TEXT CHECK (length(fssai) = 14 AND fssai NOT GLOB '*[^0-9]*'),
  normal_orders_on INTEGER NOT NULL DEFAULT 1 CHECK (normal_orders_on IN (0, 1)),
  bulk_on INTEGER NOT NULL DEFAULT 0 CHECK (bulk_on IN (0, 1)),
  bulk_line TEXT,
  catering_on INTEGER NOT NULL DEFAULT 0 CHECK (catering_on IN (0, 1)),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
  limit_unit TEXT NOT NULL DEFAULT 'orders' CHECK (limit_unit IN ('orders', 'kg', 'pieces')),
  daily_limit INTEGER CHECK (daily_limit > 0),
  last_order_day TEXT CHECK (date(last_order_day) IS last_order_day),
  working_days INTEGER NOT NULL DEFAULT 127 CHECK (working_days BETWEEN 1 AND 127),
  slug_changed INTEGER NOT NULL DEFAULT 0 CHECK (slug_changed IN (0, 1)),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))
) STRICT;

CREATE INDEX stores_seller ON stores (seller_id);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_latin TEXT,
  category TEXT NOT NULL CHECK (category IN ('sweets', 'snacks', 'savouries', 'meals')),
  veg_mark TEXT NOT NULL CHECK (veg_mark IN ('veg', 'non_veg', 'egg')),
  allergens TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(allergens) AND json_type(allergens) = 'array'
  ),
  box_contents TEXT,
  photo TEXT,
  special INTEGER NOT NULL DEFAULT 0 CHECK (special IN (0, 1)),
  sold_out INTEGER NOT NULL DEFAULT 0 CHECK (sold_out IN (0, 1)),
  in_menu INTEGER NOT NULL DEFAULT 1 CHECK (in_menu IN (0, 1)),
  in_bulk INTEGER NOT NULL DEFAULT 0 CHECK (in_bulk IN (0, 1)),
  bulk_min_qty INTEGER CHECK (bulk_min_qty > 0),
  bulk_unit TEXT CHECK (bulk_unit IN ('pieces', 'kg')),
  bulk_price INTEGER CHECK (bulk_price >= 0)
) STRICT;

CREATE INDEX items_store ON items (store_id);

CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  grams INTEGER CHECK (grams > 0),
  pieces INTEGER CHECK (pieces > 0),
  price INTEGER NOT NULL CHECK (price >= 0)
) STRICT;

CREATE INDEX packs_item ON packs (item_id);

CREATE TABLE closed_dates (
  store_id TEXT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (date(date) IS date),
  PRIMARY KEY (store_id, date)
) STRICT, WITHOUT ROWID;

CREATE TABLE codes (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
) STRICT;

CREATE INDEX codes_target ON codes (target, expires_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('seller', 'buyer')),
  subject TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX sessions_expires ON sessions (expires_at);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores (id),
  number INTEGER NOT NULL CHECK (number > 0),
  token TEXT NOT NULL UNIQUE CHECK (length(token) >= 16),
  source TEXT NOT NULL CHECK (source IN ('link', 'marketplace', 'desk', 'load')),
  status TEXT NOT NULL CHECK (
    status IN (
      'awaiting_payment', 'new', 'making', 'ready',
      'delivered', 'picked_up', 'cancelled', 'expired'
    )
  ),
  fulfilment TEXT NOT NULL CHECK (fulfilment IN ('pickup', 'delivery')),
  address TEXT,
  gift_name TEXT,
  gift_phone TEXT CHECK (
    gift_phone GLOB '+[1-9]*' AND gift_phone NOT GLOB '+*[^0-9]*'
    AND length(gift_phone) BETWEEN 8 AND 16
  ),
  gift_message TEXT,
  note TEXT,
  note_language TEXT,
  buyer_name TEXT,
  buyer_phone TEXT CHECK (
    buyer_phone GLOB '+[1-9]*' AND buyer_phone NOT GLOB '+*[^0-9]*'
    AND length(buyer_phone) BETWEEN 8 AND 16
  ),
  buyer_language TEXT CHECK (buyer_language IN ('en', 'hi', 'kn', 'ta', 'te', 'mr')),
  day TEXT NOT NULL CHECK (date(day) IS day),
  total INTEGER NOT NULL CHECK (total >= 0),
  paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)),
  payment_required INTEGER NOT NULL DEFAULT 0 CHECK (payment_required IN (0, 1)),
  cancel_reason TEXT,
  transcript TEXT,
  reading_language TEXT,
  reading_variant TEXT,
  edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
  created_at INTEGER NOT NULL,
  UNIQUE (store_id, number)
) STRICT;

CREATE INDEX orders_store_day ON orders (store_id, day);

-- price, grams and pieces are the values of one pack when the order was made.
CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items (id),
  pack_id TEXT REFERENCES packs (id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price INTEGER NOT NULL CHECK (price >= 0),
  grams INTEGER CHECK (grams > 0),
  pieces INTEGER CHECK (pieces > 0)
) STRICT;

CREATE INDEX order_items_order ON order_items (order_id);

-- request_id is a quote request or a board post. Their tables come later.
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders (id) ON DELETE CASCADE,
  request_id TEXT,
  to_phone TEXT NOT NULL CHECK (
    to_phone GLOB '+[1-9]*' AND to_phone NOT GLOB '+*[^0-9]*'
    AND length(to_phone) BETWEEN 8 AND 16
  ),
  template TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'hi', 'kn', 'ta', 'te', 'mr')),
  body TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('simulated', 'whatsapp')),
  created_at INTEGER NOT NULL,
  CHECK ((order_id IS NULL) <> (request_id IS NULL))
) STRICT;

CREATE INDEX messages_order ON messages (order_id, created_at);

-- response is NULL while the first request runs, then the JSON
-- {"status": 201, "type": "application/json", "body": "..."}.
CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  route TEXT NOT NULL,
  response TEXT CHECK (json_valid(response)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key, route)
) STRICT, WITHOUT ROWID;

CREATE INDEX idempotency_keys_created ON idempotency_keys (created_at);
