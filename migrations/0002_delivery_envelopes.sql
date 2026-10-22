ALTER TABLE outbox ADD COLUMN request_json TEXT;
ALTER TABLE outbox ADD COLUMN first_attempt_at INTEGER;
CREATE TABLE send_budget (day TEXT PRIMARY KEY, attempts INTEGER NOT NULL);
