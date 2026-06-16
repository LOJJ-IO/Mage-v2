-- Mage v2: staff_actions escalation columns (run in Supabase SQL editor)
-- Run AFTER docs/supabase_core_migration.sql (columns may already exist on fresh install).
ALTER TABLE staff_actions
  ADD COLUMN IF NOT EXISTS escalation_type VARCHAR(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS allow_staff_jump_in BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS guest_conversation_thread_id VARCHAR(255);

-- Backfill thread id from guest_id for existing rows
UPDATE staff_actions
SET guest_conversation_thread_id = guest_id
WHERE guest_conversation_thread_id IS NULL;
