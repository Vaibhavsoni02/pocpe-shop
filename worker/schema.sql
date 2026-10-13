-- Consent audit log: one row per choice the visitor saves (append-only).
CREATE TABLE IF NOT EXISTS consent_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id   TEXT NOT NULL,
  version      TEXT NOT NULL,          -- policy/cookie-list version the visitor saw
  analytics    INTEGER NOT NULL,
  marketing    INTEGER NOT NULL,
  preferences  INTEGER NOT NULL,
  action       TEXT,                   -- accept_all | reject_all | custom
  ts           TEXT NOT NULL,          -- server time of the choice
  reconsent_at TEXT NOT NULL,
  country      TEXT,
  page         TEXT
);
CREATE INDEX IF NOT EXISTS idx_consent_visitor ON consent_events (visitor_id, id);

-- Email preference centre: current state per email (keyed by SHA-256 of the lowercased email).
CREATE TABLE IF NOT EXISTS email_prefs (
  email_hash      TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  visitor_id      TEXT,
  topics          TEXT NOT NULL,       -- JSON array
  frequency       TEXT NOT NULL,
  marketing_optin INTEGER NOT NULL,
  source          TEXT,
  first_ts        TEXT NOT NULL,
  consent_ts      TEXT NOT NULL,       -- last time the person confirmed
  reconsent_at    TEXT NOT NULL        -- when we must ask again
);
CREATE INDEX IF NOT EXISTS idx_email_reconsent ON email_prefs (reconsent_at);

-- Email preference audit log (append-only).
CREATE TABLE IF NOT EXISTS email_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash  TEXT NOT NULL,
  topics      TEXT NOT NULL,
  optin       INTEGER NOT NULL,
  source      TEXT,
  ts          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_events_hash ON email_events (email_hash, id);
