-- What serving staff and live counters add to the price of each plate or
-- guest of a package. Delivery is the package price.
ALTER TABLE packages ADD COLUMN staff_extra INTEGER NOT NULL DEFAULT 0
  CHECK (staff_extra >= 0);
ALTER TABLE packages ADD COLUMN counters_extra INTEGER NOT NULL DEFAULT 0
  CHECK (counters_extra >= 0);

-- The buyer no longer chooses a food type: the dishes show their marks. The
-- requests before this had no extra for their service style.
UPDATE quote_requests
SET payload = json_set(json_remove(payload, '$.event.food_type'),
  '$.service_extra', 0)
WHERE kind = 'catering';
