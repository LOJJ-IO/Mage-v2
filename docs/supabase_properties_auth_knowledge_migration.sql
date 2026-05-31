-- Mage v2: properties, guest auth, and hotel knowledge infrastructure
-- Run in Supabase SQL editor after existing guests/tickets tables.

-- ---------------------------------------------------------------------------
-- Properties (multi-tenant hub)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS properties (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(128) UNIQUE NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Edmonton',
  profile VARCHAR(32) NOT NULL DEFAULT 'full_service',
  pms_type VARCHAR(32) NOT NULL DEFAULT 'mock',
  knowledge_mode VARCHAR(32) NOT NULL DEFAULT 'demo_file',
  published_snapshot_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  pms_type VARCHAR(32) NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}',
  webhook_secret VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, pms_type)
);

-- ---------------------------------------------------------------------------
-- Guest auth
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_property_booking
  ON auth_tokens (property_id, booking_id);

CREATE TABLE IF NOT EXISTS guest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id VARCHAR(64) NOT NULL,
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  session_version INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_guest
  ON guest_sessions (guest_id, property_id);

-- Extend guests for property scope + PMS linkage
ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS property_id VARCHAR(64) REFERENCES properties(id),
  ADD COLUMN IF NOT EXISTS pms_booking_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS pms_guest_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_guests_property ON guests (property_id);
CREATE INDEX IF NOT EXISTS idx_guests_pms_booking ON guests (property_id, pms_booking_id);

-- ---------------------------------------------------------------------------
-- Hotel knowledge
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_schema_versions (
  version VARCHAR(16) PRIMARY KEY,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO knowledge_schema_versions (version, description)
VALUES ('v1', 'Initial canonical slot schema')
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS property_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  slot_key VARCHAR(255) NOT NULL,
  value JSONB,
  status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  confidence REAL,
  source_url TEXT,
  source_snippet TEXT,
  effective_from TIMESTAMPTZ,
  effective_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(64),
  UNIQUE (property_id, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_property_facts_property
  ON property_facts (property_id);

CREATE TABLE IF NOT EXISTS property_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  entity_type VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  slot_key VARCHAR(255) NOT NULL,
  value JSONB,
  status VARCHAR(32) NOT NULL DEFAULT 'filled',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(64),
  UNIQUE (property_id, slot_key)
);

CREATE TABLE IF NOT EXISTS knowledge_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  schema_version VARCHAR(16) NOT NULL DEFAULT 'v1',
  markdown TEXT NOT NULL DEFAULT '',
  tree_json JSONB NOT NULL DEFAULT '[]',
  faq_json JSONB NOT NULL DEFAULT '[]',
  facts_json JSONB NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_snapshots_property
  ON knowledge_snapshots (property_id, published_at DESC);

-- Crawl pipeline
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id VARCHAR(64) NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  seed_url TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  pages_discovered INT NOT NULL DEFAULT 0,
  pages_extracted INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crawl_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_type VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'discovered',
  raw_html TEXT,
  extracted_facts JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_pages_job ON crawl_pages (job_id);

-- Seed Grand Horizon demo property
INSERT INTO properties (id, name, slug, timezone, profile, pms_type, knowledge_mode)
VALUES (
  'grand-horizon',
  'The Grand Horizon Hotel',
  'grand-horizon',
  'America/Edmonton',
  'full_service',
  'mock',
  'demo_file'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO property_integrations (property_id, pms_type, config_json)
VALUES ('grand-horizon', 'mock', '{"fixture": "default"}')
ON CONFLICT (property_id, pms_type) DO NOTHING;
