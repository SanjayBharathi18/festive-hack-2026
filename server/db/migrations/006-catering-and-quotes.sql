-- Catering packages and quote requests (docs/system.md, "Data"). The
-- encodings of 001-must-tables.sql apply.
--
--   kind            plate (a price for each plate) or buffet (a price for each
--                   guest).
--   price           paise for one plate or one guest. NULL is "Price on
--                   request".
--   min_count       the fewest plates or guests.
--   free_choice     1: the host picks any dishes, with no limits.
--   max_total       the most dishes of the plate. NULL is no total limit.
--   service_styles  TEXT JSON array of delivery, staff and live_counters.
--   position        the order in which the seller lists them.
--   max             the most dishes of a category. NULL is no limit.
--   jain            1: the dish is Jain food.
--   payload         TEXT JSON of the request, as quotePayloadSchema in
--                   shared/quotes.ts gives it.
--   language        the app language of the buyer's page.

CREATE TABLE packages (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('plate', 'buffet')),
  name TEXT NOT NULL CHECK (name <> ''),
  price INTEGER CHECK (price >= 0),
  min_count INTEGER NOT NULL CHECK (min_count > 0),
  free_choice INTEGER NOT NULL DEFAULT 0 CHECK (free_choice IN (0, 1)),
  max_total INTEGER CHECK (max_total > 0),
  service_styles TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(service_styles) AND json_type(service_styles) = 'array'
  ),
  position INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX packages_store ON packages (store_id, position);

CREATE TABLE package_categories (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name <> ''),
  min INTEGER NOT NULL DEFAULT 0 CHECK (min >= 0),
  max INTEGER CHECK (max > 0 AND max >= min),
  position INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX package_categories_package ON package_categories (package_id, position);

CREATE TABLE package_dishes (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES package_categories (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name <> ''),
  veg_mark TEXT NOT NULL CHECK (veg_mark IN ('veg', 'non_veg', 'egg')),
  jain INTEGER NOT NULL DEFAULT 0 CHECK (jain IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX package_dishes_category ON package_dishes (category_id, position);

CREATE TABLE quote_requests (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bulk', 'catering', 'board_post')),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  buyer_name TEXT NOT NULL CHECK (buyer_name <> ''),
  buyer_phone TEXT NOT NULL CHECK (
    buyer_phone GLOB '+[1-9]*' AND buyer_phone NOT GLOB '+*[^0-9]*'
    AND length(buyer_phone) BETWEEN 8 AND 16
  ),
  language TEXT NOT NULL CHECK (language IN ('en', 'hi', 'kn', 'ta', 'te', 'mr')),
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX quote_requests_store ON quote_requests (store_id, created_at);
