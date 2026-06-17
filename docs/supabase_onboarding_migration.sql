-- Mage v2: Onboarding layer — staff members, email verifications, task-assist threads
-- Run AFTER:
--   1. docs/supabase_core_migration.sql
--   2. docs/supabase_properties_auth_knowledge_migration.sql
--   3. docs/supabase_staff_actions_migration.sql
--   4. docs/supabase_metrics_migration.sql
-- This migration is additive only. Safe to re-run (all statements are IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- Additive columns on existing tables
-- ---------------------------------------------------------------------------

-- guests: multi-tenant property scoping (may already exist in some deployments)
ALTER TABLE guests ADD COLUMN IF NOT EXISTS property_id VARCHAR(64);

-- auth_tokens: single-use enforcement
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- staff_members
-- Stores staff registration requests and approved staff accounts.
-- access_key_hash: SHA-256 hex of the raw one-time access key, set on approval.
-- staff_code: human-readable short code shown to staff at request time (e.g. STF-A7K2).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id),
  staff_code VARCHAR(32) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),                              -- collected at request time; used to email the access key on approval
  requested_role VARCHAR(32) NOT NULL,  -- manager | front_desk | maintenance | housekeeping | room_service
  approved_role VARCHAR(32),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  access_key_hash VARCHAR(128),                    -- SHA-256 hex; null until approved
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by VARCHAR(255),
  UNIQUE (property_id, staff_code)
);

CREATE INDEX IF NOT EXISTS idx_staff_members_property_status
  ON staff_members (property_id, status);

CREATE INDEX IF NOT EXISTS idx_staff_members_access_key_hash
  ON staff_members (access_key_hash)
  WHERE access_key_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- email_verifications
-- Short-lived tokens for guest email proof before issuing a magic link.
-- token_hash: SHA-256 hex of the raw token sent to the guest.
-- verified_at: set when token is consumed; null means not yet verified.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  property_id VARCHAR(64) NOT NULL,
  booking_id VARCHAR(128) NOT NULL,
  guest_data JSONB NOT NULL DEFAULT '{}',          -- {name, email, booking_id, room_number, check_in, check_out, property_id}
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_token
  ON email_verifications (token_hash);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email_property
  ON email_verifications (email, property_id);

-- ---------------------------------------------------------------------------
-- staff_task_assist_threads
-- Persists Help-desk chat threads scoped to a kanban task (action_id) and
-- optionally a staff member. messages_json is an ordered list of chat turns.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_task_assist_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id VARCHAR(64) NOT NULL,
  staff_member_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  property_id VARCHAR(64) NOT NULL,
  messages_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (action_id, staff_member_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assist_action
  ON staff_task_assist_threads (action_id);

CREATE INDEX IF NOT EXISTS idx_task_assist_property
  ON staff_task_assist_threads (property_id);
