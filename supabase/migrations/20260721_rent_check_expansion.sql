-- Rent Check: expanded suburb data (July 2026)
-- Adds granular splits (Claremont Upper, Bishopscourt, etc.) + missing suburbs
-- Run in Supabase SQL editor. Safe to re-run (ON CONFLICT upsert).

INSERT INTO rental_benchmarks (area, region, bedrooms, median_rent, range_low, range_high, vacancy_pct, yoy_growth_pct, source, source_date)
VALUES
  -- Claremont Upper (premium — significantly above Claremont proper)
  ('Claremont Upper', 'Cape Town', 2, 18000, 14000, 28000, 3.5, 7.0, 'Private Property Jul 2026, Seeff 2026', '2026-07-01'),
  ('Claremont Upper', 'Cape Town', 3, 28000, 20000, 40000, 4.0, 6.5, 'Private Property Jul 2026, Seeff 2026', '2026-07-01'),
  ('Claremont Upper', 'Cape Town', 4, 38000, 28000, 55000, 4.5, 6.0, 'Private Property Jul 2026, Seeff 2026', '2026-07-01'),

  -- Bishopscourt (ultra-premium, mostly houses)
  ('Bishopscourt', 'Cape Town', 3, 40000, 30000, 55000, 5.0, 5.0, 'Seeff Southern Suburbs 2026, Africanvestor Jul 2026', '2026-07-01'),
  ('Bishopscourt', 'Cape Town', 4, 55000, 40000, 80000, 5.5, 5.0, 'Seeff Southern Suburbs 2026, Africanvestor Jul 2026', '2026-07-01'),

  -- Tokai (family suburb, security estates)
  ('Tokai', 'Cape Town', 2, 12000, 9000, 16000, 4.5, 6.0, 'Seeff 2026, Africanvestor Jul 2026', '2026-07-01'),
  ('Tokai', 'Cape Town', 3, 20000, 15000, 28000, 4.5, 6.0, 'Seeff 2026, Africanvestor Jul 2026', '2026-07-01'),
  ('Tokai', 'Cape Town', 4, 30000, 22000, 42000, 5.0, 5.5, 'Seeff 2026, Africanvestor Jul 2026', '2026-07-01'),

  -- Bergvliet (mid-range family suburb)
  ('Bergvliet', 'Cape Town', 2, 11000, 8000, 15000, 4.5, 5.5, 'Private Property Jul 2026, Africanvestor Jul 2026', '2026-07-01'),
  ('Bergvliet', 'Cape Town', 3, 18000, 13000, 25000, 4.5, 5.5, 'Private Property Jul 2026, Africanvestor Jul 2026', '2026-07-01'),
  ('Bergvliet', 'Cape Town', 4, 25000, 18000, 35000, 5.0, 5.5, 'Private Property Jul 2026, Africanvestor Jul 2026', '2026-07-01'),

  -- Plumstead (affordable Southern Suburbs)
  ('Plumstead', 'Cape Town', 1, 6500, 5000, 8500, 4.0, 5.5, 'Seeff 2026, Private Property Jul 2026', '2026-07-01'),
  ('Plumstead', 'Cape Town', 2, 8000, 6500, 10500, 4.0, 5.5, 'Seeff 2026, Private Property Jul 2026', '2026-07-01'),
  ('Plumstead', 'Cape Town', 3, 12000, 9000, 16000, 4.5, 5.5, 'Seeff 2026, Private Property Jul 2026', '2026-07-01'),

  -- Diep River (affordable Southern Suburbs)
  ('Diep River', 'Cape Town', 1, 6500, 5000, 8500, 4.0, 5.5, 'Seeff 2026, Private Property Jul 2026', '2026-07-01'),
  ('Diep River', 'Cape Town', 2, 8500, 6500, 11000, 4.0, 5.5, 'Seeff 2026, Private Property Jul 2026', '2026-07-01'),
  ('Diep River', 'Cape Town', 3, 13000, 9500, 17000, 4.5, 5.5, 'Seeff 2026, Private Property Jul 2026', '2026-07-01'),

  -- Ottery (affordable)
  ('Ottery', 'Cape Town', 1, 6000, 4500, 8000, 5.0, 5.0, 'Private Property Jul 2026', '2026-07-01'),
  ('Ottery', 'Cape Town', 2, 8000, 6000, 10500, 5.0, 5.0, 'Private Property Jul 2026', '2026-07-01'),

  -- Rosebank (near UCT, student/professional)
  ('Rosebank', 'Cape Town', 1, 7500, 5500, 10000, 3.0, 6.5, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Rosebank', 'Cape Town', 2, 11000, 8000, 15000, 3.5, 6.5, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Three Anchor Bay (premium Atlantic Seaboard)
  ('Three Anchor Bay', 'Cape Town', 1, 11000, 8000, 15000, 3.5, 7.5, 'Seeff 2026, Africanvestor Jul 2026', '2026-07-01'),
  ('Three Anchor Bay', 'Cape Town', 2, 16000, 12000, 22000, 4.0, 7.5, 'Seeff 2026, Africanvestor Jul 2026', '2026-07-01'),
  ('Three Anchor Bay', 'Cape Town', 3, 22000, 16000, 30000, 4.5, 7.0, 'Seeff 2026, Africanvestor Jul 2026', '2026-07-01'),

  -- Mouille Point (premium coastal)
  ('Mouille Point', 'Cape Town', 1, 13000, 9000, 18000, 3.5, 7.5, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Mouille Point', 'Cape Town', 2, 20000, 14000, 30000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Clifton (ultra-premium)
  ('Clifton', 'Cape Town', 2, 40000, 28000, 60000, 6.0, 5.0, 'Africanvestor Jul 2026, Seeff 2026', '2026-07-01'),
  ('Clifton', 'Cape Town', 3, 60000, 40000, 90000, 6.5, 5.0, 'Africanvestor Jul 2026, Seeff 2026', '2026-07-01'),

  -- Bantry Bay (ultra-premium)
  ('Bantry Bay', 'Cape Town', 2, 35000, 25000, 55000, 5.5, 5.5, 'Africanvestor Jul 2026, Seeff 2026', '2026-07-01'),
  ('Bantry Bay', 'Cape Town', 3, 50000, 35000, 75000, 6.0, 5.0, 'Africanvestor Jul 2026, Seeff 2026', '2026-07-01'),

  -- V&A Waterfront (premium)
  ('V&A Waterfront', 'Cape Town', 1, 15000, 10000, 22000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-07-01'),
  ('V&A Waterfront', 'Cape Town', 2, 25000, 18000, 40000, 4.5, 6.5, 'Africanvestor Jul 2026', '2026-07-01'),
  ('V&A Waterfront', 'Cape Town', 3, 40000, 28000, 60000, 5.0, 6.0, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Tamboerskloof (City Bowl premium)
  ('Tamboerskloof', 'Cape Town', 1, 10000, 7500, 14000, 3.5, 7.0, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Tamboerskloof', 'Cape Town', 2, 15000, 11000, 22000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Oranjezicht (City Bowl premium)
  ('Oranjezicht', 'Cape Town', 1, 10500, 7500, 15000, 3.5, 7.0, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Oranjezicht', 'Cape Town', 2, 16000, 11000, 24000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Vredehoek (City Bowl mid-range)
  ('Vredehoek', 'Cape Town', 1, 9000, 6500, 12000, 3.5, 7.0, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Vredehoek', 'Cape Town', 2, 13000, 9500, 18000, 4.0, 7.0, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Milnerton (West Coast corridor)
  ('Milnerton', 'Cape Town', 1, 7000, 5000, 9500, 4.5, 6.0, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Milnerton', 'Cape Town', 2, 10000, 7500, 13500, 4.5, 6.0, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Milnerton', 'Cape Town', 3, 14000, 10000, 19000, 5.0, 6.0, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Blouberg (coastal alternative)
  ('Blouberg', 'Cape Town', 1, 7000, 5500, 9500, 5.0, 6.0, 'Seeff 2026, Africanvestor Jul 2026', '2026-07-01'),
  ('Blouberg', 'Cape Town', 2, 10000, 7500, 13500, 5.0, 6.0, 'Seeff 2026, Africanvestor Jul 2026', '2026-07-01'),
  ('Blouberg', 'Cape Town', 3, 14000, 10500, 19000, 5.0, 6.0, 'Seeff 2026, Africanvestor Jul 2026', '2026-07-01'),

  -- Kalk Bay (False Bay premium)
  ('Kalk Bay', 'Cape Town', 2, 12000, 8500, 17000, 5.0, 6.0, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Kalk Bay', 'Cape Town', 3, 18000, 13000, 26000, 5.5, 5.5, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Simons Town (False Bay)
  ('Simons Town', 'Cape Town', 2, 10000, 7000, 14000, 5.5, 5.5, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Simons Town', 'Cape Town', 3, 15000, 11000, 21000, 6.0, 5.0, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Noordhoek (south peninsula)
  ('Noordhoek', 'Cape Town', 2, 12000, 8500, 16000, 5.0, 6.0, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Noordhoek', 'Cape Town', 3, 18000, 13000, 25000, 5.5, 5.5, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Noordhoek', 'Cape Town', 4, 24000, 18000, 35000, 5.5, 5.5, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Kommetjie (south peninsula)
  ('Kommetjie', 'Cape Town', 2, 11000, 8000, 15000, 5.5, 5.5, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Kommetjie', 'Cape Town', 3, 16000, 12000, 22000, 6.0, 5.0, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Franschhoek (Winelands)
  ('Franschhoek', 'Western Cape', 2, 12000, 8500, 17000, 6.0, 5.5, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Franschhoek', 'Western Cape', 3, 18000, 13000, 26000, 6.5, 5.0, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Kuils River (Northern suburbs)
  ('Kuils River', 'Cape Town', 2, 7000, 5000, 9500, 5.5, 5.5, 'Indlu Q1 2026', '2026-07-01'),
  ('Kuils River', 'Cape Town', 3, 10000, 7500, 13500, 5.5, 5.5, 'Indlu Q1 2026', '2026-07-01'),

  -- Edgemead (Northern suburbs)
  ('Edgemead', 'Cape Town', 2, 8500, 6500, 11000, 5.0, 5.5, 'Africanvestor Jul 2026', '2026-07-01'),
  ('Edgemead', 'Cape Town', 3, 12000, 9000, 16000, 5.0, 5.5, 'Africanvestor Jul 2026', '2026-07-01'),

  -- Parow (affordable Northern)
  ('Parow', 'Cape Town', 1, 5500, 4000, 7500, 5.5, 5.0, 'Indlu Q1 2026', '2026-07-01'),
  ('Parow', 'Cape Town', 2, 7500, 5500, 10000, 5.5, 5.0, 'Indlu Q1 2026', '2026-07-01'),
  ('Parow', 'Cape Town', 3, 10500, 8000, 14000, 6.0, 5.0, 'Indlu Q1 2026', '2026-07-01')

ON CONFLICT (area, region, bedrooms) DO UPDATE SET
  median_rent = EXCLUDED.median_rent,
  range_low = EXCLUDED.range_low,
  range_high = EXCLUDED.range_high,
  vacancy_pct = EXCLUDED.vacancy_pct,
  yoy_growth_pct = EXCLUDED.yoy_growth_pct,
  source = EXCLUDED.source,
  source_date = EXCLUDED.source_date,
  updated_at = now();
