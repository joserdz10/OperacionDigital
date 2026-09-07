ALTER TABLE stories ADD COLUMN IF NOT EXISTS story_number BIGSERIAL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_story_number ON stories(story_number);

CREATE TABLE IF NOT EXISTS operator_sessions (
  chat_id BIGINT PRIMARY KEY,
  territory_code VARCHAR(32) NOT NULL DEFAULT 'BR-MX-NL',
  identity_code VARCHAR(32) NOT NULL DEFAULT 'NL-01',
  last_story_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discovered_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  external_id TEXT,
  url TEXT,
  canonical_url TEXT,
  title TEXT NOT NULL,
  raw_text TEXT,
  clean_text TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT,
  language VARCHAR(16) DEFAULT 'es',
  status VARCHAR(30) NOT NULL DEFAULT 'new',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS story_sources (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_url TEXT,
  source_tier VARCHAR(8),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (story_id, source_name, source_url)
);

CREATE TABLE IF NOT EXISTS story_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  claim_type VARCHAR(40) NOT NULL DEFAULT 'fact',
  verification_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
  confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence_score BETWEEN 0 AND 1),
  attribution TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  content_type VARCHAR(40) NOT NULL,
  format VARCHAR(40),
  headline TEXT,
  subheadline TEXT,
  body TEXT,
  caption TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'generated',
  generation_model VARCHAR(80),
  prompt_version VARCHAR(40) DEFAULT 'telegram-v0.1',
  media_dna_version INTEGER,
  visual_dna_version INTEGER,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_brain_id UUID NOT NULL REFERENCES territory_brains(id) ON DELETE CASCADE,
  item_type VARCHAR(30) NOT NULL,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  priority NUMERIC(4,3) NOT NULL DEFAULT 0.900 CHECK (priority BETWEEN 0 AND 1),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(territory_brain_id, item_type, normalized_label)
);

CREATE INDEX IF NOT EXISTS idx_discovered_documents_published ON discovered_documents(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_claims_story ON story_claims(story_id);
CREATE INDEX IF NOT EXISTS idx_content_pieces_story_identity ON content_pieces(story_id, identity_id);
