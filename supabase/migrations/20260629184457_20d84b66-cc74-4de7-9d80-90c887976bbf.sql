ALTER TABLE public.wc_fixtures
  ADD COLUMN IF NOT EXISTS pen_winner text
    CHECK (pen_winner IS NULL OR pen_winner IN ('home','away'));

CREATE OR REPLACE FUNCTION public.wc_calc_points(
  hp int, ap int, hs int, as_ int, pen_winner text DEFAULT NULL
) RETURNS int
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN hp IS NULL OR ap IS NULL OR hs IS NULL OR as_ IS NULL THEN NULL
    ELSE
      (CASE
        WHEN hp = hs AND ap = as_ THEN 5
        WHEN sign(hp - ap) = sign(hs - as_) AND (hp - ap) = (hs - as_) THEN 3
        WHEN sign(hp - ap) = sign(hs - as_) THEN 1
        ELSE 0
      END)
      +
      (CASE
        WHEN pen_winner IS NULL THEN 0
        WHEN pen_winner = 'home' AND hp > ap THEN 2
        WHEN pen_winner = 'away' AND ap > hp THEN 2
        ELSE 0
      END)
  END
$$;

CREATE OR REPLACE FUNCTION public.wc_score_fixture(_fixture_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hs int; as_ int; pw text;
BEGIN
  SELECT home_score, away_score, pen_winner INTO hs, as_, pw
  FROM public.wc_fixtures WHERE id = _fixture_id;
  IF hs IS NULL OR as_ IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.wc_predictions
     SET points = public.wc_calc_points(home_pred, away_pred, hs, as_, pw),
         updated_at = now()
   WHERE fixture_id = _fixture_id;
END;
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.wc_fixtures WHERE home_score IS NOT NULL AND away_score IS NOT NULL LOOP
    PERFORM public.wc_score_fixture(r.id);
  END LOOP;
END$$;