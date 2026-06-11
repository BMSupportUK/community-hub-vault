DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.wc_fixtures WHERE status='FINISHED' AND home_score IS NOT NULL AND away_score IS NOT NULL LOOP
    PERFORM public.wc_score_fixture(r.id);
  END LOOP;
END$$;