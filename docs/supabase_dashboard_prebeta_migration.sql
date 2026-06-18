-- Mage v2: pre-beta dashboard (run after core + metrics migrations)
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT

-- Guest metrics tier (dev_internal excluded from dashboard aggregations)
ALTER TABLE guests ADD COLUMN IF NOT EXISTS account_tier VARCHAR(32) NOT NULL DEFAULT 'pilot_tester';

UPDATE guests SET account_tier = 'dev_internal'
WHERE id IN ('guest-001', 'guest-002');

-- Demo transcript bookmarks for advisor walk-throughs
CREATE TABLE IF NOT EXISTS metrics_transcript_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id VARCHAR(64) NOT NULL,
  session_id VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guest_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_transcript_flags_category
  ON metrics_transcript_flags (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcript_flags_guest
  ON metrics_transcript_flags (guest_id, created_at DESC);
