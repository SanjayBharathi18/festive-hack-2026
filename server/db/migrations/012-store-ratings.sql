-- Star ratings on store cards and the "Best rated" sort.
-- In this build only demo stores have them, as made-up seed data (docs/demo-data.md).
-- Real ratings come from reviews, which are on the roadmap. A store with no
-- rating has rating_average NULL and rating_count 0, and shows "New".
ALTER TABLE stores ADD COLUMN rating_average REAL CHECK (
  rating_average IS NULL OR (rating_average >= 1 AND rating_average <= 5)
);
ALTER TABLE stores ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0);
