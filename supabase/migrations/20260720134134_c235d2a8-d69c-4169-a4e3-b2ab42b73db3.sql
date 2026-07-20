
-- Fix Boro predictor results page pollution:
-- 1. Reset any future fixture wrongly marked FINISHED with 0-0 back to SCHEDULED with null scores.
UPDATE public.boro_fixtures
SET status = 'SCHEDULED', home_score = NULL, away_score = NULL, minute = NULL, minute_added = NULL
WHERE status = 'FINISHED'
  AND kickoff_at > now()
  AND (home_score = 0 OR home_score IS NULL)
  AND (away_score = 0 OR away_score IS NULL);

-- 2. Delete duplicate rows (same home/away/kickoff), keeping the oldest per set
--    and skipping any that already have predictions attached.
WITH ranked AS (
  SELECT f.id,
         row_number() OVER (
           PARTITION BY f.home_team, f.away_team, f.kickoff_at
           ORDER BY f.created_at NULLS LAST, f.id
         ) AS rn,
         (SELECT count(*) FROM public.boro_predictions p WHERE p.fixture_id = f.id) AS preds
  FROM public.boro_fixtures f
)
DELETE FROM public.boro_fixtures
WHERE id IN (SELECT id FROM ranked WHERE rn > 1 AND preds = 0);
