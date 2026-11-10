CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_salt CHAR(32) NOT NULL,
  password_hash CHAR(128) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  county VARCHAR(80) NOT NULL,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  farm_size VARCHAR(30) NOT NULL DEFAULT '',
  crops VARCHAR(300) NOT NULL DEFAULT '',
  expected_harvest DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS expected_harvest DATE;

CREATE TABLE IF NOT EXISTS market_reports (
  id UUID PRIMARY KEY,
  crop VARCHAR(80) NOT NULL,
  market VARCHAR(80) NOT NULL,
  county VARCHAR(80) NOT NULL DEFAULT '',
  unit VARCHAR(30) NOT NULL,
  price NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  reported_by TEXT NOT NULL,
  reporter_name VARCHAR(80) NOT NULL DEFAULT 'Farmer',
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS market_reports_reported_by_date_idx
  ON market_reports (reported_by, reported_at DESC);

CREATE INDEX IF NOT EXISTS market_reports_verified_crop_market_idx
  ON market_reports (LOWER(crop), LOWER(market))
  WHERE status = 'verified';
