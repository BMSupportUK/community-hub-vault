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
        WHEN pen_winner = 'home' AND hp > ap THEN 1
        WHEN pen_winner = 'away' AND ap > hp THEN 1
        ELSE 0
      END)
  END
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.wc_fixtures WHERE home_score IS NOT NULL AND away_score IS NOT NULL LOOP
    PERFORM public.wc_score_fixture(r.id);
  END LOOP;
END$$;