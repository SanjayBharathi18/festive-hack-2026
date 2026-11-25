-- Idempotency keys belong to one caller and one request (see
-- server/http/idempotency.ts). The table is made again, because the scope is
-- part of the primary key. Keys stored before this change have no request
-- hash, so they are dropped: a retry of such a request runs again.
--
-- scope         '' when no middleware set one, else the caller, for example
--               the desk store id.
-- request_hash  SHA-256 (hex) of the query string and the body.
-- response      NULL while the first request runs, then the JSON
--               {"status", "type", "body", "cookies", "location"}.

DROP TABLE idempotency_keys;

CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response TEXT CHECK (json_valid(response)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key, scope, route)
) STRICT, WITHOUT ROWID;

CREATE INDEX idempotency_keys_created ON idempotency_keys (created_at);
