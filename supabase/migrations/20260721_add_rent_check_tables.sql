-- Rent Check: seed benchmarks + anonymous user submissions
-- Run in Supabase SQL editor. Safe to re-run.

-- 1. Rental benchmarks (admin-managed seed data from public sources)
CREATE TABLE IF NOT EXISTS rental_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  area TEXT NOT NULL,                    -- suburb/area name e.g. 'Sea Point'
  region TEXT NOT NULL DEFAULT 'Cape Town', -- metro region
  bedrooms INT NOT NULL,                 -- 0 = studio, 1, 2, 3, 4+
  median_rent INT NOT NULL,              -- monthly rent in rands (NOT cents)
  range_low INT NOT NULL,
  range_high INT NOT NULL,
  vacancy_pct NUMERIC(4,1),              -- e.g. 3.5
  yoy_growth_pct NUMERIC(4,1),           -- e.g. 7.0
  source TEXT,                           -- e.g. 'PayProp Q4 2025, Indlu Q1 2026'
  source_date DATE,                      -- when the source data was published
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(area, region, bedrooms)
);

-- 2. Anonymous rent submissions (no auth required)
CREATE TABLE IF NOT EXISTS rent_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  area TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'Cape Town',
  bedrooms INT NOT NULL,
  monthly_rent INT NOT NULL,             -- rands
  submitted_at TIMESTAMPTZ DEFAULT now(),
  ip_hash TEXT                           -- hashed IP for rate limiting, not PII
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_benchmarks_area_beds ON rental_benchmarks(area, bedrooms);
CREATE INDEX IF NOT EXISTS idx_submissions_area_beds ON rent_submissions(area, bedrooms);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted ON rent_submissions(submitted_at);

-- RLS
ALTER TABLE rental_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_submissions ENABLE ROW LEVEL SECURITY;

-- Benchmarks: public read, no write (admin writes via service role)
DROP POLICY IF EXISTS "Anyone can read benchmarks" ON rental_benchmarks;
CREATE POLICY "Anyone can read benchmarks"
  ON rental_benchmarks FOR SELECT
  USING (true);

-- Submissions: anyone can insert, no one can read (admin reads via service role)
DROP POLICY IF EXISTS "Anyone can submit rent" ON rent_submissions;
CREATE POLICY "Anyone can submit rent"
  ON rent_submissions FOR INSERT
  WITH CHECK (true);

-- Seed data: Cape Town suburbs from PayProp, Indlu/Skynode, Africanvestor (Q1 2026)
-- Amounts in rands. bedrooms: 0=studio, 1, 2, 3, 4
INSERT INTO rental_benchmarks (area, region, bedrooms, median_rent, range_low, range_high, vacancy_pct, yoy_growth_pct, source, source_date)
VALUES
  -- CBD & City Bowl
  ('CBD & City Bowl', 'Cape Town', 0, 9500, 7000, 14000, 4.0, 7.0, 'Indlu Q1 2026, Africanvestor Jul 2026', '2026-03-01'),
  ('CBD & City Bowl', 'Cape Town', 1, 9500, 7000, 14000, 4.0, 7.0, 'Indlu Q1 2026', '2026-03-01'),
  ('CBD & City Bowl', 'Cape Town', 2, 14000, 10000, 22000, 4.0, 7.0, 'Indlu Q1 2026', '2026-03-01'),
  ('CBD & City Bowl', 'Cape Town', 3, 20000, 15000, 30000, 4.0, 7.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Sea Point
  ('Sea Point', 'Cape Town', 0, 10000, 7500, 15000, 3.0, 8.0, 'Africanvestor Jul 2026, PayProp Q4 2025', '2026-03-01'),
  ('Sea Point', 'Cape Town', 1, 12000, 8500, 18000, 3.0, 8.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Sea Point', 'Cape Town', 2, 18000, 13000, 28000, 4.0, 8.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Sea Point', 'Cape Town', 3, 28000, 20000, 50000, 5.0, 7.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Green Point
  ('Green Point', 'Cape Town', 1, 12000, 8500, 18000, 3.5, 8.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Green Point', 'Cape Town', 2, 18000, 13000, 28000, 4.0, 8.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Gardens
  ('Gardens', 'Cape Town', 1, 11000, 8000, 16000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Gardens', 'Cape Town', 2, 16000, 11000, 24000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Camps Bay
  ('Camps Bay', 'Cape Town', 2, 35000, 25000, 55000, 5.0, 6.0, 'Indlu Q1 2026, Africanvestor Jul 2026', '2026-03-01'),
  ('Camps Bay', 'Cape Town', 3, 50000, 35000, 70000, 6.0, 5.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Woodstock
  ('Woodstock', 'Cape Town', 1, 9000, 6500, 13000, 3.0, 8.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Woodstock', 'Cape Town', 2, 13000, 9000, 18000, 3.5, 8.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Observatory
  ('Observatory', 'Cape Town', 1, 8000, 5500, 11000, 3.0, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Observatory', 'Cape Town', 2, 12000, 8500, 16000, 3.0, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Claremont
  ('Claremont', 'Cape Town', 1, 7500, 5500, 10000, 3.5, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Claremont', 'Cape Town', 2, 11000, 8000, 15000, 3.5, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Claremont', 'Cape Town', 3, 18000, 14000, 25000, 4.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Claremont', 'Cape Town', 4, 25000, 18000, 35000, 4.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Rondebosch
  ('Rondebosch', 'Cape Town', 1, 7500, 5500, 10000, 3.5, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Rondebosch', 'Cape Town', 2, 11000, 8000, 15000, 3.5, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Rondebosch', 'Cape Town', 3, 18000, 14000, 25000, 4.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Newlands
  ('Newlands', 'Cape Town', 2, 12000, 8500, 16000, 3.5, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Newlands', 'Cape Town', 3, 20000, 15000, 28000, 4.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Constantia
  ('Constantia', 'Cape Town', 3, 25000, 18000, 35000, 4.5, 5.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Constantia', 'Cape Town', 4, 35000, 25000, 50000, 5.0, 5.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Century City
  ('Century City', 'Cape Town', 1, 8500, 6000, 12000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Century City', 'Cape Town', 2, 12000, 9000, 16000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Bellville
  ('Bellville', 'Cape Town', 1, 6000, 4500, 8000, 5.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Bellville', 'Cape Town', 2, 8500, 6500, 11000, 5.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Bellville', 'Cape Town', 3, 12000, 9000, 16000, 5.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Bellville', 'Cape Town', 4, 16000, 12000, 22000, 5.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Durbanville
  ('Durbanville', 'Cape Town', 1, 6500, 4500, 8500, 4.5, 6.5, 'Indlu Q1 2026', '2026-03-01'),
  ('Durbanville', 'Cape Town', 2, 9000, 7000, 12000, 4.5, 6.5, 'Indlu Q1 2026', '2026-03-01'),
  ('Durbanville', 'Cape Town', 3, 13000, 10000, 17000, 5.0, 6.5, 'Indlu Q1 2026', '2026-03-01'),
  ('Durbanville', 'Cape Town', 4, 17000, 13000, 23000, 5.0, 6.5, 'Indlu Q1 2026', '2026-03-01'),

  -- Brackenfell
  ('Brackenfell', 'Cape Town', 2, 8000, 6000, 10500, 5.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Brackenfell', 'Cape Town', 3, 11000, 8500, 14500, 5.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Goodwood
  ('Goodwood', 'Cape Town', 1, 5500, 4000, 7500, 5.0, 5.5, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Goodwood', 'Cape Town', 2, 8000, 6000, 10500, 5.0, 5.5, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Parklands
  ('Parklands', 'Cape Town', 1, 6500, 5000, 8500, 4.5, 6.5, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Parklands', 'Cape Town', 2, 9500, 7000, 12500, 4.5, 6.5, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Parklands', 'Cape Town', 3, 13000, 10000, 17000, 5.0, 6.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Table View / Blouberg
  ('Table View', 'Cape Town', 1, 7000, 5000, 9500, 5.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Table View', 'Cape Town', 2, 10000, 7500, 13000, 5.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Table View', 'Cape Town', 3, 14000, 10500, 18000, 5.0, 6.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Pinelands
  ('Pinelands', 'Cape Town', 2, 10500, 7500, 14000, 4.0, 6.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Pinelands', 'Cape Town', 3, 16000, 12000, 22000, 4.0, 6.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Somerset West
  ('Somerset West', 'Cape Town', 1, 6500, 5000, 8500, 5.5, 7.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Somerset West', 'Cape Town', 2, 9000, 7000, 12000, 5.5, 7.0, 'Indlu Q1 2026', '2026-03-01'),
  ('Somerset West', 'Cape Town', 3, 13000, 10000, 18000, 6.0, 7.0, 'Indlu Q1 2026', '2026-03-01'),

  -- Strand
  ('Strand', 'Cape Town', 1, 6000, 4500, 8000, 6.0, 6.5, 'Indlu Q1 2026', '2026-03-01'),
  ('Strand', 'Cape Town', 2, 8500, 6500, 11000, 6.0, 6.5, 'Indlu Q1 2026', '2026-03-01'),
  ('Strand', 'Cape Town', 3, 12000, 9000, 16000, 6.5, 6.5, 'Indlu Q1 2026', '2026-03-01'),

  -- Hout Bay
  ('Hout Bay', 'Cape Town', 2, 14000, 10000, 20000, 5.0, 6.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Hout Bay', 'Cape Town', 3, 22000, 16000, 32000, 5.0, 6.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- De Waterkant
  ('De Waterkant', 'Cape Town', 1, 13000, 9000, 18000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('De Waterkant', 'Cape Town', 2, 20000, 14000, 30000, 4.5, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Kenilworth
  ('Kenilworth', 'Cape Town', 2, 10000, 7500, 13500, 4.0, 5.5, 'Indlu Q1 2026', '2026-03-01'),
  ('Kenilworth', 'Cape Town', 3, 16000, 12000, 22000, 4.0, 5.5, 'Indlu Q1 2026', '2026-03-01'),

  -- Mowbray
  ('Mowbray', 'Cape Town', 1, 7000, 5000, 9500, 3.5, 6.5, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Mowbray', 'Cape Town', 2, 10000, 7500, 13500, 3.5, 6.5, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Wynberg
  ('Wynberg', 'Cape Town', 1, 6500, 4500, 9000, 4.5, 5.5, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Wynberg', 'Cape Town', 2, 9500, 7000, 13000, 4.5, 5.5, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Muizenberg
  ('Muizenberg', 'Cape Town', 1, 7000, 5000, 9500, 5.0, 6.5, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Muizenberg', 'Cape Town', 2, 10000, 7500, 14000, 5.0, 6.5, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Muizenberg', 'Cape Town', 3, 14000, 10000, 20000, 5.5, 6.5, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Fish Hoek
  ('Fish Hoek', 'Cape Town', 2, 9000, 6500, 12000, 5.5, 5.5, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Fish Hoek', 'Cape Town', 3, 13000, 9500, 17000, 5.5, 5.5, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Stellenbosch (wider Western Cape)
  ('Stellenbosch', 'Western Cape', 1, 7500, 5000, 10500, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Stellenbosch', 'Western Cape', 2, 11000, 8000, 15000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Stellenbosch', 'Western Cape', 3, 16000, 12000, 22000, 4.5, 7.0, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Paarl
  ('Paarl', 'Western Cape', 2, 8500, 6000, 11500, 5.5, 5.5, 'Africanvestor Jul 2026', '2026-03-01'),
  ('Paarl', 'Western Cape', 3, 12000, 9000, 16000, 5.5, 5.5, 'Africanvestor Jul 2026', '2026-03-01'),

  -- Kraaifontein
  ('Kraaifontein', 'Cape Town', 2, 7000, 5000, 9500, 6.0, 5.5, 'Indlu Q1 2026', '2026-03-01'),
  ('Kraaifontein', 'Cape Town', 3, 10000, 7500, 13000, 6.0, 5.5, 'Indlu Q1 2026', '2026-03-01')

ON CONFLICT (area, region, bedrooms) DO UPDATE SET
  median_rent = EXCLUDED.median_rent,
  range_low = EXCLUDED.range_low,
  range_high = EXCLUDED.range_high,
  vacancy_pct = EXCLUDED.vacancy_pct,
  yoy_growth_pct = EXCLUDED.yoy_growth_pct,
  source = EXCLUDED.source,
  source_date = EXCLUDED.source_date,
  updated_at = now();
