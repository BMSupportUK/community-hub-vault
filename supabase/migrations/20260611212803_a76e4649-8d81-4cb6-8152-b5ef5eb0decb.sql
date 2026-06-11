CREATE OR REPLACE FUNCTION public.wc_score_fixture(_fixture_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hs int; as_ int;
BEGIN
  SELECT home_score, away_score INTO hs, as_
  FROM public.wc_fixtures WHERE id = _fixture_id;
  -- Refuse to wipe points if the fixture has no score yet (a transient feed
  -- glitch could otherwise null out every prediction for a finished match).
  IF hs IS NULL OR as_ IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.wc_predictions
     SET points = public.wc_calc_points(home_pred, away_pred, hs, as_),
         updated_at = now()
   WHERE fixture_id = _fixture_id;
END;
$function$;

-- Re-score every finished fixture with a real score, restoring the leaderboard.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.wc_fixtures WHERE home_score IS NOT NULL AND away_score IS NOT NULL LOOP
    PERFORM public.wc_score_fixture(r.id);
  END LOOP;
END$$;