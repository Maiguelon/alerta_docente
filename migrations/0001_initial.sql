CREATE TABLE vacancies (
  vacancy_key TEXT PRIMARY KEY, board INTEGER NOT NULL,
  fingerprint TEXT NOT NULL, version INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  payload TEXT NOT NULL, observed_at INTEGER NOT NULL
);
CREATE TABLE outbox (
  event_id TEXT PRIMARY KEY,
  vacancy_key TEXT NOT NULL REFERENCES vacancies(vacancy_key),
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'sending', 'sent', 'expired', 'failed', 'uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL, lease_until INTEGER,
  provider_id TEXT, error_code TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX outbox_ready ON outbox(state, next_attempt_at);
CREATE TABLE monitor_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
