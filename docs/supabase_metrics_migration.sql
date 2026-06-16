-- Mage v2: analytics / metrics tables (run after core migrations)
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT

-- ---------------------------------------------------------------------------
-- Runtime toggle (env METRICS_TRACKING_ENABLED is the master switch)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metrics_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO metrics_config (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Per-event metrics log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metrics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  guest_id VARCHAR(64),
  property_id VARCHAR(64),
  abilities TEXT[],
  ability_executed VARCHAR(8),
  confidence FLOAT,
  request_type VARCHAR(32),
  escalation_type VARCHAR(32),
  salvaged BOOLEAN,
  classifier_model VARCHAR(128),
  copy_model VARCHAR(128),
  prompt_cache_hit BOOLEAN,
  fallback_used BOOLEAN,
  classifier_latency_ms INT,
  copy_latency_ms INT,
  total_latency_ms INT,
  success BOOLEAN,
  error_code VARCHAR(64),
  staff_action_logged BOOLEAN,
  happiness_score INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_events_created
  ON metrics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_events_type
  ON metrics_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_events_property
  ON metrics_events (property_id, created_at DESC);
