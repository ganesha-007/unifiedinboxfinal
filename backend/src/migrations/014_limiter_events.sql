-- Log limiter events for observability
CREATE TABLE IF NOT EXISTS limiter_events (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  mailbox_id TEXT,
  provider TEXT DEFAULT 'email',
  code TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_limiter_events_user_created ON limiter_events(user_id, created_at DESC);


