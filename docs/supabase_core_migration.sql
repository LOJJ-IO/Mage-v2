-- Mage v2: core chat + guest tables (run FIRST in Supabase SQL editor)
-- Then run:
--   1. docs/supabase_properties_auth_knowledge_migration.sql
--   2. docs/supabase_staff_actions_migration.sql (safe if columns already exist)

-- ---------------------------------------------------------------------------
-- Guests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guests (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  room_number VARCHAR(32) NOT NULL DEFAULT '',
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ NOT NULL,
  booking_id VARCHAR(128) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(64),
  membership_tier VARCHAR(64),
  happiness_score INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE guests ADD COLUMN IF NOT EXISTS happiness_score INT;

CREATE INDEX IF NOT EXISTS idx_guests_booking ON guests (booking_id);

-- ---------------------------------------------------------------------------
-- Conversations (guest + staff chat history)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id VARCHAR(64) NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_guest_created
  ON conversations (guest_id, created_at);

-- ---------------------------------------------------------------------------
-- Staff inbox
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_actions (
  id VARCHAR(64) PRIMARY KEY,
  guest_id VARCHAR(64) NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  action_type VARCHAR(64) NOT NULL,
  summary TEXT NOT NULL,
  source_message TEXT NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  guest_name VARCHAR(255),
  room_number VARCHAR(32),
  escalation_type VARCHAR(32) NOT NULL DEFAULT 'normal',
  allow_staff_jump_in BOOLEAN NOT NULL DEFAULT true,
  guest_conversation_thread_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_staff_actions_guest
  ON staff_actions (guest_id);

CREATE INDEX IF NOT EXISTS idx_staff_actions_status
  ON staff_actions (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id VARCHAR(64) PRIMARY KEY,
  guest_id VARCHAR(64) NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  issue TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  assigned_to VARCHAR(255),
  assigned_type VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_tickets_guest ON tickets (guest_id);

-- ---------------------------------------------------------------------------
-- Agent availability (single-row table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  human_agent_available BOOLEAN NOT NULL DEFAULT false,
  ai_agent_available BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO agent_availability (human_agent_available, ai_agent_available)
SELECT false, true
WHERE NOT EXISTS (SELECT 1 FROM agent_availability LIMIT 1);
