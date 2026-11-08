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

-- Paid plans. One row per completed Stripe checkout; the key is what unlocks the app in a browser.
CREATE TABLE IF NOT EXISTS licenses (
  key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  subscription_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  customer_id TEXT
);
CREATE INDEX IF NOT EXISTS licenses_subscription ON licenses (subscription_id);
-- Databases created before customer_id existed need, once:
--   ALTER TABLE licenses ADD COLUMN customer_id TEXT;
