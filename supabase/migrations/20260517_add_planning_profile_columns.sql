-- Planning-profile persistence: cross-device sync for Smart Money Analysis + Scenario Planning.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- No new tables, no new RLS policies -- inherits existing profiles row-level security.

-- planning_profile: stores Recommendations.jsx answers + AI result + timestamps
--   { answers: {...}, result: {...}, answersUpdatedAt: ms, analysisRunAt: ms }
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS planning_profile JSONB;

-- scenario_state: stores Projections.jsx scenario planning state + freshness timestamp
--   { forecastMode, assumptions, horizonYears, customEvents, currentSavings, updatedAt: ms }
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS scenario_state JSONB;
