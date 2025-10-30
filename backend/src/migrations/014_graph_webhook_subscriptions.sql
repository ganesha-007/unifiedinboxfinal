-- Microsoft Graph webhook subscriptions storage
CREATE TABLE IF NOT EXISTS graph_webhook_subscriptions (
    id SERIAL PRIMARY KEY,
    subscription_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    resource TEXT NOT NULL,
    change_type TEXT NOT NULL,
    notification_url TEXT NOT NULL,
    client_state TEXT NOT NULL,
    expiration_datetime TIMESTAMP NOT NULL,
    application_id TEXT,
    creator_id TEXT,
    latest_supported_tls_version TEXT DEFAULT '1.2',
    lifecycle_notification_url TEXT,
    encryption_certificate TEXT,
    encryption_certificate_id TEXT,
    include_resource_data BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    CONSTRAINT fk_graph_subscriptions_user FOREIGN KEY (user_id) 
        REFERENCES user_credentials(user_id) ON DELETE CASCADE
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_user_id ON graph_webhook_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_subscription_id ON graph_webhook_subscriptions (subscription_id);
CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_expiration ON graph_webhook_subscriptions (expiration_datetime);
CREATE INDEX IF NOT EXISTS idx_graph_subscriptions_status ON graph_webhook_subscriptions (status);

-- Table for storing webhook notification events
CREATE TABLE IF NOT EXISTS graph_webhook_events (
    id SERIAL PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    change_type TEXT NOT NULL,
    client_state TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_data JSONB,
    lifecycle_event TEXT,
    tenant_id TEXT,
    event_time TIMESTAMP NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    CONSTRAINT fk_graph_events_subscription FOREIGN KEY (subscription_id) 
        REFERENCES graph_webhook_subscriptions(subscription_id) ON DELETE CASCADE
);

-- Indexes for efficient event processing
CREATE INDEX IF NOT EXISTS idx_graph_events_subscription_id ON graph_webhook_events (subscription_id);
CREATE INDEX IF NOT EXISTS idx_graph_events_processed ON graph_webhook_events (processed);
CREATE INDEX IF NOT EXISTS idx_graph_events_event_time ON graph_webhook_events (event_time);
CREATE INDEX IF NOT EXISTS idx_graph_events_retry_count ON graph_webhook_events (retry_count);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_graph_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_graph_subscriptions_updated_at
    BEFORE UPDATE ON graph_webhook_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_graph_subscriptions_updated_at();
