CREATE TABLE IF NOT EXISTS statements (
  id TEXT PRIMARY KEY,
  edit_key TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT -- short-lived salted hash used only for rate limiting; cleared after 24 hours
);
CREATE INDEX IF NOT EXISTS statements_ip_created ON statements (ip_hash, created_at);
-- Existing databases created before ip_hash existed need, once:
--   ALTER TABLE statements ADD COLUMN ip_hash TEXT;
--   CREATE INDEX IF NOT EXISTS statements_ip_created ON statements (ip_hash, created_at);
