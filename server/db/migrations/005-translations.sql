-- The translation cache (docs/system.md, "Data" and "Languages"): Sarvam
-- translations of notes, board posts and quote requests, and item names in
-- the buyer's script. hash is the SHA-256 of kind, model, source, target and
-- the original text (server/translate/translation-cache.ts), so the original
-- text is not stored twice. source is the language code of the original, or
-- 'auto'. target is the Sarvam code of the result. Placeholder answers of
-- recorded mode are never stored.
CREATE TABLE translations (
  hash TEXT PRIMARY KEY CHECK (length(hash) = 64),
  kind TEXT NOT NULL CHECK (kind IN ('translate', 'transliterate')),
  model TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
