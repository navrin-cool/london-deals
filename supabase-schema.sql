-- Run this in your Supabase SQL Editor (supabase.com → project → SQL Editor)
-- Safe to run multiple times — drops existing policies before recreating them

CREATE TABLE IF NOT EXISTS venues (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  address    TEXT        NOT NULL DEFAULT 'London',
  lat        NUMERIC(10, 7) NOT NULL,
  lng        NUMERIC(10, 7) NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'bar',
  osm_id     TEXT        UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  day_of_week TEXT        NOT NULL CHECK (day_of_week IN (
    'monday','tuesday','wednesday','thursday','friday','saturday','sunday'
  )),
  description TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_venue_id    ON deals(venue_id);
CREATE INDEX IF NOT EXISTS idx_deals_day_of_week ON deals(day_of_week);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals  ENABLE ROW LEVEL SECURITY;

-- Drop policies first so re-running never errors
DROP POLICY IF EXISTS "Public read venues"   ON venues;
DROP POLICY IF EXISTS "Public insert venues" ON venues;
DROP POLICY IF EXISTS "Public read deals"    ON deals;
DROP POLICY IF EXISTS "Public insert deals"  ON deals;
DROP POLICY IF EXISTS "Public delete deals"  ON deals;

CREATE POLICY "Public read venues"   ON venues FOR SELECT USING (true);
CREATE POLICY "Public insert venues" ON venues FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read deals"    ON deals  FOR SELECT USING (true);
CREATE POLICY "Public insert deals"  ON deals  FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete deals"  ON deals  FOR DELETE USING (true);

-- ─── Performance indexes ─────────────────────────────────────────────────────
-- Required before the bulk import for fast search and nearby queries.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm ON venues USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_venues_lat_lng   ON venues (lat, lng);

-- ─── Comments ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     UUID        NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  author_name  TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  likes        INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_venue_id ON comments(venue_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read comments"   ON comments;
DROP POLICY IF EXISTS "Public insert comments" ON comments;
DROP POLICY IF EXISTS "Public delete comments" ON comments;

CREATE POLICY "Public read comments"   ON comments FOR SELECT USING (true);
CREATE POLICY "Public insert comments" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete comments" ON comments FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION increment_comment_likes(comment_id uuid)
RETURNS void AS $$
  UPDATE comments SET likes = likes + 1 WHERE id = comment_id;
$$ LANGUAGE sql;

-- ─── Deal time windows ────────────────────────────────────────────────────────
-- Run this once to add optional start/end times to existing deals tables.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS end_time   TIME;
