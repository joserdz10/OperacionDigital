CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE territory_brains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_brain_id UUID REFERENCES territory_brains(id) ON DELETE SET NULL,
  code VARCHAR(32) NOT NULL UNIQUE,
  brain_type VARCHAR(20) NOT NULL CHECK (brain_type IN ('national','state')),
  country_code CHAR(2) NOT NULL DEFAULT 'MX',
  state_code VARCHAR(8),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_brain_id UUID NOT NULL REFERENCES territory_brains(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(160),
  working_name VARCHAR(160) NOT NULL,
  slug VARCHAR(160) UNIQUE,
  identity_type VARCHAR(40) NOT NULL,
  positioning TEXT,
  audience TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE media_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  mission TEXT,
  tone JSONB NOT NULL DEFAULT '[]'::jsonb,
  writing_style JSONB NOT NULL DEFAULT '{}'::jsonb,
  headline_style VARCHAR(80),
  reading_level VARCHAR(40),
  editorial_priorities JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_mix JSONB NOT NULL DEFAULT '{}'::jsonb,
  national_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  emoji_policy VARCHAR(40) DEFAULT 'minimal',
  clickbait_level VARCHAR(40) DEFAULT 'low',
  fact_check_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(identity_id, version)
);

CREATE TABLE visual_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  visual_family VARCHAR(120),
  brand_personality JSONB NOT NULL DEFAULT '[]'::jsonb,
  colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  typography JSONB NOT NULL DEFAULT '{}'::jsonb,
  photo_style JSONB NOT NULL DEFAULT '{}'::jsonb,
  graphic_style JSONB NOT NULL DEFAULT '{}'::jsonb,
  footer_style JSONB NOT NULL DEFAULT '{}'::jsonb,
  motion_style JSONB NOT NULL DEFAULT '{}'::jsonb,
  assets JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(identity_id, version)
);

CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_brain_id UUID NOT NULL REFERENCES territory_brains(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  topic_type VARCHAR(60) NOT NULL DEFAULT 'issue',
  description TEXT,
  priority NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (priority BETWEEN 0 AND 1),
  monitor_enabled BOOLEAN NOT NULL DEFAULT true,
  semantic_queries JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(territory_brain_id, slug)
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_brain_id UUID NOT NULL REFERENCES territory_brains(id) ON DELETE CASCADE,
  code VARCHAR(32) UNIQUE,
  profile_type VARCHAR(40) NOT NULL,
  name VARCHAR(180) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  description TEXT,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  importance NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (importance BETWEEN 0 AND 1),
  monitor_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(territory_brain_id, slug)
);

CREATE TABLE profile_topics (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  relation_type VARCHAR(60) NOT NULL DEFAULT 'related',
  weight NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (weight BETWEEN 0 AND 1),
  PRIMARY KEY(profile_id, topic_id)
);

CREATE TABLE identity_topic_subscriptions (
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  priority NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (priority BETWEEN 0 AND 1),
  editorial_lens JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_generate BOOLEAN NOT NULL DEFAULT false,
  auto_publish BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(identity_id, topic_id)
);

CREATE TABLE national_feed_policies (
  identity_id UUID PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  politics_weight NUMERIC(4,3) NOT NULL DEFAULT 0,
  economy_weight NUMERIC(4,3) NOT NULL DEFAULT 0,
  security_weight NUMERIC(4,3) NOT NULL DEFAULT 0,
  society_weight NUMERIC(4,3) NOT NULL DEFAULT 0,
  sports_weight NUMERIC(4,3) NOT NULL DEFAULT 0,
  entertainment_weight NUMERIC(4,3) NOT NULL DEFAULT 0,
  technology_weight NUMERIC(4,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (politics_weight BETWEEN 0 AND 1),
  CHECK (economy_weight BETWEEN 0 AND 1),
  CHECK (security_weight BETWEEN 0 AND 1),
  CHECK (society_weight BETWEEN 0 AND 1),
  CHECK (sports_weight BETWEEN 0 AND 1),
  CHECK (entertainment_weight BETWEEN 0 AND 1),
  CHECK (technology_weight BETWEEN 0 AND 1)
);

CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_brain_id UUID REFERENCES territory_brains(id) ON DELETE SET NULL,
  name VARCHAR(180) NOT NULL,
  domain VARCHAR(180),
  source_type VARCHAR(60) NOT NULL,
  territory_scope VARCHAR(40) NOT NULL DEFAULT 'state',
  reliability_score NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (reliability_score BETWEEN 0 AND 1),
  monitor_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_brain_id UUID NOT NULL REFERENCES territory_brains(id) ON DELETE RESTRICT,
  canonical_story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  scope VARCHAR(30) NOT NULL CHECK (scope IN ('national','state','municipal','international')),
  title TEXT NOT NULL,
  summary TEXT,
  category VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'detected' CHECK (status IN ('detected','developing','verified','ready','archived')),
  importance_score NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (importance_score BETWEEN 0 AND 1),
  confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence_score BETWEEN 0 AND 1),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE story_territories (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  territory_brain_id UUID NOT NULL REFERENCES territory_brains(id) ON DELETE CASCADE,
  relevance_score NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (relevance_score BETWEEN 0 AND 1),
  local_angle TEXT,
  PRIMARY KEY(story_id, territory_brain_id)
);

CREATE TABLE story_topics (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  relevance_score NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (relevance_score BETWEEN 0 AND 1),
  PRIMARY KEY(story_id, topic_id)
);

CREATE TABLE story_profiles (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relation VARCHAR(80) NOT NULL DEFAULT 'mentioned',
  relevance_score NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (relevance_score BETWEEN 0 AND 1),
  PRIMARY KEY(story_id, profile_id)
);

CREATE TABLE identity_story_scores (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  territory_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  topic_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  profile_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  national_feed_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  editorial_priority_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  relevance_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  priority_label VARCHAR(20) NOT NULL DEFAULT 'IGNORE',
  recommended_angle TEXT,
  recommended_format VARCHAR(60),
  decision VARCHAR(30) NOT NULL DEFAULT 'IGNORE',
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(story_id, identity_id)
);

CREATE INDEX idx_topics_brain ON topics(territory_brain_id);
CREATE INDEX idx_profiles_brain ON profiles(territory_brain_id);
CREATE INDEX idx_sources_brain ON sources(territory_brain_id);
CREATE INDEX idx_stories_origin ON stories(origin_brain_id);
CREATE INDEX idx_stories_status ON stories(status);
CREATE INDEX idx_story_territories_brain ON story_territories(territory_brain_id, relevance_score DESC);
CREATE INDEX idx_identity_story_scores_identity ON identity_story_scores(identity_id, relevance_score DESC);
