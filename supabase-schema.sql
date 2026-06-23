-- Run this in your Supabase SQL Editor (supabase.com → project → SQL Editor)

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

-- Row Level Security (open read, open write — add auth later if desired)
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read venues"  ON venues FOR SELECT USING (true);
CREATE POLICY "Public insert venues" ON venues FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read deals"   ON deals FOR SELECT USING (true);
CREATE POLICY "Public insert deals" ON deals FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete deals" ON deals FOR DELETE USING (true);
