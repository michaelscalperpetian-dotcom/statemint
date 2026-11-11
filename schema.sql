CREATE TABLE IF NOT EXISTS statements (
  id TEXT PRIMARY KEY,
  edit_key TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT, -- short-lived salted hash used only for rate limiting; cleared after 24 hours
  user_id TEXT,     -- the host who made the link
  owner_email TEXT  -- the only Google account (besides the host) that can open it
);
CREATE INDEX IF NOT EXISTS statements_ip_created ON statements (ip_hash, created_at);
-- Existing databases created before ip_hash existed need, once:
--   ALTER TABLE statements ADD COLUMN ip_hash TEXT;
--   CREATE INDEX IF NOT EXISTS statements_ip_created ON statements (ip_hash, created_at);

-- Paid plans. One row per completed Stripe checkout, tied to the account that bought it (user_id).
CREATE TABLE IF NOT EXISTS licenses (
  key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  subscription_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  customer_id TEXT,
  user_id TEXT
);
CREATE INDEX IF NOT EXISTS licenses_subscription ON licenses (subscription_id);
-- Databases created before customer_id existed need, once:
--   ALTER TABLE licenses ADD COLUMN customer_id TEXT;

-- Accounts (Sign in with Google). google_sub is Google's stable user id.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
-- Sessions: only a SHA-256 hash of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
-- Everything the app keeps per account (settings, expenses, notes, branding, saved statements, the CSV, ...).
CREATE TABLE IF NOT EXISTS user_data (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
-- Databases created before accounts existed need, once:
--   ALTER TABLE licenses ADD COLUMN user_id TEXT;
--   ALTER TABLE statements ADD COLUMN user_id TEXT;
--   ALTER TABLE statements ADD COLUMN owner_email TEXT;
CREATE INDEX IF NOT EXISTS licenses_user ON licenses (user_id);
-- Google accounts that have had a plan or free trial (scrambled code only), so the 7-day trial is once per Google account.
CREATE TABLE IF NOT EXISTS trial_uses (code TEXT PRIMARY KEY, used_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS statements_user ON statements (user_id, created_at);
