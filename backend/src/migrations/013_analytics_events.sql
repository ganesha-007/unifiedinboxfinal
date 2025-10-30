-- Analytics Events and Sessions Tables

-- Analytics events table for tracking user actions
CREATE TABLE IF NOT EXISTS analytics_events (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL,
    properties JSONB DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics sessions table for tracking user sessions
CREATE TABLE IF NOT EXISTS analytics_sessions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT UNIQUE NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    page_views INTEGER DEFAULT 0,
    actions INTEGER DEFAULT 0,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_category ON analytics_events(event_category);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_timestamp ON analytics_events(user_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user_id ON analytics_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_start_time ON analytics_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_session_id ON analytics_sessions(session_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_type_timestamp ON analytics_events(user_id, event_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user_start ON analytics_sessions(user_id, start_time);
